"""The request guard: fastapi-guard on every Sentinel process, driven by one policy file (ADR 0008).

- `policy.py` — the policy file's schema and loading (`backend/security/guard-policy.json`)
- `networks.py` — the `$name` address lists the policy refers to, from GUARD_* settings
- `access.py` — route rules and caller classes: who may call what (deny by default)
- `access_middleware.py` — the ASGI layer enforcing them, for HTTP and WebSockets
- `route_groups.py` — each route group's fastapi-guard decorators, applied at startup
- `config_builder.py` — fastapi-guard's `SecurityConfig` from a profile + settings
- `hooks.py` — JSON refusals and refusal logging
- `install.py` — `install_request_guard()`, the one call each composition root makes
- `cli.py` — `python -m backend.platform.security.cli`: check the policy, list or lift bans

Operator guide: docs/security-guard.md.
"""

from backend.platform.security.install import install_request_guard

__all__ = ["install_request_guard"]
