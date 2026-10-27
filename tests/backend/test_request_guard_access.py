"""Who may call what: route rules (first match wins) and caller classes.

Deny by default: a request no rule matches, or a caller outside the rule's
classes, is refused. These tests prove both directions for every class.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_access.py
"""

from __future__ import annotations

import pytest
from starlette.datastructures import Headers

from backend.platform.security.access import (
    AccessRules,
    CompiledAccessClass,
    compile_path_pattern,
    qualifies,
)
from tests.backend.request_guard_helpers import (
    INTERNAL_ADDRESS,
    INTERNET_ADDRESS,
    LAN_BROWSER_ADDRESS,
    OPERATOR_ADDRESS,
    SAME_ORIGIN_FETCH,
    minimal_policy,
    minimal_policy_data,
    pin_guard_settings,
)


@pytest.fixture(autouse=True)
def _known_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    pin_guard_settings(monkeypatch)


@pytest.fixture
def rules() -> AccessRules:
    return AccessRules(minimal_policy(), "core")


def headers(**values: str) -> Headers:
    """Case-insensitive request headers, as Starlette gives the middleware."""
    return Headers({name.replace("_", "-"): value for name, value in values.items()})


class TestCompilePathPattern:
    @pytest.mark.parametrize(
        ("pattern", "path", "matches"),
        [
            ("/api/things/{thing_id}", "/api/things/42", True),
            ("/api/things/{thing_id}", "/api/things/", False),
            ("/api/things/{thing_id}", "/api/things/42/more", False),
            ("/api/*/status", "/api/space/status", True),
            ("/api/*/status", "/api/space/sub/status", False),
            ("/internal/**", "/internal/registry/register", True),
            ("/internal/**", "/internal/", True),
            ("/internal/**", "/internalx", False),
            ("/{full_path:path}", "/any/depth/at/all", True),
            ("/api/v1.0/x", "/api/v1.0/x", True),
            ("/api/v1.0/x", "/api/v1-0/x", False),
        ],
    )
    def test_matches(self, pattern: str, path: str, matches: bool) -> None:
        assert bool(compile_path_pattern(pattern).fullmatch(path)) is matches

    def test_a_template_parameter_matches_as_one_segment(self) -> None:
        # The startup check matches route *templates* against the rules.
        assert compile_path_pattern("/api/things/{thing_id}").fullmatch("/api/things/{thing_id}")


class TestRuleFor:
    def test_the_first_matching_rule_wins(self, rules: AccessRules) -> None:
        rule = rules.rule_for("PUT", "/api/things/7")

        assert rule is not None
        assert rule.rule.group == "settings_write"

    def test_methods_are_case_insensitive(self, rules: AccessRules) -> None:
        assert rules.rule_for("put", "/api/things/7") is rules.rule_for("PUT", "/api/things/7")

    def test_head_counts_as_get(self, rules: AccessRules) -> None:
        rule = rules.rule_for("HEAD", "/health")

        assert rule is not None
        assert rule.rule.paths == ["/health"]

    def test_a_rule_without_methods_covers_every_method(self, rules: AccessRules) -> None:
        for method in ("GET", "POST", "DELETE", "WEBSOCKET"):
            rule = rules.rule_for(method, "/internal/registry/register")
            assert rule is not None and rule.rule.access == ["service"]

    def test_a_method_the_rules_dont_name_falls_through(self, rules: AccessRules) -> None:
        # DELETE /api/things/7: no things rule names it, so only the fallback (GET) could — and doesn't.
        assert rules.rule_for("DELETE", "/api/things/7") is None

    def test_nothing_matches_is_none(self) -> None:
        data = minimal_policy_data()
        data["route_rules"] = [rule for rule in data["route_rules"] if not rule.get("fallback")]

        assert AccessRules(minimal_policy(route_rules=data["route_rules"]), "core").rule_for("GET", "/nope") is None

    def test_a_profile_only_rule_applies_only_in_that_profile(self) -> None:
        core = AccessRules(minimal_policy(), "core").rule_for("GET", "/api/other-only")
        other = AccessRules(minimal_policy(), "other").rule_for("GET", "/api/other-only")

        assert core is not None and core.rule.fallback  # only the catch-all
        assert other is not None and other.rule.access == ["browser"]


class TestExplicitRuleFor:
    def test_a_fallback_doesnt_classify_routes_it_merely_matches(self, rules: AccessRules) -> None:
        # A new endpoint can't hide behind the SPA catch-all.
        assert rules.rule_for("GET", "/api/new-endpoint") is not None
        assert rules.explicit_rule_for("GET", "/api/new-endpoint") is None

    def test_a_fallback_classifies_its_own_template(self, rules: AccessRules) -> None:
        rule = rules.explicit_rule_for("GET", "/{full_path:path}")

        assert rule is not None and rule.rule.fallback

    def test_an_ordinary_rule_classifies_its_templates(self, rules: AccessRules) -> None:
        rule = rules.explicit_rule_for("get", "/api/things/{thing_id}")

        assert rule is not None and rule.rule.access == ["browser"]


class TestCallerClasses:
    def test_a_lan_browser_on_its_own_page(self, rules: AccessRules) -> None:
        assert rules.caller_classes(LAN_BROWSER_ADDRESS, headers(**{"sec-fetch-site": "same-origin"})) == {
            "page",
            "browser",
        }

    def test_a_lan_script_is_a_page_visitor_but_not_the_browser(self, rules: AccessRules) -> None:
        assert rules.caller_classes(LAN_BROWSER_ADDRESS, headers()) == {"page"}

    def test_an_internet_address_is_nobody(self, rules: AccessRules) -> None:
        assert rules.caller_classes(INTERNET_ADDRESS, headers(**{"sec-fetch-site": "same-origin"})) == set()

    def test_a_sentinel_process_with_and_without_its_credential(self, rules: AccessRules) -> None:
        # 172.28.0.140 is also a private (client) address, so it is a page visitor too.
        assert rules.caller_classes(INTERNAL_ADDRESS, headers()) == {"page", "internal"}
        assert rules.caller_classes(INTERNAL_ADDRESS, headers(authorization="Bearer x")) == {
            "page",
            "internal",
            "service",
        }

    def test_the_operator(self, rules: AccessRules) -> None:
        assert "operator" in rules.caller_classes(OPERATOR_ADDRESS, headers())
        assert "operator" not in rules.caller_classes(LAN_BROWSER_ADDRESS, headers())


class TestAllows:
    def test_admits_a_caller_in_one_of_the_rules_classes(self, rules: AccessRules) -> None:
        rule = rules.rule_for("GET", "/health")

        assert rule is not None
        assert rules.allows(rule, INTERNAL_ADDRESS, headers())
        assert rules.allows(rule, OPERATOR_ADDRESS, headers())

    def test_refuses_a_caller_outside_them(self, rules: AccessRules) -> None:
        rule = rules.rule_for("GET", "/health")

        assert rule is not None
        assert not rules.allows(rule, LAN_BROWSER_ADDRESS, headers(**{"sec-fetch-site": "same-origin"}))

    def test_a_service_route_needs_the_credential_header(self, rules: AccessRules) -> None:
        rule = rules.rule_for("POST", "/internal/registry/register")

        assert rule is not None
        assert not rules.allows(rule, INTERNAL_ADDRESS, headers())
        assert not rules.allows(rule, INTERNAL_ADDRESS, headers(authorization=""))
        assert rules.allows(rule, INTERNAL_ADDRESS, headers(authorization="Bearer token"))

    def test_the_credential_header_doesnt_help_from_outside(self, rules: AccessRules) -> None:
        rule = rules.rule_for("POST", "/internal/registry/register")

        assert rule is not None
        assert not rules.allows(rule, LAN_BROWSER_ADDRESS, headers(authorization="Bearer token"))
        assert not rules.allows(rule, INTERNET_ADDRESS, headers(authorization="Bearer token"))

    def test_a_class_the_profile_doesnt_define_admits_nobody(self, rules: AccessRules) -> None:
        rule = rules.rule_for("GET", "/health")
        assert rule is not None
        del rules.classes["internal"]

        assert not rules.allows(rule, INTERNAL_ADDRESS, headers())

    def test_a_bad_network_in_a_class_fails_when_compiled(self) -> None:
        data = minimal_policy_data()
        data["access_classes"]["operator"]["networks"] = ["not-an-address"]

        with pytest.raises(ValueError, match="not-an-address"):
            AccessRules(minimal_policy(access_classes=data["access_classes"]), "core")


class TestBrowserRequests:
    @pytest.fixture
    def browser(self, rules: AccessRules) -> CompiledAccessClass:
        return rules.classes["browser"]

    @pytest.mark.parametrize("fetch_site", ["same-origin", "none"])
    def test_its_own_page_or_the_address_bar(self, browser: CompiledAccessClass, fetch_site: str) -> None:
        assert qualifies(browser, LAN_BROWSER_ADDRESS, headers(**{"sec-fetch-site": fetch_site}))

    @pytest.mark.parametrize("fetch_site", ["cross-site", "same-site", "made-up"])
    def test_another_site_driving_the_browser_is_refused(self, browser: CompiledAccessClass, fetch_site: str) -> None:
        assert not qualifies(browser, LAN_BROWSER_ADDRESS, headers(**{"sec-fetch-site": fetch_site}))

    def test_fetch_metadata_decides_over_a_matching_origin(self, browser: CompiledAccessClass) -> None:
        request_headers = headers(
            **{"sec-fetch-site": "cross-site"},
            origin="http://sentinel.lan",
            host="sentinel.lan",
        )

        assert not qualifies(browser, LAN_BROWSER_ADDRESS, request_headers)

    def test_without_fetch_metadata_an_origin_naming_this_host_is_accepted(self, browser: CompiledAccessClass) -> None:
        request_headers = headers(origin="http://Sentinel.lan:8080", host="sentinel.lan:8080")

        assert qualifies(browser, LAN_BROWSER_ADDRESS, request_headers)

    @pytest.mark.parametrize(
        ("origin", "host"),
        [
            ("http://evil.example", "sentinel.lan:8080"),
            ("http://sentinel.lan:9999", "sentinel.lan:8080"),
            ("null", "sentinel.lan:8080"),
            ("http://sentinel.lan:8080", ""),
        ],
    )
    def test_without_fetch_metadata_any_other_origin_is_refused(
        self, browser: CompiledAccessClass, origin: str, host: str
    ) -> None:
        assert not qualifies(browser, LAN_BROWSER_ADDRESS, headers(origin=origin, host=host))

    def test_without_fetch_metadata_or_origin_the_class_decides(self, rules: AccessRules) -> None:
        refusing = rules.classes["browser"]
        data = minimal_policy_data()
        data["access_classes"]["browser"]["allow_missing_fetch_metadata"] = True
        allowing = AccessRules(minimal_policy(access_classes=data["access_classes"]), "core").classes["browser"]

        assert not qualifies(refusing, LAN_BROWSER_ADDRESS, headers())
        assert qualifies(allowing, LAN_BROWSER_ADDRESS, headers())

    def test_a_good_browser_from_outside_the_client_networks_is_refused(self, browser: CompiledAccessClass) -> None:
        assert not qualifies(browser, INTERNET_ADDRESS, headers(**SAME_ORIGIN_FETCH))
