"""fastapi-guard's SecurityConfig from a policy profile plus the GUARD_* settings.

The policy decides behaviour; settings decide addresses, secrets and the
features that reach the internet, which stay off until their token or flag is set.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_config_builder.py
"""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.config import settings
from backend.platform.security import hooks
from backend.platform.security.config_builder import (
    _ipinfo_db_path,
    build_security_config,
    cloud_enabled,
    geo_enabled,
    redis_url,
)
from backend.platform.security.policy import DEFAULT_POLICY_PATH, ProfileSettings, read_policy
from tests.backend.request_guard_helpers import minimal_policy, minimal_policy_data, pin_guard_settings


@pytest.fixture(autouse=True)
def _known_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    pin_guard_settings(monkeypatch)


def profile(**overrides: object) -> ProfileSettings:
    """The test policy's `core` profile with `overrides` merged over its defaults."""
    data = minimal_policy_data()
    data["defaults"].update(overrides)
    return minimal_policy(defaults=data["defaults"]).profile_settings("core")


class TestRedisUrl:
    def test_no_url_is_in_memory_state(self) -> None:
        assert redis_url() is None

    def test_a_url_without_a_password_file_is_used_as_is(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_redis_url=" redis://redis:6379/0 ")

        assert redis_url() == "redis://redis:6379/0"

    def test_the_password_goes_after_the_user(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        password_file = tmp_path / "guard-state-password"
        password_file.write_text("s3cret\n", encoding="utf-8")
        pin_guard_settings(
            monkeypatch, guard_redis_url="redis://sentinel@redis:6379/0", guard_redis_password_file=str(password_file)
        )

        assert redis_url() == "redis://sentinel:s3cret@redis:6379/0"

    def test_without_a_user_the_password_is_the_default_users(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        password_file = tmp_path / "guard-state-password"
        password_file.write_text("s3cret", encoding="utf-8")
        pin_guard_settings(
            monkeypatch, guard_redis_url="redis://redis:6379/0", guard_redis_password_file=str(password_file)
        )

        assert redis_url() == "redis://:s3cret@redis:6379/0"

    def test_an_unreadable_password_file_stops_startup(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
        # Starting without the shared state would quietly split bans per process.
        pin_guard_settings(
            monkeypatch,
            guard_redis_url="redis://sentinel@redis:6379/0",
            guard_redis_password_file=str(tmp_path / "missing"),
        )

        with pytest.raises(OSError):
            redis_url()


class TestOnlineFeatureSwitches:
    def test_country_rules_need_an_ipinfo_token(self, monkeypatch: pytest.MonkeyPatch) -> None:
        assert not geo_enabled()
        pin_guard_settings(monkeypatch, guard_ipinfo_token="token")

        assert geo_enabled()

    def test_cloud_blocking_needs_a_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        assert not cloud_enabled()
        pin_guard_settings(monkeypatch, guard_block_cloud_providers=" , ")
        assert not cloud_enabled()
        pin_guard_settings(monkeypatch, guard_block_cloud_providers="AWS")

        assert cloud_enabled()

    def test_the_ipinfo_database_sits_beside_the_database(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(settings, "db_path", str(tmp_path / "data" / "sentinel.db"))

        assert _ipinfo_db_path() == (tmp_path / "data").resolve() / "ipinfo" / "country_asn.mmdb"

    def test_the_ipinfo_database_path_can_be_set(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_ipinfo_db_path="/srv/geo.mmdb")

        assert _ipinfo_db_path() == Path("/srv/geo.mmdb")


class TestBuildSecurityConfig:
    def test_who_the_client_is(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_trusted_proxies="172.28.0.2", guard_trusted_proxy_depth=1)

        config = build_security_config(profile(), service_name="core")

        assert list(config.trusted_proxies) == ["172.28.0.2"]
        assert config.trusted_proxy_depth == 1

    def test_rate_limits_and_bans_from_the_profile(self) -> None:
        config = build_security_config(
            profile(
                rate_limit={"requests": 300, "window_seconds": 30},
                auto_ban={
                    "threshold": 4,
                    "duration_seconds": 120,
                    "rate_limit_threshold": 9,
                    "rate_limit_ban_seconds": 45,
                    "threat_bans": {"sqli": {"threshold": 1, "duration_seconds": 86400}},
                },
            ),
            service_name="core",
        )

        assert (config.rate_limit, config.rate_limit_window) == (300, 30)
        assert (config.auto_ban_threshold, config.auto_ban_duration) == (4, 120)
        assert config.enable_rate_limit_auto_ban is True
        sqli_ban, rate_limit_ban = config.threat_ban_config["sqli"], config.threat_ban_config["rate_limit"]
        assert (sqli_ban.threshold, sqli_ban.duration) == (1, 86400)
        assert (rate_limit_ban.threshold, rate_limit_ban.duration) == (9, 45)

    def test_rate_limit_refusals_can_be_left_out_of_bans(self) -> None:
        config = build_security_config(profile(auto_ban={"count_rate_limit_violations": False}), service_name="core")

        assert config.enable_rate_limit_auto_ban is False
        assert "rate_limit" not in config.threat_ban_config

    def test_sentinels_own_containers_are_exempt_by_default(self) -> None:
        assert list(build_security_config(profile(), service_name="core").exempt_ips) == ["172.28.0.0/24"]

    def test_detection_categories_when_the_profile_names_them(self) -> None:
        config = build_security_config(profile(detection={"categories": ["sqli", "xss"]}), service_name="core")

        assert set(config.enabled_detection_categories) == {"sqli", "xss"}

    def test_every_category_when_the_profile_names_none(self) -> None:
        config = build_security_config(profile(), service_name="core")

        assert "ssrf" in config.enabled_detection_categories
        assert "sqli" in config.enabled_detection_categories

    def test_detection_exclusions_are_lower_cased_headers(self) -> None:
        config = build_security_config(
            profile(detection={"excluded_headers": ["Authorization"], "excluded_semantic_headers": ["User-Agent"]}),
            service_name="core",
        )

        assert "authorization" in config.excluded_detection_headers
        assert "user-agent" in config.excluded_semantic_detection_headers

    def test_country_rules_stay_off_without_their_data(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_blocked_countries="RU", guard_allowed_countries="GB")

        config = build_security_config(profile(), service_name="core")

        assert not config.blocked_countries
        assert not config.whitelist_countries

    def test_cors_only_with_an_origin(self, monkeypatch: pytest.MonkeyPatch) -> None:
        assert build_security_config(profile(), service_name="core").enable_cors is False
        pin_guard_settings(monkeypatch, guard_cors_allow_origins="http://dev.lan:5173")

        config = build_security_config(profile(), service_name="core")

        assert config.enable_cors is True
        assert config.cors_allow_origins == ["http://dev.lan:5173"]

    def test_hsts_only_while_https_is_enforced(self, monkeypatch: pytest.MonkeyPatch) -> None:
        plain = build_security_config(profile(), service_name="core")
        pin_guard_settings(monkeypatch, guard_enforce_https=True)
        enforced = build_security_config(profile(), service_name="core")

        assert plain.security_headers is not None and plain.security_headers["hsts"] is None
        assert enforced.security_headers is not None and enforced.security_headers["hsts"]["max_age"] == 31_536_000

    def test_no_csp_here_because_the_shell_sets_its_own(self) -> None:
        headers = build_security_config(profile(), service_name="core").security_headers

        assert headers is not None and headers["csp"] is None

    def test_custom_headers_and_none_when_switched_off(self) -> None:
        custom = build_security_config(profile(security_headers={"custom": {"X-Test": "1"}}), service_name="core")
        disabled = build_security_config(profile(security_headers={"enabled": False}), service_name="core")

        assert custom.security_headers is not None and custom.security_headers["custom"] == {"X-Test": "1"}
        assert disabled.security_headers is None

    def test_sentinels_hooks_are_wired(self) -> None:
        config = build_security_config(profile(), service_name="core")

        # The plain-HTTP default: JSON errors, minus the secure-context-only headers.
        assert config.custom_response_modifier.__name__ == "json_errors_without_secure_context_headers"
        assert config.on_block is hooks.log_block
        assert config.on_error is hooks.log_guard_error

    def test_coop_and_coep_are_kept_while_https_is_enforced(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_enforce_https=True)

        assert build_security_config(profile(), service_name="core").custom_response_modifier is (
            hooks.json_error_responses
        )

    def test_redis_only_with_a_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        assert build_security_config(profile(), service_name="core").enable_redis is False
        pin_guard_settings(monkeypatch, guard_redis_url="redis://redis:6379/0")

        config = build_security_config(profile(), service_name="core")

        assert config.enable_redis is True
        assert config.redis_url == "redis://redis:6379/0"

    def test_the_hosted_agent_stays_off_without_a_key(self) -> None:
        config = build_security_config(profile(), service_name="core")

        assert (config.enable_agent, config.enable_dynamic_rules) == (False, False)

    def test_the_hosted_agent_with_a_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(
            monkeypatch,
            guard_agent_api_key="key",
            guard_agent_project_id="project",
            guard_agent_endpoint="https://agent.example",
            guard_enable_dynamic_rules=True,
        )

        config = build_security_config(profile(agent={"buffer_size": 7}), service_name="core")

        assert (config.enable_agent, config.agent_project_id, config.agent_buffer_size) == (True, "project", 7)
        assert config.agent_endpoint == "https://agent.example"
        assert config.enable_dynamic_rules is True

    def test_the_hosted_agent_keeps_its_default_endpoint(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_agent_api_key="key")
        default_endpoint = build_security_config(profile(), service_name="core").agent_endpoint

        assert default_endpoint and default_endpoint != "https://agent.example"

    def test_telemetry_is_named_after_the_service(self) -> None:
        config = build_security_config(profile(), service_name="space")

        assert (config.otel_service_name, config.logfire_service_name) == ("sentinel-space", "sentinel-space")

    def test_passive_mode_and_emergency_mode_follow_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(
            monkeypatch,
            guard_passive_mode=True,
            guard_emergency_mode=True,
            guard_emergency_allowlist="192.168.1.5",
        )

        config = build_security_config(profile(), service_name="core")

        assert (config.passive_mode, config.emergency_mode) == (True, True)
        assert list(config.emergency_whitelist) == ["192.168.1.5"]

    def test_a_value_fastapi_guard_refuses_is_an_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_trusted_proxies="not-an-address")

        with pytest.raises(ValueError):
            build_security_config(profile(), service_name="core")


class TestBlockedUserAgents:
    def test_fastapi_guard_gets_none_because_sentinel_checks_them(self) -> None:
        config = build_security_config(profile(blocked_user_agents=["sqlmap", "nikto"]), service_name="core")

        assert config.blocked_user_agents == []

    def test_startup_runs_no_regex_safety_check(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # fastapi-guard checks each regex in a subprocess with a 0.5 s limit; a
        # busy machine or a Pi missed it and the service refused to start.
        from guard_core.detection_engine.compiler import PatternCompiler

        def refuse(*arguments: object, **options: object) -> None:
            raise AssertionError("a user-agent regex was validated at startup")

        monkeypatch.setattr(PatternCompiler, "validate_pattern_safety", refuse)
        shipped = read_policy(DEFAULT_POLICY_PATH).profile_settings("core")

        build_security_config(shipped, service_name="core")
