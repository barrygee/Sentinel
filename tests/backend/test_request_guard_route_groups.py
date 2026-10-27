"""Applying a route group's protections to the endpoints its rules cover.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_route_groups.py
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest
from guard import SecurityDecorator
from guard_core.handlers.suspatterns_handler import ALL_DETECTION_CATEGORIES

from backend.platform.security.access import AccessRules
from backend.platform.security.config_builder import build_security_config
from backend.platform.security.policy import RouteGroup
from backend.platform.security.route_groups import (
    CUSTOM_VALIDATORS,
    RouteClassificationError,
    _no_query_string,
    apply_route_groups,
    group_decorators,
    policy_file_hint,
    sentinel_credential_verifier,
    unclassified_routes,
)
from backend.platform.security.route_inventory import RouteEntry
from tests.backend.request_guard_helpers import minimal_policy, pin_guard_settings
from tests.backend.service_credentials_test_helpers import TOKENS, accept_callers


@pytest.fixture(autouse=True)
def _known_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    pin_guard_settings(monkeypatch)


def recording_guard() -> MagicMock:
    """A SecurityDecorator stand-in: each method returns a label naming the call.

    `spec` makes a call to a method fastapi-guard doesn't have fail the test.
    """
    guard = MagicMock(spec=SecurityDecorator)
    for name in dir(SecurityDecorator):
        if not name.startswith("_"):
            getattr(guard, name).side_effect = lambda *arguments, _name=name, **options: (_name, arguments, options)
    return guard


def passthrough_guard() -> MagicMock:
    """A SecurityDecorator stand-in whose decorators return the endpoint unchanged."""
    guard = MagicMock(spec=SecurityDecorator)
    for name in dir(SecurityDecorator):
        if not name.startswith("_"):
            getattr(guard, name).side_effect = lambda *arguments, **options: lambda endpoint: endpoint
    return guard


def decorators_for(group: RouteGroup, **options: Any) -> list[tuple[str, tuple[Any, ...], dict[str, Any]]]:
    keyword_options = {"geo_enabled": False, "cloud_enabled": False, **options}
    return group_decorators(group, recording_guard(), **keyword_options)  # type: ignore[return-value]


def group(**fields: Any) -> RouteGroup:
    return RouteGroup(description="test group", **fields)


class TestGroupDecorators:
    def test_an_empty_group_adds_nothing(self) -> None:
        assert decorators_for(group()) == []

    def test_each_protection_in_a_stable_order(self) -> None:
        names = [
            name
            for name, _, _ in decorators_for(
                group(
                    bypass=["rate_limit"],
                    rate_limit={"requests": 5, "window_seconds": 10},
                    allowed_content_types=["application/json"],
                    max_request_bytes=1024,
                    honeypot_fields=["website"],
                    require_headers={"x-requested-with": "required"},
                    require_https=True,
                    allowed_ips=["192.168.1.0/24"],
                    blocked_user_agents=["sqlmap"],
                    time_window={"start": "08:00", "end": "18:00"},
                    behavior_rules=[{"type": "usage", "threshold": 3}],
                    custom_validators=["no_query_string"],
                )
            )
        ]

        assert names == [
            "bypass",
            "rate_limit",
            "content_type_filter",
            "max_request_size",
            "honeypot_detection",
            "require_headers",
            "require_https",
            "require_ip",
            "block_user_agents",
            "time_window",
            "behavior_analysis",
            "custom_validation",
        ]

    def test_arguments_are_passed_through(self) -> None:
        calls = dict(
            (name, (arguments, options))
            for name, arguments, options in decorators_for(
                group(
                    rate_limit={"requests": 5, "window_seconds": 10},
                    blocked_ips=["10.0.0.1"],
                    time_window={"start": "08:00", "end": "18:00", "timezone": "Europe/London"},
                )
            )
        )

        assert calls["rate_limit"] == ((5, 10), {})
        assert calls["require_ip"] == ((), {"whitelist": None, "blacklist": ["10.0.0.1"]})
        assert calls["time_window"] == (("08:00", "18:00", "Europe/London"), {})

    def test_detection_on_off(self) -> None:
        assert decorators_for(group(detection={"enabled": False})) == [("suspicious_detection", (False,), {})]

    def test_detection_exclusions(self) -> None:
        [(name, _, options)] = decorators_for(
            group(detection={"scan_body": False, "excluded_headers": ["x-a"], "excluded_params": ["q"]})
        )

        assert name == "detection_exclusion"
        assert options == {
            "headers": {"x-a"},
            "semantic_headers": None,
            "params": {"q"},
            "body_fields": None,
            "categories": None,
            "scan_body": False,
        }

    def test_a_detection_block_with_nothing_set_adds_nothing(self) -> None:
        assert decorators_for(group(detection={})) == []


class TestExcludedCategories:
    # fastapi-guard's `categories` are the ones a route RUNS. Passing the
    # exclusions themselves once made settings writes scan for SSRF only.

    def test_are_taken_out_of_the_profiles_categories(self) -> None:
        [(_, _, options)] = decorators_for(
            group(detection={"excluded_categories": ["ssrf"]}), profile_categories=["sqli", "xss", "ssrf"]
        )

        assert options["categories"] == {"sqli", "xss"}

    def test_are_taken_out_of_every_category_when_the_profile_names_none(self) -> None:
        [(_, _, options)] = decorators_for(group(detection={"excluded_categories": ["ssrf", "xml"]}))

        assert options["categories"] == set(ALL_DETECTION_CATEGORIES) - {"ssrf", "xml"}
        assert "sqli" in options["categories"]

    def test_the_route_really_scans_every_other_category(self) -> None:
        # With fastapi-guard's real decorator: what the route ends up scanning.
        profile = minimal_policy().profile_settings("core")
        route_guard = SecurityDecorator(build_security_config(profile, service_name="core"))

        async def save_setting() -> None:
            return None

        for decorator in group_decorators(
            group(detection={"excluded_categories": ["ssrf"]}),
            route_guard,
            geo_enabled=False,
            cloud_enabled=False,
            profile_categories=["sqli", "xss", "ssrf"],
        ):
            decorator(save_setting)
        route_config = route_guard.get_route_config(f"{save_setting.__module__}.{save_setting.__qualname__}")

        assert route_config is not None
        assert route_config.enabled_detection_categories == {"sqli", "xss"}


class TestAuthentication:
    def test_bearer(self) -> None:
        [(name, arguments, options)] = decorators_for(group(authentication="bearer"))

        assert (name, arguments, options) == ("require_auth", ("bearer",), {"verifier": sentinel_credential_verifier})

    def test_decoder_secret(self) -> None:
        [(name, arguments, options)] = decorators_for(group(authentication="decoder_secret"))

        assert (name, arguments, options) == (
            "api_key_auth",
            ("X-Decode-Secret",),
            {"verifier": sentinel_credential_verifier},
        )


class TestReferrer:
    def test_only_while_referrer_domains_are_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        assert decorators_for(group(require_referrer=True)) == []
        pin_guard_settings(monkeypatch, guard_allowed_referrer_domains="sentinel.lan, 192.168.1.20")

        assert decorators_for(group(require_referrer=True)) == [
            ("require_referrer", (["sentinel.lan", "192.168.1.20"],), {})
        ]


class TestMonitors:
    def test_each_kind(self) -> None:
        calls = decorators_for(
            group(
                monitors=[
                    {"kind": "usage", "threshold": 50, "window_seconds": 60, "action": "ban"},
                    {"kind": "frequency", "threshold": 2.5, "window_seconds": 10},
                    {"kind": "return_pattern", "threshold": 5, "pattern": "status:404"},
                ]
            )
        )

        assert calls == [
            ("usage_monitor", (50, 60, "ban"), {}),
            ("suspicious_frequency", (2.5, 10, "log"), {}),
            ("return_monitor", ("status:404", 5, 3600, "log"), {}),
        ]

    def test_behaviour_rules_become_fastapi_guard_rules(self) -> None:
        [(name, (rules,), _)] = decorators_for(
            group(behavior_rules=[{"type": "frequency", "threshold": 9, "window_seconds": 30, "action": "ban"}])
        )

        assert name == "behavior_analysis"
        assert (rules[0].rule_type, rules[0].threshold, rules[0].window, rules[0].action) == ("frequency", 9, 30, "ban")


class TestOnlineFeatures:
    geo_group = group(
        geo={"blocked_countries": ["RU"], "allowed_countries": ["GB"], "rate_limits": {"US": {"requests": 10}}},
        blocked_clouds=["AWS"],
    )

    def test_left_out_while_their_data_isnt_configured(self) -> None:
        assert decorators_for(self.geo_group) == []

    def test_applied_once_configured(self) -> None:
        calls = decorators_for(self.geo_group, geo_enabled=True, cloud_enabled=True)

        assert calls == [
            ("block_countries", (["RU"],), {}),
            ("allow_countries", (["GB"],), {}),
            ("geo_rate_limit", ({"US": (10, 60)},), {}),
            ("block_clouds", (["AWS"],), {}),
        ]

    def test_an_empty_geo_block_adds_nothing(self) -> None:
        assert decorators_for(group(geo={}), geo_enabled=True) == []


class TestCustomValidators:
    def test_an_unknown_one_is_a_policy_error(self) -> None:
        with pytest.raises(RouteClassificationError, match="unknown custom validator 'nope'"):
            decorators_for(group(custom_validators=["nope"]))

    def test_the_known_ones(self) -> None:
        assert set(CUSTOM_VALIDATORS) == {"no_query_string"}

    async def test_no_query_string_refuses_one(self) -> None:
        request = MagicMock(query_params={"probe": "1"}, url_path="/api/x")

        response = await _no_query_string(request)

        assert response is not None and response.status_code == 400

    async def test_no_query_string_lets_none_through(self) -> None:
        assert await _no_query_string(MagicMock(query_params={}, url_path="/api/x")) is None


class TestCredentialVerifier:
    def test_names_the_caller_a_credential_belongs_to(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        accept_callers(monkeypatch, tmp_path)

        assert sentinel_credential_verifier(MagicMock(), TOKENS["space"]) == "space"

    def test_refuses_an_unknown_credential(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        accept_callers(monkeypatch, tmp_path)

        assert sentinel_credential_verifier(MagicMock(), "not-a-token") is None

    def test_refuses_an_empty_credential(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        accept_callers(monkeypatch, tmp_path)

        assert sentinel_credential_verifier(MagicMock(), "") is None

    def test_refuses_everyone_when_this_process_accepts_no_callers(self) -> None:
        assert sentinel_credential_verifier(MagicMock(), TOKENS["space"]) is None


async def read_thing() -> None:
    return None


async def save_thing() -> None:
    return None


class TestApplyRouteGroups:
    def entries(self, *extra: RouteEntry) -> list[RouteEntry]:
        return [
            RouteEntry("GET", "/api/things/{thing_id}", read_thing),
            RouteEntry("PUT", "/api/things/{thing_id}", save_thing),
            RouteEntry("GET", "/{full_path:path}", read_thing),
            *extra,
        ]

    def apply(self, entries: list[RouteEntry], route_guard: Any = None) -> dict[str, str]:
        policy = minimal_policy()
        return apply_route_groups(
            entries,
            policy,
            AccessRules(policy, "core"),
            route_guard or passthrough_guard(),
            geo_enabled=False,
            cloud_enabled=False,
        )

    def test_returns_each_endpoints_group(self) -> None:
        # A static mount (no endpoint) has a rule but nothing to decorate.
        groups = self.apply(self.entries(RouteEntry("GET", "/internal/**", None)))

        assert groups == {f"{__name__}.read_thing": "default", f"{__name__}.save_thing": "settings_write"}

    def test_decorates_each_endpoint_with_its_groups_protections(self) -> None:
        route_guard = recording_guard()
        decorated: list[Callable[..., Any]] = []
        route_guard.detection_exclusion.side_effect = lambda **options: decorated.append
        policy = minimal_policy()

        apply_route_groups(
            self.entries(),
            policy,
            AccessRules(policy, "core"),
            route_guard,
            geo_enabled=False,
            cloud_enabled=False,
        )

        assert decorated == [save_thing]
        assert route_guard.detection_exclusion.call_args.kwargs["categories"] == set(ALL_DETECTION_CATEGORIES) - {
            "ssrf"
        }

    def test_uses_this_processs_profile_categories(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        pin_guard_settings(monkeypatch, guard_profile="other")
        route_guard = recording_guard()
        route_guard.detection_exclusion.side_effect = lambda **options: lambda endpoint: endpoint
        policy = minimal_policy()

        apply_route_groups(
            self.entries(),
            policy,
            AccessRules(policy, "other"),
            route_guard,
            geo_enabled=False,
            cloud_enabled=False,
        )

        assert route_guard.detection_exclusion.call_args.kwargs["categories"] == {"sqli", "xss"}

    def test_an_unclassified_route_stops_startup_and_is_named(self) -> None:
        with pytest.raises(RouteClassificationError) as refusal:
            self.apply(self.entries(RouteEntry("POST", "/api/new-endpoint", save_thing)))

        assert "POST /api/new-endpoint" in str(refusal.value)
        assert f"{__name__}.save_thing" in str(refusal.value)
        assert policy_file_hint() in str(refusal.value)

    def test_one_endpoint_in_two_groups_stops_startup(self) -> None:
        with pytest.raises(RouteClassificationError, match="two route groups"):
            self.apply(
                [
                    RouteEntry("GET", "/api/things/{thing_id}", save_thing),
                    RouteEntry("PUT", "/api/things/{thing_id}", save_thing),
                ]
            )

    def test_unclassified_routes_lists_only_those_without_a_rule(self) -> None:
        new_route = RouteEntry("GET", "/api/new-endpoint", read_thing)

        assert unclassified_routes(self.entries(new_route), AccessRules(minimal_policy(), "core")) == [new_route]
