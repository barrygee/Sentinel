"""The request-guard policy file: its schema, profile merging and loading.

Covers the shipped `backend/security/guard-policy.json` too: it must load,
every profile must merge into valid settings, and the decisions it encodes
(no SSRF scanning on a LAN app, a browser must send Fetch Metadata) are pinned.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_policy.py
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from backend.platform.security.policy import (
    DEFAULT_POLICY_PATH,
    BehaviorRule,
    GuardPolicy,
    Monitor,
    _deep_merge,
    load_policy,
    policy_path,
    read_policy,
)
from tests.backend.request_guard_helpers import (
    minimal_policy,
    minimal_policy_data,
    pin_guard_settings,
    write_policy,
)


@pytest.fixture(autouse=True)
def _known_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    pin_guard_settings(monkeypatch)


class TestShippedPolicy:
    def test_loads_and_every_profile_is_valid(self) -> None:
        policy = read_policy(DEFAULT_POLICY_PATH)

        assert set(policy.profiles) == {
            "core",
            "section",
            "radio_hub",
            "docs",
            "sdr_manager_remote",
            "sdr_manager_local",
        }
        for profile_name in policy.profiles:
            policy.profile_settings(profile_name)

    def test_no_profile_scans_for_ssrf(self) -> None:
        # Sentinel is a LAN app: the SSRF check matches the browser's own
        # localhost/LAN Referer and the LAN addresses users type in.
        policy = read_policy(DEFAULT_POLICY_PATH)

        for profile_name in policy.profiles:
            categories = policy.profile_settings(profile_name).detection.categories
            assert categories, f"{profile_name}: an empty list means every category, ssrf included"
            assert "ssrf" not in categories, profile_name

    def test_a_browser_must_say_the_request_came_from_this_site(self) -> None:
        browser = read_policy(DEFAULT_POLICY_PATH).access_classes["browser"]

        assert browser.allow_missing_fetch_metadata is False
        assert "cross-site" not in browser.fetch_sites

    def test_only_requests_that_send_data_are_scanned(self) -> None:
        # Scanning every request cost ~40 ms of CPU each (mostly the browser's
        # own headers), on every poll; reads take no input worth scanning.
        policy = read_policy(DEFAULT_POLICY_PATH)

        for profile_name in policy.profiles:
            assert policy.profile_settings(profile_name).detection.enabled is False, profile_name
        assert sorted(
            name for name, group in policy.route_groups.items() if group.detection and group.detection.enabled
        ) == ["body_free_action", "console_login", "expensive_jobs", "json_write", "radio_control"]

    def test_settings_writes_bodies_arent_scanned(self) -> None:
        # Scanning a large setting held core up past a service's 5 s timeout at startup.
        group = read_policy(DEFAULT_POLICY_PATH).route_groups["settings_write"]

        assert group.detection is not None
        assert group.detection.scan_body is False
        assert group.honeypot_fields == ["website"]
        assert group.max_request_bytes == 1_048_576

    def test_decoder_ingest_bodies_are_never_scanned(self) -> None:
        # Decoded RF text is written by anyone with a transmitter (ADR 0008).
        group = read_policy(DEFAULT_POLICY_PATH).route_groups["decoder_ingest"]

        assert group.detection is not None
        assert group.detection.scan_body is False


class TestValidation:
    def test_an_unknown_key_stops_loading(self) -> None:
        data = minimal_policy_data()
        data["route_groups"]["default"]["rate_limt"] = {"requests": 1}

        with pytest.raises(ValidationError, match="rate_limt"):
            GuardPolicy.model_validate(data)

    def test_a_rule_naming_an_undefined_access_class_stops_loading(self) -> None:
        data = minimal_policy_data()
        del data["access_classes"]["operator"]

        with pytest.raises(ValidationError, match=r"undefined access classes: \['operator'\]"):
            GuardPolicy.model_validate(data)

    def test_a_rule_naming_an_undefined_group_stops_loading(self) -> None:
        data = minimal_policy_data()
        data["route_rules"][0]["group"] = "nonexistent"

        with pytest.raises(ValidationError, match=r"undefined route groups: \['nonexistent'\]"):
            GuardPolicy.model_validate(data)

    def test_a_rule_naming_an_undefined_profile_stops_loading(self) -> None:
        data = minimal_policy_data()
        data["route_rules"][0]["profiles"] = ["nowhere"]

        with pytest.raises(ValidationError, match=r"undefined profiles: \['nowhere'\]"):
            GuardPolicy.model_validate(data)

    def test_a_bad_profile_override_fails_at_load_not_at_that_services_start(
        self,
    ) -> None:
        data = minimal_policy_data()
        data["profiles"]["other"] = {"rate_limit": {"requests": 0}}

        with pytest.raises(ValidationError, match="greater than 0"):
            GuardPolicy.model_validate(data)

    def test_a_rule_needs_a_path_and_a_caller_class(self) -> None:
        data = minimal_policy_data()
        data["route_rules"].append({"paths": [], "access": []})

        with pytest.raises(ValidationError):
            GuardPolicy.model_validate(data)

    def test_the_policy_is_immutable(self) -> None:
        with pytest.raises(ValidationError):
            minimal_policy().route_rules[0].paths = ["/elsewhere"]  # type: ignore[misc]

    def test_a_return_pattern_behaviour_rule_needs_a_pattern(self) -> None:
        with pytest.raises(ValidationError, match="needs a pattern"):
            BehaviorRule(type="return_pattern", threshold=5)

    def test_other_behaviour_rules_need_no_pattern(self) -> None:
        assert BehaviorRule(type="usage", threshold=5).pattern is None

    def test_a_return_pattern_monitor_needs_a_pattern(self) -> None:
        with pytest.raises(ValidationError, match="needs a pattern"):
            Monitor(kind="return_pattern", threshold=5)

    def test_other_monitors_need_no_pattern(self) -> None:
        assert Monitor(kind="frequency", threshold=0.5).pattern is None

    @pytest.mark.parametrize("bad_time", ["24:00", "9:00", "12:60", "noon"])
    def test_a_time_window_takes_hh_mm(self, bad_time: str) -> None:
        data = minimal_policy_data()
        data["route_groups"]["default"]["time_window"] = {
            "start": bad_time,
            "end": "18:00",
        }

        with pytest.raises(ValidationError):
            GuardPolicy.model_validate(data)

    def test_the_schema_reference_is_accepted(self) -> None:
        policy = GuardPolicy.model_validate({**minimal_policy_data(), "$schema": "guard-policy.schema.json"})

        assert policy.schema_ref == "guard-policy.schema.json"


class TestProfileSettings:
    def test_a_profile_is_the_defaults_with_its_overrides_merged_in(self) -> None:
        policy = minimal_policy()

        core = policy.profile_settings("core")
        other = policy.profile_settings("other")

        assert core.rate_limit.requests == other.rate_limit.requests == 1000
        assert (core.detection.categories, other.detection.categories) == (
            [],
            ["sqli", "xss"],
        )

    def test_an_unknown_profile_is_a_key_error_naming_the_known_ones(self) -> None:
        with pytest.raises(
            KeyError,
            match=r"'nowhere' is not in the policy \(known: \['core', 'other'\]\)",
        ):
            minimal_policy().profile_settings("nowhere")


class TestDeepMerge:
    def test_nested_objects_merge_and_anything_else_replaces(self) -> None:
        base = {
            "detection": {"enabled": True, "scan_body": True},
            "headers": ["a"],
            "level": 1,
        }
        override = {"detection": {"scan_body": False}, "headers": ["b"], "level": 2}

        assert _deep_merge(base, override) == {
            "detection": {"enabled": True, "scan_body": False},
            "headers": ["b"],
            "level": 2,
        }

    def test_neither_input_is_changed(self) -> None:
        base = {"detection": {"enabled": True}}
        override = {"detection": {"enabled": False}, "extra": {"key": "value"}}

        merged = _deep_merge(base, override)
        merged["detection"]["enabled"] = "changed"
        merged["extra"]["key"] = "changed"

        assert base == {"detection": {"enabled": True}}
        assert override == {"detection": {"enabled": False}, "extra": {"key": "value"}}

    def test_an_object_replaces_a_non_object(self) -> None:
        assert _deep_merge({"detection": None}, {"detection": {"enabled": True}}) == {"detection": {"enabled": True}}


class TestLoading:
    def test_reads_the_bundled_policy_by_default(self) -> None:
        assert policy_path() == DEFAULT_POLICY_PATH
        assert DEFAULT_POLICY_PATH == Path(__file__).resolve().parents[2] / "backend" / "security" / "guard-policy.json"

    def test_guard_policy_file_points_elsewhere(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        path = write_policy(tmp_path)
        pin_guard_settings(monkeypatch, guard_policy_file=str(path))

        assert policy_path() == path
        assert set(load_policy().profiles) == {"core", "other"}

    def test_is_read_once(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        path = write_policy(tmp_path)
        pin_guard_settings(monkeypatch, guard_policy_file=str(path))
        first = load_policy()
        path.write_text("{not json", encoding="utf-8")

        assert load_policy() is first

    def test_a_missing_file_is_an_error(self, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            read_policy(tmp_path / "absent.json")

    def test_invalid_json_is_an_error(self, tmp_path: Path) -> None:
        path = tmp_path / "guard-policy.json"
        path.write_text("{not json", encoding="utf-8")

        with pytest.raises(json.JSONDecodeError):
            read_policy(path)
