"""The request-guard policy file: its schema, and loading one profile of it (ADR 0008).

`backend/security/guard-policy.json` says, per process profile, how the guard
behaves — rate limits, bans, attack detection, headers — and, for every route
of every Sentinel service, who may call it (`route_rules`) and which per-route
protections apply (`route_groups`). Everything here validates with
`extra="forbid"`: fastapi-guard's own `SecurityConfig` only logs an unknown
key, so a typo there silently does nothing, while here it stops the process at
startup with the key's location.

A profile is the `defaults` block with that profile's overrides deep-merged
over it (`profiles.<name>`), so a profile states only what differs.
"""

from __future__ import annotations

import json
from copy import deepcopy
from functools import cache
from pathlib import Path
from typing import Annotated, Any, Literal

from backend.config import settings
from pydantic import BaseModel, ConfigDict, Field, model_validator

# Next to backend/config.py: backend/security/guard-policy.json.
DEFAULT_POLICY_PATH = Path(__file__).resolve().parents[2] / "security" / "guard-policy.json"

CallerClass = Literal["page", "browser", "internal", "service", "decoder", "peer", "operator"]
"""Who a route is for. `access.py` says how each is recognised."""

BehaviorAction = Literal["ban", "log", "throttle", "alert"]
"""What fastapi-guard does when a behaviour rule trips (`throttle` and `alert` only log)."""

DetectionCategory = Literal[
    "xss",
    "sqli",
    "dir_traversal",
    "path_traversal",
    "cmd_injection",
    "file_inclusion",
    "ldap",
    "xml",
    "ssrf",
    "nosql",
    "file_upload",
    "template",
    "http_split",
    "sensitive_file",
    "cms_probing",
    "recon",
    "proto_pollution",
    "code_injection",
    "deserialization",
]
"""fastapi-guard's penetration-detection categories (guard-core 4.4)."""

GuardCheck = Literal["all", "ip_ban", "ip", "clouds", "rate_limit", "penetration"]
"""The checks a route group may bypass."""

PositiveInt = Annotated[int, Field(gt=0)]

UserAgentWord = Annotated[str, Field(min_length=2, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9._\- ]*$")]
"""A word a blocked User-Agent contains: letters, digits, `.`, `_`, `-` and spaces, no regex syntax."""


class _Strict(BaseModel):
    """Base for every policy model: unknown keys are an error, values are immutable."""

    model_config = ConfigDict(extra="forbid", frozen=True)


class RateLimit(_Strict):
    """At most `requests` per `window_seconds`, per client address."""

    requests: PositiveInt
    window_seconds: PositiveInt = 60


class ThreatBan(_Strict):
    """Ban an address for `duration_seconds` after `threshold` detections of one category."""

    threshold: PositiveInt
    duration_seconds: PositiveInt


class AutoBan(_Strict):
    """When repeated bad requests get an address banned."""

    enabled: bool = True
    threshold: PositiveInt = 10
    duration_seconds: PositiveInt = 3600
    # Count rate-limit refusals towards a ban (`rate_limit_threshold` of them).
    count_rate_limit_violations: bool = True
    rate_limit_threshold: PositiveInt = 20
    rate_limit_ban_seconds: PositiveInt = 900
    # Stricter thresholds for the categories that are never a false positive.
    threat_bans: dict[DetectionCategory, ThreatBan] = Field(default_factory=dict)


class Detection(_Strict):
    """Penetration-attempt detection over query strings, headers and bodies."""

    enabled: bool = True
    # Empty = every category.
    categories: list[DetectionCategory] = Field(default_factory=list)
    scan_body: bool = True
    excluded_headers: list[str] = Field(default_factory=list)
    excluded_semantic_headers: list[str] = Field(default_factory=list)
    excluded_params: list[str] = Field(default_factory=list)
    excluded_body_fields: list[str] = Field(default_factory=list)
    max_body_inspect_bytes: PositiveInt = 262_144
    max_content_length: PositiveInt = 10_000
    max_scan_seconds: float = Field(default=10.0, gt=0)
    semantic_threshold: float = Field(default=0.7, ge=0, le=1)
    anomaly_threshold: float = Field(default=3.0, gt=0)
    threat_score_threshold: float = Field(default=1.0, gt=0)


class SecurityHeaders(_Strict):
    """Headers added to every response. No CSP here: `spa_csp.py` owns the shell's."""

    enabled: bool = True
    frame_options: Literal["DENY", "SAMEORIGIN"] = "SAMEORIGIN"
    content_type_options: Literal["nosniff"] = "nosniff"
    xss_protection: str = "0"
    referrer_policy: str = "strict-origin-when-cross-origin"
    permissions_policy: str = "geolocation=(self), microphone=(), camera=(), payment=(), usb=()"
    # Sent only while HTTPS is enforced (GUARD_ENFORCE_HTTPS): over plain HTTP
    # a browser would pin a scheme the LAN address can't serve.
    hsts_max_age_seconds: PositiveInt = 31_536_000
    hsts_include_subdomains: bool = False
    hsts_preload: bool = False
    custom: dict[str, str] = Field(default_factory=dict)


class Cors(_Strict):
    """CORS answers, used only when GUARD_CORS_ALLOW_ORIGINS names an origin."""

    allow_methods: list[str] = Field(default_factory=lambda: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    allow_headers: list[str] = Field(default_factory=lambda: ["Content-Type"])
    allow_credentials: bool = False
    expose_headers: list[str] = Field(default_factory=list)
    max_age_seconds: PositiveInt = 600


class BehaviorRule(_Strict):
    """A usage, response-pattern or frequency rule over each client's recent requests."""

    type: Literal["usage", "return_pattern", "frequency"]
    threshold: PositiveInt
    window_seconds: PositiveInt = 3600
    # For `return_pattern`: `status:404`, a regex, a JSON path… (fastapi-guard's syntax).
    pattern: str | None = None
    action: BehaviorAction = "log"
    ban_duration_seconds: PositiveInt | None = None

    @model_validator(mode="after")
    def _pattern_matches_type(self) -> BehaviorRule:
        if self.type == "return_pattern" and not self.pattern:
            raise ValueError("a return_pattern rule needs a pattern")
        return self


class Logging(_Strict):
    """How guard decisions are logged."""

    suspicious_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "WARNING"
    # Every request at this level; null = don't log ordinary requests.
    request_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] | None = None
    muted_checks: list[str] = Field(default_factory=list)
    # Never written to a log, on top of fastapi-guard's own list.
    sensitive_headers: list[str] = Field(default_factory=list)
    sensitive_params: list[str] = Field(default_factory=list)
    sensitive_body_fields: list[str] = Field(default_factory=list)


class Agent(_Strict):
    """Tuning for the hosted Guard Core agent, used only when GUARD_AGENT_API_KEY is set."""

    buffer_size: PositiveInt = 100
    flush_interval_seconds: PositiveInt = 30
    send_events: bool = True
    send_metrics: bool = True
    dynamic_rule_interval_seconds: PositiveInt = 300


class ProfileSettings(_Strict):
    """Everything about how one process's guard behaves, apart from its routes."""

    # `classic` is fastapi-guard's SecurityMiddleware: response-pattern rules
    # (`status:404` bans) need it. `pure_asgi` streams without buffering but
    # cannot run them.
    middleware: Literal["classic", "pure_asgi"] = "classic"
    rate_limit: RateLimit
    auto_ban: AutoBan = Field(default_factory=AutoBan)
    # Scanning tools: a request whose User-Agent contains one of these words
    # (any case) is refused by Sentinel's access layer. Plain words, not
    # regexes: fastapi-guard checks each regex for ReDoS in a subprocess with a
    # 0.5 s limit, which a busy machine or a Raspberry Pi can miss, and the
    # service then refuses to start.
    blocked_user_agents: list[UserAgentWord] = Field(default_factory=list)
    detection: Detection = Field(default_factory=Detection)
    # Skip attack detection and behaviour tracking (bans and limits still apply).
    exclude_paths: list[str] = Field(default_factory=list)
    security_headers: SecurityHeaders = Field(default_factory=SecurityHeaders)
    cors: Cors = Field(default_factory=Cors)
    behavior_rules: list[BehaviorRule] = Field(default_factory=list)
    logging: Logging = Field(default_factory=Logging)
    # A check that raises refuses the request (500) rather than letting it through.
    fail_secure: bool = True
    # Redis down = let requests through (logged), not answer every one with 503.
    redis_fail_open: bool = True
    cloud_refresh_interval_seconds: int = Field(default=3600, ge=60, le=86_400)
    geo_database_max_age_seconds: int = Field(default=86_400, ge=3600, le=604_800)
    # The `detail` of the guard's own refusals, by status code.
    error_messages: dict[int, str] = Field(default_factory=dict)
    agent: Agent = Field(default_factory=Agent)


class GroupDetection(_Strict):
    """A route group's exceptions to attack detection."""

    enabled: bool | None = None
    scan_body: bool | None = None
    excluded_headers: list[str] = Field(default_factory=list)
    excluded_semantic_headers: list[str] = Field(default_factory=list)
    excluded_params: list[str] = Field(default_factory=list)
    excluded_body_fields: list[str] = Field(default_factory=list)
    excluded_categories: list[DetectionCategory] = Field(default_factory=list)


class TimeWindow(_Strict):
    """Only answer between `start` and `end` (HH:MM) in `timezone`."""

    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    timezone: str = "UTC"


class Monitor(_Strict):
    """A per-route usage, frequency or response-pattern monitor."""

    kind: Literal["usage", "frequency", "return_pattern"]
    # usage/return_pattern: calls or occurrences; frequency: requests per second.
    threshold: float = Field(gt=0)
    window_seconds: PositiveInt = 3600
    pattern: str | None = None
    action: BehaviorAction = "log"

    @model_validator(mode="after")
    def _pattern_matches_kind(self) -> Monitor:
        if self.kind == "return_pattern" and not self.pattern:
            raise ValueError("a return_pattern monitor needs a pattern")
        return self


class GroupGeo(_Strict):
    """Country rules for a route group, applied only while country data is configured."""

    blocked_countries: list[str] = Field(default_factory=list)
    allowed_countries: list[str] = Field(default_factory=list)
    rate_limits: dict[str, RateLimit] = Field(default_factory=dict)


class RouteGroup(_Strict):
    """The per-route protections shared by every route a rule assigns to this group."""

    description: str
    rate_limit: RateLimit | None = None
    bypass: list[GuardCheck] = Field(default_factory=list)
    allowed_content_types: list[str] = Field(default_factory=list)
    max_request_bytes: PositiveInt | None = None
    detection: GroupDetection | None = None
    # Body fields a person never fills in; a request that sets one is a bot.
    honeypot_fields: list[str] = Field(default_factory=list)
    # Require a Referer from GUARD_ALLOWED_REFERRER_DOMAINS (when that is set).
    require_referrer: bool = False
    # fastapi-guard's own credential check, verified against Sentinel's
    # accepted-callers list: `bearer` (Authorization) or `decoder_secret`
    # (X-Decode-Secret). Off in the shipped policy: it runs before the access
    # check, so it would answer 401 where access answers 404, telling a prober
    # the route exists. `require_caller` / `require_decoder` check anyway.
    authentication: Literal["bearer", "decoder_secret"] | None = None
    # Headers that must be present ("required") or equal a value.
    require_headers: dict[str, str] = Field(default_factory=dict)
    require_https: bool = False
    allowed_ips: list[str] = Field(default_factory=list)
    blocked_ips: list[str] = Field(default_factory=list)
    blocked_user_agents: list[str] = Field(default_factory=list)
    time_window: TimeWindow | None = None
    monitors: list[Monitor] = Field(default_factory=list)
    behavior_rules: list[BehaviorRule] = Field(default_factory=list)
    geo: GroupGeo | None = None
    # Cloud providers refused on these routes (while cloud blocking is configured).
    blocked_clouds: list[str] = Field(default_factory=list)
    # Named validators from `route_groups.CUSTOM_VALIDATORS`.
    custom_validators: list[str] = Field(default_factory=list)


HttpMethod = Literal["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "WEBSOCKET", "*"]

# Every method: what a rule covers when it names none.
ALL_METHODS: tuple[HttpMethod, ...] = ("*",)


class RouteRule(_Strict):
    """Who may call the routes matching `paths` + `methods`, and their protections."""

    paths: list[str] = Field(min_length=1)
    methods: list[HttpMethod] = Field(default_factory=lambda: list(ALL_METHODS))
    access: list[CallerClass] = Field(min_length=1)
    group: str = "default"
    # For readers of the policy (and the access matrix).
    note: str = ""
    # A catch-all (the SPA's `/{full_path:path}`): routes it happens to match
    # still need a rule of their own, so a new endpoint can't hide behind it.
    # It classifies only a route whose template is one of its paths verbatim.
    fallback: bool = False
    # The profiles (GUARD_PROFILE) this rule applies in; empty = every one.
    # For a path that means different things in different processes:
    # `sdr-manager-local` serves its API at `/api/...` for other machines.
    profiles: list[str] = Field(default_factory=list)


class AccessClass(_Strict):
    """How a caller class is recognised: where it calls from, and what it must send."""

    description: str
    # CIDRs/addresses, or `$name` for a list from settings (see `networks.py`).
    networks: list[str] = Field(min_length=1)
    # Headers that must be present (their value is checked by the route itself).
    required_headers: list[str] = Field(default_factory=list)
    # Browser checks: Sec-Fetch-Site must be one of these, or — for a browser
    # that sends no Fetch Metadata (any browser on plain HTTP) — the Origin
    # must be this host.
    fetch_sites: list[Literal["same-origin", "same-site", "cross-site", "none"]] = Field(default_factory=list)
    # With neither header: GET and HEAD are always admitted (a browser's own
    # read over plain HTTP sends neither); this admits every other method too.
    allow_missing_fetch_metadata: bool = True


class GuardPolicy(_Strict):
    """The whole policy file."""

    schema_ref: str | None = Field(default=None, alias="$schema")
    version: Literal[1]
    defaults: dict[str, Any]
    profiles: dict[str, dict[str, Any]]
    access_classes: dict[CallerClass, AccessClass]
    route_groups: dict[str, RouteGroup]
    route_rules: list[RouteRule]

    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)

    @model_validator(mode="after")
    def _references_resolve(self) -> GuardPolicy:
        missing_classes = {caller_class for rule in self.route_rules for caller_class in rule.access} - set(
            self.access_classes
        )
        if missing_classes:
            raise ValueError(f"route_rules use undefined access classes: {sorted(missing_classes)}")
        missing_groups = {rule.group for rule in self.route_rules} - set(self.route_groups)
        if missing_groups:
            raise ValueError(f"route_rules use undefined route groups: {sorted(missing_groups)}")
        unknown_profiles = {profile for rule in self.route_rules for profile in rule.profiles} - set(self.profiles)
        if unknown_profiles:
            raise ValueError(f"route_rules name undefined profiles: {sorted(unknown_profiles)}")
        # Every profile must merge into a valid ProfileSettings, so a bad
        # override fails here, not when that one service starts.
        for profile_name in self.profiles:
            self.profile_settings(profile_name)
        return self

    def profile_settings(self, profile_name: str) -> ProfileSettings:
        """`defaults` with `profiles[profile_name]` merged over it.

        Raises `KeyError` for a profile the file doesn't define.
        """
        if profile_name not in self.profiles:
            raise KeyError(f"guard profile {profile_name!r} is not in the policy (known: {sorted(self.profiles)})")
        return ProfileSettings.model_validate(_deep_merge(self.defaults, self.profiles[profile_name]))


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """`base` with `override` merged in: nested objects merge, anything else replaces."""
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def policy_path() -> Path:
    """The policy file this process reads: GUARD_POLICY_FILE, else the bundled one."""
    return Path(settings.guard_policy_file) if settings.guard_policy_file else DEFAULT_POLICY_PATH


def read_policy(path: Path) -> GuardPolicy:
    """Parse and validate the policy file at `path`.

    Raises `FileNotFoundError`, `json.JSONDecodeError` or pydantic's
    `ValidationError` (which names the offending key).
    """
    return GuardPolicy.model_validate(json.loads(path.read_text(encoding="utf-8")))


@cache
def load_policy() -> GuardPolicy:
    """This process's policy, read once. Tests call `load_policy.cache_clear()`."""
    return read_policy(policy_path())
