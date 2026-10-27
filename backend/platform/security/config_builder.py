"""Building fastapi-guard's `SecurityConfig` from one policy profile plus the GUARD_* settings.

The policy decides behaviour (limits, detection, headers); settings decide
everything per deployment (addresses, Redis, secrets) and switch on the
features that reach the internet — country data, cloud ranges, the hosted
agent, telemetry — which stay off until their token or flag is set.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from backend.config import settings
from backend.platform.security import hooks
from backend.platform.security.networks import expand_network_tokens, split_setting
from backend.platform.security.policy import ProfileSettings
from guard import SecurityConfig


def redis_url() -> str | None:
    """GUARD_REDIS_URL with the password from GUARD_REDIS_PASSWORD_FILE, or None for in-memory.

    Raises `OSError` if the password file is set but unreadable: starting
    without the shared state would quietly split bans per process.
    """
    url = settings.guard_redis_url.strip()
    if not url:
        return None
    if not settings.guard_redis_password_file:
        return url
    password = Path(settings.guard_redis_password_file).read_text(encoding="utf-8").strip()
    scheme, separator, rest = url.partition("://")
    # `redis://user@host` → `redis://user:<password>@host`; no user → the default one.
    user, _, host = rest.rpartition("@")
    return f"{scheme}{separator}{user}:{password}@{host}"


def geo_enabled() -> bool:
    """Whether country rules can run: they need the IPInfo database (its token)."""
    return bool(settings.guard_ipinfo_token)


def cloud_enabled() -> bool:
    """Whether cloud-provider blocking is switched on (it fetches ranges online)."""
    return bool(split_setting(settings.guard_block_cloud_providers))


def _ipinfo_db_path() -> Path:
    if settings.guard_ipinfo_db_path:
        return Path(settings.guard_ipinfo_db_path)
    # Beside the database, so it lands on the data volume rather than in the image.
    return Path(settings.db_path).resolve().parent / "ipinfo" / "country_asn.mmdb"


def _security_headers(profile: ProfileSettings) -> dict[str, Any] | None:
    headers = profile.security_headers
    if not headers.enabled:
        return None
    return {
        "enabled": True,
        # Strict-Transport-Security only where HTTPS is enforced: on Sentinel's
        # own plain-HTTP :8080 it would make browsers refuse the address.
        "hsts": (
            {
                "max_age": headers.hsts_max_age_seconds,
                "include_subdomains": headers.hsts_include_subdomains,
                "preload": headers.hsts_preload,
            }
            if settings.guard_enforce_https
            else None
        ),
        # The shell's CSP is spa_csp.py's (hashes of its inline scripts); a
        # second, generic one here would contradict it.
        "csp": None,
        "frame_options": headers.frame_options,
        "content_type_options": headers.content_type_options,
        "xss_protection": headers.xss_protection,
        "referrer_policy": headers.referrer_policy,
        "permissions_policy": headers.permissions_policy,
        "custom": dict(headers.custom) or None,
    }


def _agent_fields(profile: ProfileSettings) -> dict[str, Any]:
    if not settings.guard_agent_api_key:
        return {"enable_agent": False, "enable_dynamic_rules": False}
    fields: dict[str, Any] = {
        "enable_agent": True,
        "agent_api_key": settings.guard_agent_api_key,
        "agent_project_id": settings.guard_agent_project_id or None,
        "agent_buffer_size": profile.agent.buffer_size,
        "agent_flush_interval": profile.agent.flush_interval_seconds,
        "agent_enable_events": profile.agent.send_events,
        "agent_enable_metrics": profile.agent.send_metrics,
        "enable_dynamic_rules": settings.guard_enable_dynamic_rules,
        "dynamic_rule_interval": profile.agent.dynamic_rule_interval_seconds,
    }
    if settings.guard_agent_endpoint:
        fields["agent_endpoint"] = settings.guard_agent_endpoint
    return fields


def build_security_config(profile: ProfileSettings, *, service_name: str) -> SecurityConfig:
    """fastapi-guard's config for this process.

    `service_name` labels telemetry (OpenTelemetry / Logfire). Raises
    pydantic's `ValidationError` for a value fastapi-guard refuses (a bad
    CIDR in GUARD_TRUSTED_PROXIES, an unknown cloud provider…).
    """
    shared_state_url = redis_url()
    detection = profile.detection
    auto_ban = profile.auto_ban
    threat_bans: dict[str, dict[str, int]] = {
        category: {"threshold": ban.threshold, "duration": ban.duration_seconds}
        for category, ban in auto_ban.threat_bans.items()
    }
    if auto_ban.count_rate_limit_violations:
        threat_bans["rate_limit"] = {
            "threshold": auto_ban.rate_limit_threshold,
            "duration": auto_ban.rate_limit_ban_seconds,
        }
    cors_origins = split_setting(settings.guard_cors_allow_origins)
    blocked_countries = split_setting(settings.guard_blocked_countries)
    allowed_countries = split_setting(settings.guard_allowed_countries)
    cloud_providers = split_setting(settings.guard_block_cloud_providers)

    fields: dict[str, Any] = {
        # Who the client is.
        "trusted_proxies": tuple(split_setting(settings.guard_trusted_proxies)),
        "trusted_proxy_depth": settings.guard_trusted_proxy_depth,
        "trust_x_forwarded_proto": settings.guard_trust_forwarded_proto,
        # Address lists.
        "whitelist": tuple(split_setting(settings.guard_ip_allowlist)) or None,
        "blacklist": tuple(split_setting(settings.guard_ip_blocklist)),
        "exempt_ips": tuple(expand_network_tokens(["$exempt_ips"])),
        # Countries and clouds: only with their data source.
        "blocked_countries": frozenset(blocked_countries) if geo_enabled() else frozenset(),
        "whitelist_countries": frozenset(allowed_countries) if geo_enabled() else frozenset(),
        "ipinfo_token": settings.guard_ipinfo_token or None,
        "ipinfo_db_path": _ipinfo_db_path(),
        "geo_ip_db_max_age": profile.geo_database_max_age_seconds,
        "block_cloud_providers": frozenset(cloud_providers) or None,
        "cloud_ip_refresh_interval": profile.cloud_refresh_interval_seconds,
        # Rate limits and bans.
        "enable_rate_limiting": True,
        "rate_limit": profile.rate_limit.requests,
        "rate_limit_window": profile.rate_limit.window_seconds,
        "enable_ip_banning": auto_ban.enabled,
        "auto_ban_threshold": auto_ban.threshold,
        "auto_ban_duration": auto_ban.duration_seconds,
        "enable_rate_limit_auto_ban": auto_ban.count_rate_limit_violations,
        "threat_ban_config": threat_bans,
        "blocked_user_agents": list(profile.blocked_user_agents),
        # Attack detection.
        "enable_penetration_detection": detection.enabled,
        "detection_scan_body": detection.scan_body,
        "detection_max_body_inspect_bytes": detection.max_body_inspect_bytes,
        "detection_max_content_length": detection.max_content_length,
        "detection_max_scan_seconds": detection.max_scan_seconds,
        "detection_semantic_threshold": detection.semantic_threshold,
        "detection_anomaly_threshold": detection.anomaly_threshold,
        "detection_threat_score_threshold": detection.threat_score_threshold,
        "excluded_detection_headers": frozenset(header.lower() for header in detection.excluded_headers),
        "excluded_semantic_detection_headers": frozenset(
            header.lower() for header in detection.excluded_semantic_headers
        ),
        "excluded_detection_params": frozenset(detection.excluded_params),
        "excluded_detection_body_fields": frozenset(detection.excluded_body_fields),
        "exclude_paths": list(profile.exclude_paths),
        "global_behavior_rules": tuple(
            {
                "rule_type": rule.type,
                "threshold": rule.threshold,
                "window": rule.window_seconds,
                "pattern": rule.pattern,
                "action": rule.action,
                "ban_duration": rule.ban_duration_seconds,
            }
            for rule in profile.behavior_rules
        ),
        # Responses.
        "enforce_https": settings.guard_enforce_https,
        "security_headers": _security_headers(profile),
        "enable_cors": bool(cors_origins),
        "cors_allow_origins": cors_origins,
        "cors_allow_methods": list(profile.cors.allow_methods),
        "cors_allow_headers": list(profile.cors.allow_headers),
        "cors_allow_credentials": profile.cors.allow_credentials,
        "cors_expose_headers": list(profile.cors.expose_headers),
        "cors_max_age": profile.cors.max_age_seconds,
        "custom_error_responses": dict(profile.error_messages),
        "custom_response_modifier": hooks.json_error_responses,
        "on_block": hooks.log_block,
        "on_error": hooks.log_guard_error,
        # Failure behaviour.
        "passive_mode": settings.guard_passive_mode,
        "fail_secure": profile.fail_secure,
        "redis_fail_open": profile.redis_fail_open,
        "emergency_mode": settings.guard_emergency_mode,
        "emergency_whitelist": split_setting(settings.guard_emergency_allowlist),
        # Shared state.
        "enable_redis": shared_state_url is not None,
        "redis_url": shared_state_url or "redis://localhost:6379",
        "redis_prefix": settings.guard_redis_prefix,
        # Logging.
        "custom_log_file": settings.guard_log_file or None,
        "log_format": settings.guard_log_format,
        "log_suspicious_level": profile.logging.suspicious_level,
        "log_request_level": profile.logging.request_level,
        "muted_check_logs": frozenset(profile.logging.muted_checks),
        "log_sensitive_headers": frozenset(header.lower() for header in profile.logging.sensitive_headers),
        "log_sensitive_params": frozenset(profile.logging.sensitive_params),
        "log_sensitive_body_fields": frozenset(profile.logging.sensitive_body_fields),
        # Telemetry.
        "enable_otel": settings.guard_enable_otel,
        "otel_service_name": f"sentinel-{service_name}",
        "otel_exporter_endpoint": settings.guard_otel_endpoint or None,
        "enable_logfire": settings.guard_enable_logfire,
        "logfire_service_name": f"sentinel-{service_name}",
        **_agent_fields(profile),
    }
    if profile.detection.categories:
        fields["enabled_detection_categories"] = frozenset(profile.detection.categories)
    return SecurityConfig(**fields)
