"""Shared building blocks for the request-guard tests (`test_request_guard_*.py`).

A small policy that exercises every caller class without depending on the
shipped `guard-policy.json`, and the GUARD_* settings the guard reads, pinned
to known values so a developer's environment can't change a result.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import pytest

from backend.config import settings
from backend.platform.security.policy import GuardPolicy, load_policy

LAN_BROWSER_ADDRESS = "192.168.1.50"
INTERNET_ADDRESS = "203.0.113.9"
INTERNAL_ADDRESS = "172.28.0.140"
OPERATOR_ADDRESS = "192.168.1.5"

SAME_ORIGIN_FETCH = {"sec-fetch-site": "same-origin"}

_MINIMAL_POLICY: dict[str, Any] = {
    "version": 1,
    "defaults": {"rate_limit": {"requests": 1000, "window_seconds": 60}},
    "profiles": {"core": {}, "other": {"detection": {"categories": ["sqli", "xss"]}}},
    "access_classes": {
        "page": {"description": "the shell", "networks": ["$client_networks"]},
        "browser": {
            "description": "the SPA's API calls",
            "networks": ["$client_networks"],
            "fetch_sites": ["same-origin", "none"],
            "allow_missing_fetch_metadata": False,
        },
        "internal": {
            "description": "Sentinel's own processes",
            "networks": ["$loopback", "$internal_networks"],
        },
        "service": {
            "description": "a service with its credential",
            "networks": ["$loopback", "$internal_networks"],
            "required_headers": ["authorization"],
        },
        "operator": {
            "description": "the operator's machine",
            "networks": ["$operator_ips"],
        },
    },
    "route_groups": {
        "default": {"description": "everything else"},
        "health": {
            "description": "health checks",
            "rate_limit": {"requests": 5, "window_seconds": 60},
        },
        "settings_write": {
            "description": "settings writes",
            "detection": {"excluded_categories": ["ssrf"]},
        },
    },
    "route_rules": [
        {
            "paths": ["/health"],
            "methods": ["GET"],
            "access": ["internal", "operator"],
            "group": "health",
        },
        {"paths": ["/internal/**"], "access": ["service"]},
        {
            "paths": ["/api/things/{thing_id}"],
            "methods": ["GET"],
            "access": ["browser"],
        },
        {
            "paths": ["/api/things/{thing_id}"],
            "methods": ["PUT"],
            "access": ["browser"],
            "group": "settings_write",
        },
        {"paths": ["/ws/live"], "methods": ["WEBSOCKET"], "access": ["browser"]},
        {
            "paths": ["/api/other-only"],
            "methods": ["GET"],
            "access": ["browser"],
            "profiles": ["other"],
        },
        {
            "paths": ["/{full_path:path}"],
            "methods": ["GET"],
            "access": ["page"],
            "fallback": True,
        },
    ],
}


def minimal_policy_data() -> dict[str, Any]:
    """A fresh copy of the small test policy, safe to modify."""
    return copy.deepcopy(_MINIMAL_POLICY)


def minimal_policy(**overrides: Any) -> GuardPolicy:
    """The small test policy, validated, with top-level keys replaced by `overrides`."""
    return GuardPolicy.model_validate({**minimal_policy_data(), **overrides})


def write_policy(directory: Path, data: dict[str, Any] | None = None) -> Path:
    """Write a policy file (the small test policy by default) and return its path."""
    path = directory / "guard-policy.json"
    path.write_text(
        json.dumps(data if data is not None else minimal_policy_data()),
        encoding="utf-8",
    )
    return path


def pin_guard_settings(monkeypatch: pytest.MonkeyPatch, **overrides: Any) -> None:
    """Set every GUARD_* setting the guard reads to a known value, then apply `overrides`."""
    values: dict[str, Any] = {
        "guard_enabled": True,
        "guard_profile": "core",
        "guard_policy_file": "",
        "guard_passive_mode": False,
        "guard_access_enforcement": "enforce",
        "guard_redis_url": "",
        "guard_redis_password_file": "",
        "guard_redis_prefix": "sentinel_guard_test:",
        "guard_trusted_proxies": "",
        "guard_trusted_proxy_depth": 1,
        "guard_trust_forwarded_proto": False,
        "guard_internal_networks": "172.28.0.0/24",
        "guard_client_networks": "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8",
        "guard_service_hosts": "",
        "guard_decoder_hosts": "",
        "guard_peer_networks": "",
        "guard_operator_ips": f"{OPERATOR_ADDRESS}/32",
        "guard_exempt_ips": "",
        "guard_ip_allowlist": "",
        "guard_ip_blocklist": "",
        "guard_enforce_https": False,
        "guard_cors_allow_origins": "",
        "guard_allowed_referrer_domains": "",
        "guard_blocked_countries": "",
        "guard_allowed_countries": "",
        "guard_ipinfo_token": "",
        "guard_ipinfo_db_path": "",
        "guard_block_cloud_providers": "",
        "guard_emergency_mode": False,
        "guard_emergency_allowlist": "",
        "guard_log_file": "",
        "guard_log_format": "text",
        "guard_agent_api_key": "",
        "guard_agent_project_id": "",
        "guard_agent_endpoint": "",
        "guard_enable_dynamic_rules": False,
        "guard_enable_otel": False,
        "guard_otel_endpoint": "",
        "guard_enable_logfire": False,
    }
    values.update(overrides)
    for name, value in values.items():
        assert hasattr(settings, name), f"unknown setting {name}"
        monkeypatch.setattr(settings, name, value)
    # The policy is cached per process; a test that points at another file
    # must not get the previous test's.
    load_policy.cache_clear()
