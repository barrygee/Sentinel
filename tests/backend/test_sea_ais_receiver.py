"""
tests/backend/test_sea_ais_receiver.py

Tests for backend/services/sea_ais_receiver.py — Sea's off-grid AIS receiver,
which keeps the designated radio decoding from the backend (startup and every
relevant settings change) instead of waiting for someone to open the Sea page.

The hub is replaced by a recording bus so each test sees exactly which
hub.decode.ais.* requests Sea sends; the hub's side of those requests is in
test_routers_ais.py. Pinned:
  * the rule: the designated radio decodes only while Sea is off grid (its own
    override first, else the global mode); anything else releases the radio;
  * a hub failure is a logged reply, never an exception that breaks startup or
    a settings save;
  * only the trigger keys schedule a reconcile, and it runs in the background;
  * a config upload announces exactly the trigger settings it changed.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.db_helpers import upsert_setting
from backend.platform import bus as bus_module
from backend.services import app_config, sea_ais_receiver


class _RecordingBus:
    """Records hub requests and answers them; publishes go to the real bus."""

    def __init__(self) -> None:
        self.requests: list[tuple[str, dict[str, Any]]] = []
        self.reply: Any = {"ok": True}

    async def request(
        self, subject: str, payload: dict, timeout: float | None = 5.0
    ) -> Any:
        self.requests.append(
            (subject, {key: value for key, value in payload.items() if key != "db"})
        )
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


@pytest.fixture()
def hub(monkeypatch) -> _RecordingBus:
    recording_bus = _RecordingBus()
    monkeypatch.setattr(sea_ais_receiver, "bus", recording_bus)
    return recording_bus


@pytest.fixture()
def session_factory(test_engine, db_setup, monkeypatch):
    factory = sessionmaker(
        bind=test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(sea_ais_receiver, "AsyncSessionLocal", factory)
    return factory


async def _settings(factory, **values: Any) -> None:
    """Write settings given as namespace__key=value."""
    async with factory() as db:
        for name, value in values.items():
            namespace, key = name.split("__")
            await upsert_setting(db, namespace, key, value)


async def _desired(factory) -> int | None:
    async with factory() as db:
        return await sea_ais_receiver.desired_receiver(db)


# ── the rule ─────────────────────────────────────────────────────────────────


class TestDesiredReceiver:
    async def test_the_designated_radio_when_globally_off_grid(self, session_factory):
        await _settings(
            session_factory, sea__aisSdrRadioId=2, app__connectivityMode="offgrid"
        )
        assert await _desired(session_factory) == 2

    async def test_none_when_online(self, session_factory):
        await _settings(
            session_factory, sea__aisSdrRadioId=2, app__connectivityMode="online"
        )
        assert await _desired(session_factory) is None

    async def test_none_by_default_because_the_default_mode_is_online(
        self, session_factory
    ):
        await _settings(session_factory, sea__aisSdrRadioId=2)
        assert await _desired(session_factory) is None

    async def test_seas_own_override_beats_the_global_mode(self, session_factory):
        await _settings(
            session_factory,
            sea__aisSdrRadioId=2,
            app__connectivityMode="online",
            sea__sourceOverride="offgrid",
        )
        assert await _desired(session_factory) == 2
        await _settings(
            session_factory,
            app__connectivityMode="offgrid",
            sea__sourceOverride="online",
        )
        assert await _desired(session_factory) is None

    @pytest.mark.parametrize("designated", [None, "2", True, 2.5])
    async def test_no_valid_designated_radio_means_none(
        self, session_factory, designated
    ):
        await _settings(
            session_factory,
            sea__aisSdrRadioId=designated,
            app__connectivityMode="offgrid",
        )
        assert await _desired(session_factory) is None


# ── reconciling ──────────────────────────────────────────────────────────────


class TestReconcile:
    async def test_asks_the_hub_to_decode_on_the_designated_radio(
        self, session_factory, hub
    ):
        await _settings(
            session_factory, sea__aisSdrRadioId=2, app__connectivityMode="offgrid"
        )
        async with session_factory() as db:
            assert await sea_ais_receiver.reconcile(db) == {"ok": True}
        assert hub.requests == [("hub.decode.ais.start", {"radio_id": 2})]

    async def test_starts_even_when_already_decoding_so_a_failed_start_recovers(
        self, session_factory, hub
    ):
        await _settings(
            session_factory,
            sea__aisSdrRadioId=2,
            app__connectivityMode="offgrid",
            sdr__ais_radio_id=2,
        )
        async with session_factory() as db:
            await sea_ais_receiver.reconcile(db)
        assert hub.requests == [("hub.decode.ais.start", {"radio_id": 2})]

    async def test_releases_the_decoding_radio_when_no_receiver_is_wanted(
        self, session_factory, hub
    ):
        await _settings(
            session_factory,
            sea__aisSdrRadioId=2,
            app__connectivityMode="online",
            sdr__ais_radio_id=3,
        )
        async with session_factory() as db:
            await sea_ais_receiver.reconcile(db)
        assert hub.requests == [("hub.decode.ais.stop", {"radio_id": 3})]

    @pytest.mark.parametrize("decoding", [None, True])
    async def test_does_nothing_when_nothing_is_wanted_or_decoding(
        self, session_factory, hub, decoding
    ):
        await _settings(
            session_factory, app__connectivityMode="online", sdr__ais_radio_id=decoding
        )
        async with session_factory() as db:
            assert await sea_ais_receiver.reconcile(db) is None
        assert hub.requests == []

    async def test_a_failed_start_is_logged_not_raised(
        self, session_factory, hub, caplog
    ):
        await _settings(
            session_factory, sea__aisSdrRadioId=2, app__connectivityMode="offgrid"
        )
        hub.reply = {
            "ok": False,
            "reason": "connect_failed",
            "message": "radio connect failed: refused",
        }
        with caplog.at_level(logging.WARNING, logger=sea_ais_receiver.__name__):
            async with session_factory() as db:
                assert (await sea_ais_receiver.reconcile(db))["ok"] is False
        assert (
            "could not start AIS decode on radio 2: radio connect failed: refused"
            in caplog.text
        )


class TestReconcileNow:
    async def test_uses_its_own_session(self, session_factory, hub):
        await _settings(
            session_factory, sea__aisSdrRadioId=2, app__connectivityMode="offgrid"
        )
        await sea_ais_receiver.reconcile_now()
        assert hub.requests == [("hub.decode.ais.start", {"radio_id": 2})]

    async def test_never_raises_so_startup_survives_a_missing_hub(
        self, session_factory, hub, caplog
    ):
        await _settings(
            session_factory, sea__aisSdrRadioId=2, app__connectivityMode="offgrid"
        )
        hub.reply = LookupError(
            "no responder registered for subject 'hub.decode.ais.start'"
        )
        with caplog.at_level(logging.ERROR, logger=sea_ais_receiver.__name__):
            await sea_ais_receiver.reconcile_now()
        assert "AIS receiver reconcile failed" in caplog.text


# ── triggers ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def scheduled(monkeypatch) -> list[str]:
    """Replace the background reconcile with a recorder."""
    runs: list[str] = []

    async def _reconcile_now() -> None:
        runs.append("reconcile")

    monkeypatch.setattr(sea_ais_receiver, "reconcile_now", _reconcile_now)
    return runs


async def _drain_background() -> None:
    while sea_ais_receiver._background:
        await asyncio.gather(*list(sea_ais_receiver._background))


class TestSettingsTriggers:
    @pytest.mark.parametrize(
        "subject, keys",
        [
            ("settings.changed.sea", ["aisSdrRadioId"]),
            ("settings.changed.sea", ["sourceOverride"]),
            ("settings.changed.sea", ["mapStyle", "sourceOverride"]),
            ("settings.changed.app", ["connectivityMode"]),
        ],
    )
    async def test_a_trigger_key_schedules_a_background_reconcile(
        self, scheduled, subject, keys
    ):
        await bus_module.bus.publish(subject, {"keys": keys, "db": None})
        assert (
            len(sea_ais_receiver._background) == 1
        )  # scheduled, not awaited by the publisher
        await _drain_background()
        assert scheduled == ["reconcile"]
        assert sea_ais_receiver._background == set()

    @pytest.mark.parametrize(
        "subject, keys",
        [
            ("settings.changed.sea", ["mapStyle"]),
            (
                "settings.changed.app",
                ["sourceOverride"],
            ),  # the app namespace has no sourceOverride trigger
            ("settings.changed.app", ["location"]),
            ("settings.changed.sea", []),
        ],
    )
    async def test_other_keys_do_nothing(self, scheduled, subject, keys):
        await bus_module.bus.publish(subject, {"keys": keys, "db": None})
        await _drain_background()
        assert scheduled == []

    async def test_a_payload_without_keys_does_nothing(self, scheduled):
        await bus_module.bus.publish("settings.changed.sea", {"db": None})
        assert scheduled == []


class TestConfigUploadAnnouncesTriggers:
    @pytest.fixture()
    def announced(self) -> list[tuple[str, list[str]]]:
        seen: list[tuple[str, list[str]]] = []

        def _recorder(namespace):
            async def _record(payload):
                seen.append((namespace, payload["keys"]))

            return _record

        unsubscribers = [
            bus_module.bus.subscribe("settings.changed.sea", _recorder("sea")),
            bus_module.bus.subscribe("settings.changed.app", _recorder("app")),
        ]
        yield seen
        for unsubscribe in unsubscribers:
            unsubscribe()

    async def test_announces_only_the_trigger_settings_that_changed(
        self, session_factory, scheduled, announced
    ):
        await _settings(
            session_factory,
            sea__aisSdrRadioId=2,
            sea__sourceOverride="online",
            app__connectivityMode="online",
        )
        async with session_factory() as db:
            await app_config.apply_config(
                db, {"sea": {"aisSdrRadioId": 2, "sourceOverride": "offgrid"}}
            )
        assert announced == [("sea", ["sourceOverride"])]

    async def test_announces_each_namespace_separately(
        self, session_factory, scheduled, announced
    ):
        async with session_factory() as db:
            await app_config.apply_config(
                db,
                {"sea": {"aisSdrRadioId": 5}, "app": {"connectivityMode": "offgrid"}},
            )
        assert sorted(announced) == [
            ("app", ["connectivityMode"]),
            ("sea", ["aisSdrRadioId"]),
        ]

    async def test_an_upload_that_changes_none_of_them_announces_nothing(
        self, session_factory, scheduled, announced
    ):
        await _settings(session_factory, sea__aisSdrRadioId=2)
        async with session_factory() as db:
            await app_config.apply_config(db, {"sea": {"aisSdrRadioId": 2}})
        assert announced == []
