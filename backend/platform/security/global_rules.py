"""Counting the policy's global behaviour rules per client, not per endpoint.

fastapi-guard keys every response-pattern count by endpoint and client: the
matched route, or `METHOD:path` when nothing matched. That suits a rule on one
route, but the policy's global rules (`status:404` with 401 and 403) are meant
to catch a client misbehaving across the whole service, and a scanner never
repeats a path: 1,000 different probes would leave 1,000 counters at 1 and
never reach the threshold of 100. This makes a global rule count every
matching response from a client under one key, whichever path it asked for.

Per-route rules (a route group's `behavior_rules`) keep their per-endpoint
counts. Applies to the in-memory and Redis counters alike, since both key on
the endpoint id this replaces.
"""

from __future__ import annotations

from typing import Any

from guard_core.core.behavioral.processor import BehavioralProcessor

# Stands in for the endpoint in a global rule's counter key, ban reason and
# event, which therefore read as "every endpoint" rather than one probe's path.
GLOBAL_RULES_ENDPOINT_ID = "global-behavior-rules"

# The fastapi-guard internals the replacement calls (fastapi-guard is pinned
# exactly; see ADR 0008). A version without them fails at startup, not by
# silently going back to per-endpoint counts.
_REQUIRED_PROCESSOR_METHODS = ("_behavior_tracker", "_collect_correlated_categories", "_evaluate_global_return_rule")


async def _process_global_return_rules_per_client(
    self: BehavioralProcessor,
    request: Any,
    response: Any,
    client_ip: str,
    rules: list[Any],
) -> None:
    # fastapi-guard's own `process_global_return_rules`, with the endpoint id
    # replaced by one constant for every request.
    tracker = self._behavior_tracker(request)
    if tracker is None:
        return
    correlated_categories = self._collect_correlated_categories(client_ip)
    for rule in rules:
        if rule.rule_type != "return_pattern":
            continue
        await self._evaluate_global_return_rule(
            tracker,
            request,
            response,
            client_ip,
            GLOBAL_RULES_ENDPOINT_ID,
            rule,
            correlated_categories,
        )


def count_global_rules_per_client() -> None:
    """Make every fastapi-guard middleware count global behaviour rules per client.

    Patches `BehavioralProcessor` itself, because fastapi-guard builds its
    processor lazily, on the middleware's first request. Idempotent.
    Raises `RuntimeError` when the installed fastapi-guard lacks a method the
    replacement relies on.
    """
    missing = [name for name in _REQUIRED_PROCESSOR_METHODS if not hasattr(BehavioralProcessor, name)]
    if missing:
        raise RuntimeError(
            "guard: fastapi-guard's BehavioralProcessor has no " + ", ".join(missing) + "; "
            "global behaviour rules can't be counted per client with this version"
        )
    BehavioralProcessor.process_global_return_rules = _process_global_return_rules_per_client  # type: ignore[method-assign]  # deliberate patch, see module docstring
