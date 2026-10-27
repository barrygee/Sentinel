"""Applying a policy route group's protections to the endpoints its rules cover.

fastapi-guard attaches per-route protection by decorating the endpoint
function (it records a config against the function and leaves the function
itself unchanged, so signatures and the OpenAPI schema don't move). Sentinel's
routes are classified in the policy file rather than in code, so this applies
those decorators at startup instead of at import: for each route, the group of
the first rule that matches it.

An endpoint can be served at two paths (`sdr-manager-local` mounts its API at
`/api/sdr-manager/local` and `/api`). Its decorators are per function, so the
two paths' rules must name the same group; access, which is per path, may
differ.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Iterable
from typing import Any

from backend.config import settings
from backend.platform.security.access import AccessRules
from backend.platform.security.networks import split_setting
from backend.platform.security.policy import BehaviorRule, GuardPolicy, RouteGroup
from backend.platform.security.route_inventory import RouteEntry
from backend.platform.service_credentials import accepts_callers, identify_caller
from guard import BehaviorRule as GuardBehaviorRule
from guard import SecurityDecorator
from guard.adapters import StarletteGuardResponse
from guard_core.handlers.suspatterns_handler import ALL_DETECTION_CATEGORIES
from guard_core.protocols.request_protocol import GuardRequest
from guard_core.protocols.response_protocol import GuardResponse
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

Validator = Callable[[GuardRequest], Awaitable[GuardResponse | None]]


class RouteClassificationError(RuntimeError):
    """Routes no rule classifies, or one endpoint given two groups."""


async def _no_query_string(request: GuardRequest) -> GuardResponse | None:
    # For routes that take no query parameters: anything there is someone probing.
    if request.query_params:
        logger.info("guard: refused a query string on %s", request.url_path)
        return _plain_refusal(400, "Unexpected query parameters")
    return None


def _plain_refusal(status_code: int, detail: str) -> GuardResponse:
    return StarletteGuardResponse(JSONResponse({"detail": detail}, status_code=status_code))


CUSTOM_VALIDATORS: dict[str, Validator] = {
    "no_query_string": _no_query_string,
}
"""Validators a route group may name in `custom_validators`."""


def sentinel_credential_verifier(request: GuardRequest, credential: str) -> str | None:
    """fastapi-guard `auth_verifier`: the Sentinel caller a bearer or decoder secret belongs to.

    The same hash lookup `require_caller` / `require_decoder` do; those still
    decide what the caller may do. None (refused) when this process accepts
    no callers.
    """
    if not credential or not accepts_callers():
        return None
    return identify_caller(credential)


def _guard_behavior_rule(rule: BehaviorRule) -> GuardBehaviorRule:
    return GuardBehaviorRule(
        rule_type=rule.type,
        threshold=rule.threshold,
        window=rule.window_seconds,
        pattern=rule.pattern,
        action=rule.action,
        ban_duration=rule.ban_duration_seconds,
    )


def group_decorators(
    group: RouteGroup,
    route_guard: SecurityDecorator,
    *,
    geo_enabled: bool,
    cloud_enabled: bool,
    profile_categories: Iterable[str] = (),
) -> list[Callable[[Callable[..., Any]], Any]]:
    """The fastapi-guard decorators that implement `group`, in a stable order.

    Country and cloud rules are left out while their data source isn't
    configured: fastapi-guard would otherwise refuse to start without it.
    `profile_categories` is the detection categories this process runs
    (empty = every category); a group's `excluded_categories` are taken
    out of it.
    """
    decorators: list[Callable[[Callable[..., Any]], Any]] = []
    if group.bypass:
        decorators.append(route_guard.bypass(list(group.bypass)))
    if group.rate_limit:
        decorators.append(route_guard.rate_limit(group.rate_limit.requests, group.rate_limit.window_seconds))
    if group.allowed_content_types:
        decorators.append(route_guard.content_type_filter(list(group.allowed_content_types)))
    if group.max_request_bytes:
        decorators.append(route_guard.max_request_size(group.max_request_bytes))
    if group.detection is not None:
        detection = group.detection
        if detection.enabled is not None:
            decorators.append(route_guard.suspicious_detection(detection.enabled))
        if any(
            (
                detection.scan_body is not None,
                detection.excluded_headers,
                detection.excluded_semantic_headers,
                detection.excluded_params,
                detection.excluded_body_fields,
                detection.excluded_categories,
            )
        ):
            decorators.append(
                route_guard.detection_exclusion(
                    headers=set(detection.excluded_headers) or None,
                    semantic_headers=set(detection.excluded_semantic_headers) or None,
                    params=set(detection.excluded_params) or None,
                    body_fields=set(detection.excluded_body_fields) or None,
                    # fastapi-guard's `categories` are the ones a route RUNS, so
                    # pass what is left after the exclusions; passing the
                    # exclusions themselves would scan for only those.
                    categories=(
                        (set(profile_categories) or set(ALL_DETECTION_CATEGORIES)) - set(detection.excluded_categories)
                    )
                    if detection.excluded_categories
                    else None,
                    scan_body=detection.scan_body,
                )
            )
    if group.honeypot_fields:
        decorators.append(route_guard.honeypot_detection(list(group.honeypot_fields)))
    referrer_domains = split_setting(settings.guard_allowed_referrer_domains)
    if group.require_referrer and referrer_domains:
        decorators.append(route_guard.require_referrer(referrer_domains))
    if group.authentication == "bearer":
        decorators.append(route_guard.require_auth("bearer", verifier=sentinel_credential_verifier))
    elif group.authentication == "decoder_secret":
        decorators.append(route_guard.api_key_auth("X-Decode-Secret", verifier=sentinel_credential_verifier))
    if group.require_headers:
        decorators.append(route_guard.require_headers(dict(group.require_headers)))
    if group.require_https:
        decorators.append(route_guard.require_https())
    if group.allowed_ips or group.blocked_ips:
        decorators.append(
            route_guard.require_ip(whitelist=list(group.allowed_ips) or None, blacklist=list(group.blocked_ips) or None)
        )
    if group.blocked_user_agents:
        decorators.append(route_guard.block_user_agents(list(group.blocked_user_agents)))
    if group.time_window:
        window = group.time_window
        decorators.append(route_guard.time_window(window.start, window.end, window.timezone))
    for monitor in group.monitors:
        if monitor.kind == "usage":
            decorators.append(route_guard.usage_monitor(int(monitor.threshold), monitor.window_seconds, monitor.action))
        elif monitor.kind == "frequency":
            decorators.append(
                route_guard.suspicious_frequency(monitor.threshold, monitor.window_seconds, monitor.action)
            )
        else:
            decorators.append(
                route_guard.return_monitor(
                    monitor.pattern or "", int(monitor.threshold), monitor.window_seconds, monitor.action
                )
            )
    if group.behavior_rules:
        decorators.append(route_guard.behavior_analysis([_guard_behavior_rule(rule) for rule in group.behavior_rules]))
    if group.geo and geo_enabled:
        if group.geo.blocked_countries:
            decorators.append(route_guard.block_countries(list(group.geo.blocked_countries)))
        if group.geo.allowed_countries:
            decorators.append(route_guard.allow_countries(list(group.geo.allowed_countries)))
        if group.geo.rate_limits:
            decorators.append(
                route_guard.geo_rate_limit(
                    {
                        country: (limit.requests, limit.window_seconds)
                        for country, limit in group.geo.rate_limits.items()
                    }
                )
            )
    if group.blocked_clouds and cloud_enabled:
        decorators.append(route_guard.block_clouds(list(group.blocked_clouds)))
    for validator_name in group.custom_validators:
        if validator_name not in CUSTOM_VALIDATORS:
            raise RouteClassificationError(
                f"unknown custom validator {validator_name!r} (known: {sorted(CUSTOM_VALIDATORS)})"
            )
        decorators.append(route_guard.custom_validation(CUSTOM_VALIDATORS[validator_name]))
    return decorators


def unclassified_routes(entries: Iterable[RouteEntry], access_rules: AccessRules) -> list[RouteEntry]:
    """The routes no non-fallback rule covers: each needs a rule in the policy."""
    return [entry for entry in entries if access_rules.explicit_rule_for(entry.method, entry.path) is None]


def apply_route_groups(
    entries: Iterable[RouteEntry],
    policy: GuardPolicy,
    access_rules: AccessRules,
    route_guard: SecurityDecorator,
    *,
    geo_enabled: bool,
    cloud_enabled: bool,
) -> dict[str, str]:
    """Decorate every classified endpoint with its group's protections.

    Returns `{endpoint name: group}`. Raises `RouteClassificationError` when a
    route has no rule, or one endpoint is put in two different groups.
    """
    route_entries = list(entries)
    missing = unclassified_routes(route_entries, access_rules)
    if missing:
        listing = "\n  ".join(f"{entry.method} {entry.path} ({entry.endpoint_name})" for entry in missing)
        raise RouteClassificationError(
            "These routes have no rule in the guard policy, so no caller could reach them. "
            f"Add them to route_rules in {policy_file_hint()}:\n  {listing}"
        )
    groups_by_endpoint: dict[Callable[..., Any], str] = {}
    for entry in route_entries:
        rule = access_rules.explicit_rule_for(entry.method, entry.path)
        if entry.endpoint is None or rule is None:
            continue
        group_name = rule.rule.group
        assigned = groups_by_endpoint.setdefault(entry.endpoint, group_name)
        if assigned != group_name:
            raise RouteClassificationError(
                f"{entry.endpoint_name} is served under two route groups ({assigned!r}, {group_name!r}); "
                "its rules must name one group"
            )
    profile_categories = policy.profile_settings(settings.guard_profile).detection.categories
    for endpoint, group_name in groups_by_endpoint.items():
        for decorator in group_decorators(
            policy.route_groups[group_name],
            route_guard,
            geo_enabled=geo_enabled,
            cloud_enabled=cloud_enabled,
            profile_categories=profile_categories,
        ):
            decorator(endpoint)
    return {
        f"{endpoint.__module__}.{endpoint.__qualname__}": group_name
        for endpoint, group_name in groups_by_endpoint.items()
    }


def policy_file_hint() -> str:
    """The policy file's path, for error messages."""
    from backend.platform.security.policy import policy_path

    return str(policy_path())
