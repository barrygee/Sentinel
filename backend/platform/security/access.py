"""Who may call what: matching a request to its route rule and checking its caller class.

Deny by default. Every request is matched against the policy's `route_rules`,
first match wins, and is let through only if the caller is one of the rule's
caller classes. A request no rule matches, or a caller outside the classes, is
answered 404 — the gateway answers `/internal/` the same way — so probing
can't tell a refused route from one that doesn't exist.

Rule paths use the route's own template syntax: `{name}` matches one path
segment and `{name:path}` the rest of the path; `*` is one segment and `**`
any number. Matching a route's *template* against the rules (the startup
check) and a request's concrete path (at request time) use the same matcher,
because a template's `{param}` is itself one segment.

This is not authentication. A `service` or `decoder` class only requires the
credential header to be present; `require_caller` / `require_decoder` still
check the credential itself, after this has decided the caller may be here
at all.
"""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import urlsplit

from backend.platform.security.networks import IpNetwork, address_in, parse_networks
from backend.platform.security.policy import AccessClass, CallerClass, GuardPolicy, RouteRule

# Methods that change nothing: the only ones a browser sends with neither
# Fetch Metadata nor Origin (a same-origin read over plain HTTP).
SAFE_METHODS = frozenset({"GET", "HEAD"})

_PARAMETER = re.compile(r"\{[^}/]+\}")


def compile_path_pattern(pattern: str) -> re.Pattern[str]:
    """A rule path as a regex over whole paths.

    `{name:path}` and `**` match the rest of the path (including nothing),
    `{name}` and `*` one non-empty segment; everything else is literal.
    """
    regex = ""
    for token in re.split(r"(\{[^}]+\}|\*\*|\*)", pattern):
        if token in ("**",) or (token.startswith("{") and token.endswith(":path}")):
            regex += ".*"
        elif token == "*" or _PARAMETER.fullmatch(token):
            regex += "[^/]+"
        else:
            regex += re.escape(token)
    return re.compile(regex)


@dataclass(frozen=True)
class CompiledRule:
    """A route rule with its paths compiled and its methods normalised."""

    rule: RouteRule
    patterns: tuple[re.Pattern[str], ...]
    methods: frozenset[str]

    def matches(self, method: str, path: str) -> bool:
        """Whether this rule covers `method` on `path` (HEAD counts as GET)."""
        if "*" not in self.methods and method not in self.methods:
            if not (method == "HEAD" and "GET" in self.methods):
                return False
        return any(pattern.fullmatch(path) for pattern in self.patterns)


@dataclass(frozen=True)
class CompiledAccessClass:
    """A caller class with its networks parsed."""

    name: CallerClass
    networks: tuple[IpNetwork, ...]
    definition: AccessClass


class AccessRules:
    """The policy's route rules and caller classes, ready to answer per request."""

    def __init__(self, policy: GuardPolicy, profile: str) -> None:
        """Compile `policy`'s rules for `profile`. Raises `ValueError` for a bad network."""
        self.rules = tuple(
            CompiledRule(
                rule=rule,
                patterns=tuple(compile_path_pattern(path) for path in rule.paths),
                methods=frozenset(rule.methods),
            )
            for rule in policy.route_rules
            if not rule.profiles or profile in rule.profiles
        )
        self.classes = {
            name: CompiledAccessClass(name=name, networks=parse_networks(definition.networks), definition=definition)
            for name, definition in policy.access_classes.items()
        }
        self._match = lru_cache(maxsize=4096)(self._first_match)

    def _first_match(self, method: str, path: str) -> CompiledRule | None:
        return next((rule for rule in self.rules if rule.matches(method, path)), None)

    def rule_for(self, method: str, path: str) -> CompiledRule | None:
        """The first rule covering `method` on `path`, or None (deny)."""
        return self._match(method.upper(), path)

    def explicit_rule_for(self, method: str, path_template: str) -> CompiledRule | None:
        """The rule that classifies a route template: the first match, where a
        fallback rule only counts for a template it lists verbatim (its own
        catch-all route), never for the routes it merely happens to cover.
        """
        return next(
            (
                rule
                for rule in self.rules
                if rule.matches(method.upper(), path_template)
                and (not rule.rule.fallback or path_template in rule.rule.paths)
            ),
            None,
        )

    def caller_classes(self, client_ip: str, headers: Mapping[str, str], method: str) -> set[CallerClass]:
        """Every caller class this request qualifies as."""
        return {
            name for name, caller_class in self.classes.items() if qualifies(caller_class, client_ip, headers, method)
        }

    def allows(self, rule: CompiledRule, client_ip: str, headers: Mapping[str, str], method: str) -> bool:
        """Whether a `method` request from `client_ip` sending `headers` may use `rule`'s routes."""
        return any(
            qualifies(self.classes[name], client_ip, headers, method)
            for name in rule.rule.access
            if name in self.classes
        )


def qualifies(caller_class: CompiledAccessClass, client_ip: str, headers: Mapping[str, str], method: str) -> bool:
    """Whether a `method` request from `client_ip` with `headers` is a `caller_class` caller.

    `headers` must be case-insensitive (Starlette's are). `method` is the
    HTTP method, or `WEBSOCKET` for a handshake.
    """
    definition = caller_class.definition
    if not address_in(client_ip, caller_class.networks):
        return False
    if any(not headers.get(header) for header in definition.required_headers):
        return False
    if definition.fetch_sites:
        return _browser_request(headers, definition.fetch_sites, definition.allow_missing_fetch_metadata, method)
    return True


def _browser_request(headers: Mapping[str, str], fetch_sites: Sequence[str], allow_missing: bool, method: str) -> bool:
    """Whether the request came from the SPA itself, not from another site.

    Browsers send `Sec-Fetch-Site` only to secure origins (HTTPS, localhost),
    so its value decides there. Over plain HTTP on the LAN — Sentinel's usual
    address — they send none, but still send `Origin` on every cross-origin
    request, every same-origin request that changes something and every
    WebSocket handshake: an Origin naming a different host is refused. No
    Origin at all is a same-origin read, admitted for GET and HEAD only, so
    another site still can't make a browser change anything here.
    """
    fetch_site = headers.get("sec-fetch-site")
    if fetch_site:
        return fetch_site in fetch_sites
    origin = headers.get("origin")
    if origin:
        return _same_host(origin, headers.get("host", ""))
    return allow_missing or method.upper() in SAFE_METHODS


def _same_host(origin: str, host: str) -> bool:
    """Whether an Origin header names the host the request was sent to (`Host`)."""
    if origin == "null":
        return False
    return bool(host) and urlsplit(origin).netloc.lower() == host.lower()
