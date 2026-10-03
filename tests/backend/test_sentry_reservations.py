"""
tests/backend/test_sentry_reservations.py

Tests for backend/services/sentry_reservations.py — the radio hub's Sentry
reservation proxy (section-containers plan, B6). Air no longer reads
`sentry_hosts` or builds a `SentryClient`; it sends `hub.sentry.*` requests on
the bus and gets a plain-dict reply back.

Pinned here, at the bus boundary (the HTTP behaviour as Air presents it is in
test_adsb_source_claim.py):
  * the reply contract: `ok`, and on failure `reason` (+ `stage` for acquire),
    never a raised exception — a NATS reply can't carry one;
  * the hub, not the caller, supplies the holder, and it is `app.instanceId`;
  * claim and retune share one client, so a protected Sentry is signed into
    once per claim, not once per call;
  * the address lookup still answers for a disabled host (the ADS-B decoder
    sidecar has always been served regardless).

Sentry is faked at the httpx transport.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.core.instance_identity import get_instance_id
from backend.models import SentryHost
from backend.platform.bus import bus
from backend.services.sentry_reservations import (
    ACQUIRE_SUBJECT,
    DEVICE_ADDRESS_SUBJECT,
    RELEASE_SUBJECT,
)

DEVICE_ID = "serial:97710286"
RESERVATION = {"device_id": DEVICE_ID, "holder": "sentinel:x", "expires_at": 120_001}


@pytest.fixture
async def db(test_engine, db_setup) -> AsyncIterator[AsyncSession]:
    session_factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


async def add_host(
    db: AsyncSession, *, enabled: bool = True, name: str | None = "Attic Pi"
) -> int:
    host = SentryHost(
        name=name,
        address="10.0.0.5",
        port=8000,
        auth_token="console-password",
        enabled=enabled,
        created_at=1,
    )
    db.add(host)
    await db.commit()
    return host.id


def install_sentry(
    monkeypatch: pytest.MonkeyPatch, handler: Any
) -> list[httpx.Request]:
    """Route every outbound Sentry call to `handler`, recording the requests."""
    seen: list[httpx.Request] = []

    def recording(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    transport = httpx.MockTransport(recording)
    original = httpx.AsyncClient.__init__

    def patched(self: httpx.AsyncClient, *args: Any, **kwargs: Any) -> None:
        kwargs["transport"] = transport
        original(self, *args, **kwargs)

    monkeypatch.setattr(httpx.AsyncClient, "__init__", patched)
    return seen


def protected_sentry(request: httpx.Request) -> httpx.Response:
    """A Sentry that answers 401 until the session cookie is presented."""
    if request.url.path == "/api/auth/login":
        return httpx.Response(
            204, headers={"set-cookie": "sentry_session=granted; Path=/"}
        )
    if "sentry_session=granted" not in request.headers.get("cookie", ""):
        return httpx.Response(401, json={"detail": {"code": "unauthenticated"}})
    if request.url.path.endswith("/reservation"):
        return (
            httpx.Response(204)
            if request.method == "DELETE"
            else httpx.Response(200, json=RESERVATION)
        )
    return httpx.Response(200, json={"device_id": DEVICE_ID})


def unreachable(request: httpx.Request) -> httpx.Response:
    raise httpx.ConnectError("no route to host")


def acquire_payload(db: AsyncSession, host_id: int, **overrides: Any) -> dict[str, Any]:
    return {
        "db": db,
        "host_id": host_id,
        "device_id": DEVICE_ID,
        "label": "Sentinel — AIR (ADS-B)",
        "ttl_seconds": 120,
        "force": False,
        "patch": {"center_hz": 1_090_000_000},
        **overrides,
    }


class TestAcquire:
    async def test_claims_then_patches_under_the_instance_identity(
        self, db, monkeypatch
    ):
        host_id = await add_host(db)
        seen = install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert reply == {"ok": True, "reservation": RESERVATION}
        holder = await get_instance_id(db)
        claim = next(
            request for request in seen if request.url.path.endswith("/reservation")
        )
        patch = next(request for request in seen if request.method == "PATCH")
        assert json.loads(claim.content)["holder"] == holder
        assert json.loads(claim.content)["label"] == "Sentinel — AIR (ADS-B)"
        assert patch.headers["X-Sentry-Reservation-Holder"] == holder
        assert json.loads(patch.content) == {"center_hz": 1_090_000_000}

    async def test_claim_and_patch_share_one_sign_in(self, db, monkeypatch):
        # Separate clients would each sign in again on their first 401 — an
        # extra login every 30 s renewal.
        host_id = await add_host(db)
        seen = install_sentry(monkeypatch, protected_sentry)

        await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert [request.url.path for request in seen].count("/api/auth/login") == 1

    async def test_without_a_patch_nothing_is_retuned(self, db, monkeypatch):
        host_id = await add_host(db)
        seen = install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(
            ACQUIRE_SUBJECT, acquire_payload(db, host_id, patch=None)
        )

        assert reply["ok"] is True
        assert not any(request.method == "PATCH" for request in seen)

    async def test_force_is_passed_through(self, db, monkeypatch):
        host_id = await add_host(db)
        seen = install_sentry(monkeypatch, protected_sentry)

        await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id, force=True))

        claim = next(
            request for request in seen if request.url.path.endswith("/reservation")
        )
        assert json.loads(claim.content)["force"] is True

    async def test_unknown_host_still_creates_the_identity(self, db, monkeypatch):
        seen = install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, 999))

        assert reply == {"ok": False, "reason": "unknown_host"}
        assert seen == []
        # Generated on first use, before the host lookup, as Air always did.
        assert (await get_instance_id(db)).startswith("sentinel:")

    async def test_disabled_host_is_refused_with_its_label_and_no_network_call(
        self, db, monkeypatch
    ):
        host_id = await add_host(db, enabled=False)
        seen = install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert reply == {
            "ok": False,
            "reason": "host_disabled",
            "host_label": "Attic Pi",
        }
        assert seen == []

    async def test_disabled_host_without_a_name_is_labelled_by_address(
        self, db, monkeypatch
    ):
        host_id = await add_host(db, enabled=False, name=None)
        install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert reply["host_label"] == "10.0.0.5"

    async def test_unreachable_on_claim_reports_the_acquire_stage(
        self, db, monkeypatch
    ):
        host_id = await add_host(db)
        install_sentry(monkeypatch, unreachable)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert reply["ok"] is False
        assert reply["reason"] == "unreachable"
        assert reply["stage"] == "acquire"
        assert "10.0.0.5" in reply["message"]

    async def test_api_error_on_claim_carries_sentrys_answer(self, db, monkeypatch):
        host_id = await add_host(db)

        def busy(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                409,
                json={
                    "detail": {
                        "code": "device_reserved",
                        "message": "In use.",
                        "holder": "sentinel:other",
                    }
                },
            )

        install_sentry(monkeypatch, busy)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert reply["ok"] is False
        assert reply["reason"] == "api_error"
        assert reply["stage"] == "acquire"
        assert reply["status_code"] == 409
        assert reply["code"] == "device_reserved"
        assert reply["message"] == "In use."
        assert reply["context"]["holder"] == "sentinel:other"

    async def test_api_error_on_retune_reports_the_patch_stage(self, db, monkeypatch):
        host_id = await add_host(db)

        def rejects_patch(request: httpx.Request) -> httpx.Response:
            if request.method == "PATCH":
                return httpx.Response(
                    422,
                    json={
                        "detail": {"code": "bad_rate", "message": "Unsupported rate."}
                    },
                )
            return protected_sentry(request)

        install_sentry(monkeypatch, rejects_patch)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert reply["ok"] is False
        assert reply["stage"] == "patch"
        assert reply["reason"] == "api_error"
        assert reply["code"] == "bad_rate"

    async def test_unreachable_on_retune_reports_the_patch_stage(self, db, monkeypatch):
        host_id = await add_host(db)

        def drops_on_patch(request: httpx.Request) -> httpx.Response:
            if request.method == "PATCH":
                raise httpx.ConnectError("gone")
            return protected_sentry(request)

        install_sentry(monkeypatch, drops_on_patch)

        reply = await bus.request(ACQUIRE_SUBJECT, acquire_payload(db, host_id))

        assert reply["ok"] is False
        assert reply["stage"] == "patch"
        assert reply["reason"] == "unreachable"


class TestRelease:
    async def test_releases_under_the_instance_identity(self, db, monkeypatch):
        host_id = await add_host(db)
        seen = install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(
            RELEASE_SUBJECT, {"db": db, "host_id": host_id, "device_id": DEVICE_ID}
        )

        assert reply == {"ok": True}
        delete = next(request for request in seen if request.method == "DELETE")
        assert delete.headers["X-Sentry-Reservation-Holder"] == await get_instance_id(
            db
        )

    async def test_unknown_host(self, db, monkeypatch):
        install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(
            RELEASE_SUBJECT, {"db": db, "host_id": 999, "device_id": DEVICE_ID}
        )

        assert reply == {"ok": False, "reason": "unknown_host"}

    async def test_disabled_host_is_not_contacted(self, db, monkeypatch):
        host_id = await add_host(db, enabled=False)
        seen = install_sentry(monkeypatch, protected_sentry)

        reply = await bus.request(
            RELEASE_SUBJECT, {"db": db, "host_id": host_id, "device_id": DEVICE_ID}
        )

        assert reply["reason"] == "host_disabled"
        assert seen == []

    async def test_sentry_error_is_a_reply_not_an_exception(self, db, monkeypatch):
        host_id = await add_host(db)
        install_sentry(
            monkeypatch, lambda request: httpx.Response(500, json={"detail": "boom"})
        )

        reply = await bus.request(
            RELEASE_SUBJECT, {"db": db, "host_id": host_id, "device_id": DEVICE_ID}
        )

        assert reply["ok"] is False
        assert reply["reason"] == "api_error"
        assert reply["status_code"] == 500


class TestDeviceAddress:
    @staticmethod
    def export(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "sdrs": [
                    {
                        "sentry_device_id": "serial:OTHER",
                        "host": "10.0.0.5",
                        "port": 1234,
                    },
                    {"sentry_device_id": DEVICE_ID, "host": "10.0.0.5", "port": 2345},
                ]
            },
        )

    async def test_finds_the_device_in_the_export(self, db, monkeypatch):
        host_id = await add_host(db)
        install_sentry(monkeypatch, self.export)

        reply = await bus.request(
            DEVICE_ADDRESS_SUBJECT,
            {"db": db, "host_id": host_id, "device_id": DEVICE_ID},
        )

        assert reply == {"ok": True, "found": True, "host": "10.0.0.5", "port": 2345}

    async def test_a_device_missing_from_the_export_is_not_found(self, db, monkeypatch):
        host_id = await add_host(db)
        install_sentry(monkeypatch, self.export)

        reply = await bus.request(
            DEVICE_ADDRESS_SUBJECT,
            {"db": db, "host_id": host_id, "device_id": "serial:GONE"},
        )

        assert reply == {"ok": True, "found": False}

    async def test_an_empty_export_body_is_not_found(self, db, monkeypatch):
        host_id = await add_host(db)
        install_sentry(monkeypatch, lambda request: httpx.Response(204))

        reply = await bus.request(
            DEVICE_ADDRESS_SUBJECT,
            {"db": db, "host_id": host_id, "device_id": DEVICE_ID},
        )

        assert reply == {"ok": True, "found": False}

    async def test_a_disabled_host_is_still_answered(self, db, monkeypatch):
        host_id = await add_host(db, enabled=False)
        install_sentry(monkeypatch, self.export)

        reply = await bus.request(
            DEVICE_ADDRESS_SUBJECT,
            {"db": db, "host_id": host_id, "device_id": DEVICE_ID},
        )

        assert reply["found"] is True

    async def test_unknown_host(self, db, monkeypatch):
        install_sentry(monkeypatch, self.export)

        reply = await bus.request(
            DEVICE_ADDRESS_SUBJECT, {"db": db, "host_id": 999, "device_id": DEVICE_ID}
        )

        assert reply == {"ok": False, "reason": "unknown_host"}

    async def test_unreachable(self, db, monkeypatch):
        host_id = await add_host(db)
        install_sentry(monkeypatch, unreachable)

        reply = await bus.request(
            DEVICE_ADDRESS_SUBJECT,
            {"db": db, "host_id": host_id, "device_id": DEVICE_ID},
        )

        assert reply["ok"] is False
        assert reply["reason"] == "unreachable"
