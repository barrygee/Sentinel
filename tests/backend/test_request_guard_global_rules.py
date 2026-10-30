"""Counting the policy's global behaviour rules per client (`global_rules.py`).

The replacement for fastapi-guard's `process_global_return_rules`, called with
a stand-in processor so each step can be watched, and the patch that installs
it. End to end (a scanner banned across paths) is in test_request_guard_install.py.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_global_rules.py
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from guard_core.core.behavioral.processor import BehavioralProcessor

from backend.platform.security import global_rules
from backend.platform.security.global_rules import (
    GLOBAL_RULES_ENDPOINT_ID,
    count_global_rules_per_client,
)


def stand_in_processor(*, tracker: Any) -> tuple[Any, list[tuple[Any, ...]]]:
    """A processor whose collaborators record how the replacement calls them."""
    evaluations: list[tuple[Any, ...]] = []

    async def evaluate(*arguments: Any) -> None:
        evaluations.append(arguments)

    processor = SimpleNamespace(
        _behavior_tracker=lambda request: tracker,
        _collect_correlated_categories=lambda client_ip: [f"categories of {client_ip}"],
        _evaluate_global_return_rule=evaluate,
    )
    return processor, evaluations


def rule(rule_type: str) -> Any:
    return SimpleNamespace(rule_type=rule_type)


class TestCountingPerClient:
    async def test_every_return_rule_is_counted_under_one_endpoint_id(self) -> None:
        processor, evaluations = stand_in_processor(tracker="tracker")
        first_rule, second_rule = rule("return_pattern"), rule("return_pattern")

        await global_rules._process_global_return_rules_per_client(
            processor, "request", "response", "192.168.1.50", [first_rule, second_rule]
        )

        assert evaluations == [
            (
                "tracker",
                "request",
                "response",
                "192.168.1.50",
                GLOBAL_RULES_ENDPOINT_ID,
                matched_rule,
                ["categories of 192.168.1.50"],
            )
            for matched_rule in (first_rule, second_rule)
        ]

    async def test_a_usage_rule_is_left_alone(self) -> None:
        processor, evaluations = stand_in_processor(tracker="tracker")
        return_rule = rule("return_pattern")

        await global_rules._process_global_return_rules_per_client(
            processor,
            "request",
            "response",
            "192.168.1.50",
            [rule("usage"), return_rule],
        )

        assert [evaluation[5] for evaluation in evaluations] == [return_rule]

    async def test_nothing_is_counted_without_a_tracker(self) -> None:
        processor, evaluations = stand_in_processor(tracker=None)

        await global_rules._process_global_return_rules_per_client(
            processor, "request", "response", "192.168.1.50", [rule("return_pattern")]
        )

        assert evaluations == []


class TestThePatch:
    @pytest.fixture(autouse=True)
    def restore_fastapi_guards_method(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Whatever a test does to the class is undone after it.
        monkeypatch.setattr(
            BehavioralProcessor,
            "process_global_return_rules",
            BehavioralProcessor.process_global_return_rules,
        )

    def test_replaces_fastapi_guards_method(self) -> None:
        count_global_rules_per_client()

        assert (
            BehavioralProcessor.process_global_return_rules
            is global_rules._process_global_return_rules_per_client
        )

    def test_installing_twice_changes_nothing(self) -> None:
        count_global_rules_per_client()
        count_global_rules_per_client()

        assert (
            BehavioralProcessor.process_global_return_rules
            is global_rules._process_global_return_rules_per_client
        )

    @pytest.mark.parametrize(
        "missing_method",
        [
            "_behavior_tracker",
            "_collect_correlated_categories",
            "_evaluate_global_return_rule",
        ],
    )
    def test_a_fastapi_guard_without_the_internals_stops_startup(
        self, monkeypatch: pytest.MonkeyPatch, missing_method: str
    ) -> None:
        original = BehavioralProcessor.process_global_return_rules
        monkeypatch.delattr(BehavioralProcessor, missing_method)

        with pytest.raises(RuntimeError, match=f"has no {missing_method};"):
            count_global_rules_per_client()

        assert BehavioralProcessor.process_global_return_rules is original
