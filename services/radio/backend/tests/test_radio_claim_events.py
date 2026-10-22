"""The radio hub's side of sdr-manager-remote's claims (sentinel_radio/services/claim_events.py).

A grant (`sdr-manager.claims.granted`) is a request: sdr-manager-remote holds
the claim's retune until the hub replies, so the reply must come only after
the claim is recorded and the hub's own connection has let go of the tuning.
A malformed grant is refused in the reply rather than raised, because a
raised exception cannot cross NATS. A release (`sdr-manager.claims.released`)
is a plain event.

Run with:  uv run --project backend pytest services/radio/backend/tests/test_radio_claim_events.py
"""

from __future__ import annotations

import logging
from typing import Any

import pytest
from backend.platform.bus import bus

from sentinel_radio.services import claim_events, device_claims

HOST, PORT = "192.168.5.67", 4444
EXPIRES_AT_MS = 10**15


@pytest.fixture(autouse=True)
def no_claims():
    device_claims.clear()
    yield
    device_claims.clear()


@pytest.fixture
def yields(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, int, bool]]:
    """Every `yield_to_claim` call, with whether the claim was already recorded when it ran."""
    calls: list[tuple[str, int, bool]] = []

    async def record_yield(host: str, port: int) -> None:
        calls.append((host, port, device_claims.is_claimed(host, port, now_ms=0)))

    monkeypatch.setattr(claim_events.sdr_svc, "yield_to_claim", record_yield)
    return calls


async def grant(payload: dict[str, Any]) -> Any:
    return await bus.request(claim_events.CLAIM_GRANTED_SUBJECT, payload)


class TestGrant:
    async def test_records_the_claim_yields_then_acknowledges(self, yields):
        reply = await grant({"host": HOST, "port": PORT, "expires_at": EXPIRES_AT_MS})

        assert reply == {"ok": True}
        assert device_claims._claims == {f"{HOST}:{PORT}": EXPIRES_AT_MS}
        # Recorded before the yield: a connection that reconnects mid-yield
        # must already see the dongle as claimed.
        assert yields == [(HOST, PORT, True)]

    async def test_a_renewal_moves_the_expiry(self, yields):
        await grant({"host": HOST, "port": PORT, "expires_at": 2_000})
        await grant({"host": HOST, "port": PORT, "expires_at": 9_000})

        assert device_claims._claims == {f"{HOST}:{PORT}": 9_000}

    async def test_a_failed_yield_is_not_acknowledged(self, monkeypatch):
        # The proxy treats a missing acknowledgement as "go ahead anyway", but
        # an `ok` here would claim the hub let go when it did not.
        async def broken_yield(host: str, port: int) -> None:
            raise RuntimeError("relay control socket closed")

        monkeypatch.setattr(claim_events.sdr_svc, "yield_to_claim", broken_yield)

        with pytest.raises(RuntimeError, match="relay control socket closed"):
            await grant({"host": HOST, "port": PORT, "expires_at": EXPIRES_AT_MS})

    @pytest.mark.parametrize(
        "payload",
        [
            {"port": PORT, "expires_at": EXPIRES_AT_MS},
            {"host": "", "port": PORT, "expires_at": EXPIRES_AT_MS},
            {"host": 192, "port": PORT, "expires_at": EXPIRES_AT_MS},
            {"host": HOST, "expires_at": EXPIRES_AT_MS},
            {"host": HOST, "port": "4444", "expires_at": EXPIRES_AT_MS},
            {"host": HOST, "port": True, "expires_at": EXPIRES_AT_MS},
            {"host": HOST, "port": PORT},
            {"host": HOST, "port": PORT, "expires_at": "soon"},
            {"host": HOST, "port": PORT, "expires_at": 1.5},
            {"host": HOST, "port": PORT, "expires_at": True},
        ],
        ids=[
            "no host",
            "empty host",
            "non-string host",
            "no port",
            "string port",
            "boolean port",
            "no expiry",
            "string expiry",
            "float expiry",
            "boolean expiry",
        ],
    )
    async def test_a_malformed_grant_is_refused_and_changes_nothing(self, yields, payload):
        reply = await grant(payload)

        assert reply == {"ok": False, "reason": "bad_claim"}
        assert device_claims._claims == {}
        assert yields == []

    async def test_a_grant_without_an_address_is_logged(self, yields, caplog):
        with caplog.at_level(logging.WARNING, logger=claim_events.__name__):
            await grant({"host": HOST, "expires_at": EXPIRES_AT_MS})

        assert "Ignoring a claim event without a usable host and port" in caplog.text


class TestRelease:
    async def test_lifts_the_claim(self):
        device_claims.mark_claimed(HOST, PORT, EXPIRES_AT_MS)

        await bus.publish(claim_events.CLAIM_RELEASED_SUBJECT, {"host": HOST, "port": PORT})

        assert device_claims.is_claimed(HOST, PORT) is False

    async def test_lifts_only_that_dongle(self):
        device_claims.mark_claimed(HOST, PORT, EXPIRES_AT_MS)
        device_claims.mark_claimed(HOST, 6655, EXPIRES_AT_MS)

        await bus.publish(claim_events.CLAIM_RELEASED_SUBJECT, {"host": HOST, "port": PORT})

        assert device_claims._claims == {f"{HOST}:6655": EXPIRES_AT_MS}

    @pytest.mark.parametrize(
        "payload",
        [{}, {"host": HOST}, {"host": "", "port": PORT}, {"host": HOST, "port": "4444"}, {"host": HOST, "port": False}],
        ids=["empty", "no port", "empty host", "string port", "boolean port"],
    )
    async def test_a_malformed_release_leaves_the_claim_in_place(self, payload, caplog):
        device_claims.mark_claimed(HOST, PORT, EXPIRES_AT_MS)

        with caplog.at_level(logging.WARNING, logger=claim_events.__name__):
            await bus.publish(claim_events.CLAIM_RELEASED_SUBJECT, payload)

        assert device_claims.is_claimed(HOST, PORT) is True
        assert "Ignoring a claim event" in caplog.text
