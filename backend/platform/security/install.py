"""Putting the request guard on an app: the one call each composition root makes.

`create_core_app()` and `create_service()` call `install_request_guard()` once
their app is built. It adds two middlewares — fastapi-guard's outermost, then
the access layer just inside it — and wraps the app's lifespan so that, at
startup and before any of the app's own lifecycles:

1. every route the process serves (mounts included, so `sdr-manager-local`'s
   API, mounted after `create_service()` returns, is covered) is checked
   against the policy's route rules. An unclassified route stops startup: a
   new endpoint can't ship reachable by accident;
2. each route group's protections are applied to its endpoints;
3. fastapi-guard initialises (Redis, the detection engine, country and cloud
   data), so the first request isn't the one that pays for it.

With GUARD_ENABLED=false it does nothing.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from backend.config import settings
from backend.platform.security.access import AccessRules
from backend.platform.security.access_middleware import AccessControlMiddleware, ServedRoutes
from backend.platform.security.bans import install_ban_rules
from backend.platform.security.config_builder import build_security_config, cloud_enabled, geo_enabled
from backend.platform.security.fail_open import make_behavior_tracking_fail_open
from backend.platform.security.global_rules import count_global_rules_per_client
from backend.platform.security.policy import GuardPolicy, load_policy
from backend.platform.security.route_groups import apply_route_groups
from backend.platform.security.route_inventory import attach_static_endpoints, iter_routes
from backend.platform.service_credentials import accepts_callers, identify_caller
from fastapi import Depends, FastAPI, Header, HTTPException
from guard import PureASGISecurityMiddleware, SecurityConfig, SecurityDecorator, SecurityMiddleware, ip_ban_manager
from guard.lifespan import make_lifespan

logger = logging.getLogger("sentinel.guard")

STATUS_PATH = "/internal/security/status"
_BEARER_PREFIX = "Bearer "


def classify_and_protect_routes(
    app: FastAPI,
    policy: GuardPolicy,
    access_rules: AccessRules,
    route_guard: SecurityDecorator,
    served_routes: ServedRoutes,
) -> dict[str, str]:
    """Check every route of `app` has a rule, and apply each group's protections.

    Records the routes in `served_routes`, so the access layer can tell a
    route served here from one served by another service. Returns
    `{endpoint: group}`. Raises `RouteClassificationError` for a route no
    rule covers.
    """
    attach_static_endpoints(app.routes)
    entries = list(iter_routes(app.routes))
    served_routes.learn(entries)
    groups = apply_route_groups(
        entries,
        policy,
        access_rules,
        route_guard,
        geo_enabled=geo_enabled(),
        cloud_enabled=cloud_enabled(),
    )
    logger.info("guard: %d endpoints protected in %d route groups", len(groups), len(set(groups.values())))
    return groups


def install_request_guard(app: FastAPI, *, service_name: str) -> None:
    """Add the guard to `app`, which must be built but not yet serving.

    `service_name` is the process's id (`core`, `space`, …), for telemetry.
    Raises `KeyError` for a GUARD_PROFILE the policy doesn't define and
    pydantic's `ValidationError` for an invalid policy file or GUARD_* value.
    """
    if not settings.guard_enabled:
        logger.warning("guard: GUARD_ENABLED=false — no access rules, rate limits or attack detection")
        return
    policy = load_policy()
    profile = policy.profile_settings(settings.guard_profile)
    security_config = build_security_config(profile, service_name=service_name)
    access_rules = AccessRules(policy, settings.guard_profile)
    route_guard = SecurityDecorator(security_config)
    # fastapi-guard finds the decorator through app.state; without it every
    # per-route protection is silently ignored.
    app.state.guard_decorator = route_guard
    if security_config.redis_fail_open:
        # fastapi-guard's behaviour rules use this tracker, global and per route.
        make_behavior_tracking_fail_open(route_guard.behavior_tracker)
    install_ban_rules(ip_ban_manager)
    # The policy's global rules (the `status:404` scanner rule…) count across
    # every path a client asks for, not separately per path.
    count_global_rules_per_client()
    served_routes = ServedRoutes()

    # Starlette runs the last-added middleware first: fastapi-guard, then access.
    app.add_middleware(
        AccessControlMiddleware,
        access_rules=access_rules,
        security_config=security_config,
        enforce=settings.guard_access_enforcement == "enforce" and not settings.guard_passive_mode,
        served_routes=served_routes,
        blocked_user_agents=profile.blocked_user_agents,
    )
    if profile.middleware == "pure_asgi":
        app.add_middleware(PureASGISecurityMiddleware, config=security_config)
    else:
        app.add_middleware(SecurityMiddleware, config=security_config)
    _add_status_route(app, security_config)

    app_lifespan = app.router.lifespan_context
    # Warms fastapi-guard's middleware (it finds it in app.user_middleware).
    guard_startup = make_lifespan(None)

    @asynccontextmanager
    async def guarded_lifespan(served_app: Any) -> AsyncIterator[Any]:
        classify_and_protect_routes(app, policy, access_rules, route_guard, served_routes)
        async with guard_startup(served_app), app_lifespan(served_app) as state:
            yield state

    app.router.lifespan_context = guarded_lifespan
    logger.info(
        "guard: profile %r, %s, %s state, access %s",
        settings.guard_profile,
        "passive" if settings.guard_passive_mode else "enforcing",
        "shared (Redis)" if security_config.enable_redis else "in-memory",
        settings.guard_access_enforcement,
    )


def _require_service_credential(authorization: str | None = Header(default=None)) -> None:
    """The bearer check every /internal/ route makes (as `internal_auth.require_caller`)."""
    if not accepts_callers():
        raise HTTPException(status_code=503, detail="Internal service access is disabled on this deployment")
    presented = (
        authorization[len(_BEARER_PREFIX) :] if authorization and authorization.startswith(_BEARER_PREFIX) else ""
    )
    if identify_caller(presented) is None:
        raise HTTPException(status_code=401, detail="Invalid service credential")


def _add_status_route(app: FastAPI, security_config: SecurityConfig) -> None:
    """`GET /internal/security/status`: how this process's guard is running, for a service credential."""

    async def guard_status() -> dict[str, Any]:
        return {
            "profile": settings.guard_profile,
            "passive_mode": security_config.passive_mode,
            "access_enforcement": settings.guard_access_enforcement,
            "shared_state": security_config.enable_redis,
            "emergency_mode": security_config.emergency_mode,
            "https_enforced": security_config.enforce_https,
            "countries_configured": bool(security_config.blocked_countries or security_config.whitelist_countries),
            "clouds_blocked": sorted(security_config.block_cloud_providers or ()),
        }

    app.add_api_route(
        STATUS_PATH,
        guard_status,
        methods=["GET"],
        include_in_schema=False,
        dependencies=[Depends(_require_service_credential)],
    )
    # First, not last: core's SPA catch-all (`/{full_path:path}`) is already
    # registered and would otherwise answer this path with index.html.
    app.router.routes.insert(0, app.router.routes.pop())
