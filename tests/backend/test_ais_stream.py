"""
tests/backend/test_ais_stream.py

The AISStream reader and its watchdog, driven with an injected clock and a
fake socket so every state — disabled, no source, unsupported source, missing
key, live, auth-failed, the transport back-off ladder, DOWN, silence → stale →
recycle, subscription change — is exercised without touching the network.
"""

import asyncio
import json

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.db_helpers import upsert_setting
from backend.services import ais_stream
from backend.services.ais_store import AisVesselStore
from backend.services.ais_stream import (
    AisStreamAuthError,
    AisStreamReader,
    classify_error_text,
    key_fingerprint,
    validate_bounding_boxes,
)

KEY = "abcdefgh12345678"
T0 = 1_000_000_000_000


def position(mmsi=232012345):
    return {
        "MessageType": "PositionReport",
        "MetaData": {
            "MMSI": mmsi,
            "latitude": 51.0,
            "longitude": 1.0,
            "time_utc": "2026-09-12 08:00:00 +0000 UTC",
        },
        "Message": {"PositionReport": {"Sog": 1, "Cog": 2}},
    }


class FakeSocket:
    """An async-iterable socket that replays frames, then hangs open like a
    quiet feed until released — or closes/raises when told to."""

    def __init__(self, frames, *, fail_after=None, close_after=False):
        self.frames = list(frames)
        self.sent = []
        self.closed = False
        self.fail_after = fail_after
        self.close_after = close_after
        self.released = asyncio.Event()

    async def send(self, message):
        self.sent.append(json.loads(message))

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.frames:
            await asyncio.sleep(0)
            return self.frames.pop(0)
        if self.fail_after is not None:
            raise self.fail_after
        if not self.close_after:
            await self.released.wait()
        raise StopAsyncIteration

    async def close(self):
        self.closed = True
        self.released.set()


class Clock:
    def __init__(self, start=T0):
        self.now = start

    def __call__(self):
        return self.now

    def advance(self, ms):
        self.now += ms


def make_reader(config, connect):
    clock = Clock()
    reader = AisStreamReader(AisVesselStore(), connect=connect, clock=clock)

    async def read_config():
        return dict(config)

    reader._read_config = read_config
    return reader, clock


def live_config(**overrides):
    config = {
        "enabled": True,
        "url": "wss://x",
        "mode": "aisstream",
        "api_key": KEY,
        "bounding_boxes": ais_stream.WORLD_BOUNDING_BOXES,
        "source_mode": "online",
    }
    config.update(overrides)
    return config


async def settle():
    for _ in range(5):
        await asyncio.sleep(0)


# ── helpers ───────────────────────────────────────────────────────────────────


def test_validate_bounding_boxes():
    assert validate_bounding_boxes([[[-90, -180], [90, 180]]]) == [
        [[-90.0, -180.0], [90.0, 180.0]]
    ]
    assert validate_bounding_boxes([[["1", "2"], ["3", "4"]]]) == [
        [[1.0, 2.0], [3.0, 4.0]]
    ]
    for bad in (
        None,
        "x",
        [],
        [[[0, 0]]],  # one corner
        [[[0, 0], [1, 1, 1]]],
        [[["a", 0], [1, 1]]],
        [[[91, 0], [92, 1]]],
        [[[0, 181], [1, 182]]],
        [[[5, 0], [1, 1]]],  # south > north
        [[[0, 0], [1, 1]]] * (settings.sea_ais_max_bounding_boxes + 1),
        [["corner", "corner"]],
    ):
        assert validate_bounding_boxes(bad) is None, bad


def test_classify_error_text_and_fingerprint():
    assert classify_error_text("Api Key Is Not Valid") == "auth"
    assert classify_error_text("Too many connections") == "rate"
    assert classify_error_text("kaboom") == "transport"
    assert key_fingerprint("") is None
    assert (
        key_fingerprint(KEY) == key_fingerprint(KEY) and len(key_fingerprint(KEY)) == 12
    )
    assert key_fingerprint(KEY) != key_fingerprint("other-key-000000")


# ── ensure(): gate states ─────────────────────────────────────────────────────


class TestGateStates:
    async def test_disabled_domain_never_connects(self):
        connect = _never_connect()
        reader, _ = make_reader(live_config(enabled=False), connect)
        assert await reader.ensure() == "disabled"
        assert reader.error is None and connect.calls == 0

    async def test_no_source_and_unsupported_source(self):
        connect = _never_connect()
        reader, _ = make_reader(live_config(mode="no-source", url=None), connect)
        assert await reader.ensure() == "no-source"
        reader, _ = make_reader(
            live_config(mode="unsupported-source", url="tcp://x:1"), connect
        )
        assert await reader.ensure() == "unsupported-source"
        assert "tcp://x:1" in reader.error
        assert connect.calls == 0

    async def test_every_tick_reports_the_source_mode_to_the_store(self):
        # The tick runs with no browser attached, so it alone must notice a
        # switch; the store decides whether that means clearing.
        reader, _ = make_reader(live_config(enabled=False), _never_connect())
        seen = []

        async def record(mode):
            seen.append(mode)
            return False

        reader.store.switch_source = record
        await reader.ensure()
        reader._read_config = _config_returning(
            live_config(enabled=False, source_mode="offgrid")
        )
        await reader.ensure()
        assert seen == ["online", "offgrid"]

    async def test_missing_key(self):
        connect = _never_connect()
        reader, _ = make_reader(live_config(api_key=""), connect)
        assert await reader.ensure() == "missing-key"
        assert "AISSTREAM_API_KEY" in reader.error
        snapshot = reader.snapshot()
        assert (
            snapshot["status"] == "missing-key"
            and snapshot["vesselCount"] == 0
            and snapshot["silentForMs"] is None
        )


def _never_connect():
    async def connect(url):
        connect.calls += 1
        raise AssertionError("should not connect")

    connect.calls = 0
    return connect


# ── connecting and live ───────────────────────────────────────────────────────


class TestLive:
    async def test_connects_subscribes_and_goes_live(self):
        socket = FakeSocket(
            [
                json.dumps(position()),
                json.dumps({"MessageType": "junk"}),
                "not json",
                "[]",
            ]
        )

        async def connect(url):
            connect.url = url
            return socket

        reader, clock = make_reader(live_config(), connect)
        assert await reader.ensure() == "connecting"
        await settle()
        assert connect.url == "wss://x"
        assert socket.sent == [
            {
                "APIKey": KEY,
                "BoundingBoxes": ais_stream.WORLD_BOUNDING_BOXES,
                "FilterMessageTypes": list(ais_stream.DEFAULT_MESSAGE_TYPES),
            }
        ]
        assert reader.status == "live"
        assert reader.last_message_at == clock.now and len(reader.store) == 1
        assert reader.snapshot()["status"] == "live"
        # The upstream then closes cleanly — that is still a transport failure.
        socket.released.set()
        await settle()
        assert reader.error == "AISStream closed the connection"
        assert reader.reconnect_attempt == 1
        assert reader.next_attempt_at == clock.now + settings.sea_ais_backoff_ms[0]

    async def test_non_auth_error_envelope_is_logged_not_fatal(self):
        socket = FakeSocket(
            [json.dumps({"error": "rate limited, too many"}), json.dumps(position())]
        )
        reader, _ = make_reader(live_config(), lambda url: _resolved(socket))
        await reader.ensure()
        await settle()
        assert reader.status == "live" and len(reader.store) == 1
        await reader.stop()

    async def test_stop_persists_and_wake_cancels(
        self, test_engine, db_setup, monkeypatch
    ):
        from backend.services import ais_store as store_module

        factory = sessionmaker(
            bind=test_engine, class_=AsyncSession, expire_on_commit=False
        )
        monkeypatch.setattr(store_module, "AsyncSessionLocal", factory)
        socket = FakeSocket([])
        reader, _ = make_reader(live_config(), lambda url: _resolved(socket))
        await reader.start()
        assert reader._tick_task is not None
        await reader.ensure()
        await settle()
        reader.wake()
        await settle()
        await reader.stop()
        assert reader._tick_task is None and reader._socket_task is None
        assert socket.closed
        await reader.stop()  # idempotent

    async def test_start_survives_a_failing_snapshot_load(self, monkeypatch):
        reader, _ = make_reader(live_config(), lambda url: _resolved(FakeSocket([])))

        async def boom(_now):
            raise RuntimeError("db gone")

        monkeypatch.setattr(reader.store, "load_snapshot", boom)
        await reader.start()
        assert reader._tick_task is not None
        await reader.stop()


def _resolved(value):
    future = asyncio.get_event_loop().create_future()
    future.set_result(value)
    return future


# ── failures ──────────────────────────────────────────────────────────────────


class TestFailures:
    async def test_auth_failure_is_terminal_until_the_key_changes(self):
        sockets = [FakeSocket([json.dumps({"error": "Api Key Is Not Valid"})])]

        async def connect(url):
            return sockets[-1]

        config = live_config()
        reader, clock = make_reader(config, connect)
        await reader.ensure()
        await settle()
        assert (
            reader.status == "auth-failed"
            and reader.auth_failed_fingerprint == key_fingerprint(KEY)
        )
        assert reader.next_attempt_at == clock.now + settings.sea_ais_auth_probe_ms
        # Ticks inside the probe window do not reconnect.
        clock.advance(1_000)
        assert await reader.ensure() == "auth-failed"
        # After the probe window it tries again (and fails again).
        sockets.append(FakeSocket([json.dumps({"error": "Api Key Is Not Valid"})]))
        clock.advance(settings.sea_ais_auth_probe_ms)
        assert await reader.ensure() == "connecting"
        await settle()
        assert reader.status == "auth-failed"
        # A new key clears the terminal state at once.
        config["api_key"] = "brand-new-key-0001"
        sockets.append(FakeSocket([json.dumps(position())]))
        clock.advance(1)
        assert await reader.ensure() == "connecting"
        await settle()
        assert reader.status == "live" and reader.auth_failed_fingerprint is None
        await reader.stop()

    async def test_transport_failures_walk_the_ladder_then_go_down(self):
        async def connect(url):
            raise ConnectionError("boom")

        reader, clock = make_reader(live_config(), connect)
        expected = list(settings.sea_ais_backoff_ms)
        for attempt, delay in enumerate(expected, start=1):
            assert await reader.ensure() == "connecting"
            await settle()
            assert reader.error == "boom" and reader.reconnect_attempt == attempt
            assert reader.next_attempt_at == clock.now + delay
            assert reader.status == "reconnecting"
            # Not yet due: the watchdog waits.
            clock.advance(delay - 1)
            assert await reader.ensure() == "reconnecting"
            clock.advance(1)
        # Ladder spent: slow DOWN cadence.
        assert await reader.ensure() == "connecting"
        await settle()
        assert reader.status == "down"
        assert reader.next_attempt_at == clock.now + settings.sea_ais_down_retry_ms
        assert await reader.ensure() == "down"
        assert reader.snapshot()["reconnectAttempt"] == len(expected) + 1

    async def test_exception_without_message_uses_class_name(self):
        async def connect(url):
            raise RuntimeError()

        reader, _ = make_reader(live_config(), connect)
        await reader.ensure()
        await settle()
        assert reader.error == "RuntimeError"

    async def test_error_while_reading_is_a_transport_failure(self):
        socket = FakeSocket([json.dumps(position())], fail_after=OSError("reset"))
        reader, _ = make_reader(live_config(), lambda url: _resolved(socket))
        await reader.ensure()
        await settle()
        await settle()
        assert reader.status == "reconnecting" and reader.error == "reset"


# ── silence watchdog ──────────────────────────────────────────────────────────


class TestSilence:
    async def _live_reader(self):
        socket = FakeSocket([json.dumps(position())])
        reader, clock = make_reader(live_config(), lambda url: _resolved(socket))
        await reader.ensure()
        await settle()
        assert reader.status == "live"
        return reader, clock, socket, socket.released

    async def test_silence_reports_stale_then_recycles(self):
        reader, clock, socket, hang = await self._live_reader()
        clock.advance(settings.sea_ais_silence_report_ms)
        assert await reader.ensure() == "stale"
        assert "no AIS traffic" in reader.error
        recycle_after = int(
            settings.sea_ais_silence_report_ms * settings.sea_ais_recycle_ratio
        )
        clock.advance(recycle_after - settings.sea_ais_silence_report_ms)
        assert await reader.ensure() == "reconnecting"
        hang.set()
        await settle()
        assert reader.reconnect_attempt == 1
        assert reader.snapshot()["silentForMs"] is not None
        await reader.stop()

    async def test_traffic_resumes_from_stale_back_to_live(self):
        reader, clock, socket, hang = await self._live_reader()
        clock.advance(settings.sea_ais_silence_report_ms)
        assert await reader.ensure() == "stale"
        # A fresh message arrives: the reader is live again on the next tick.
        reader.last_message_at = clock.now
        assert await reader.ensure() == "live"
        hang.set()
        await reader.stop()

    async def test_subscription_change_recycles_the_socket(self):
        reader, clock, socket, hang = await self._live_reader()
        reader._read_config = _config_returning(
            live_config(bounding_boxes=[[[50, 0], [52, 2]]])
        )
        hang.set()
        status = await reader.ensure()
        assert status == "connecting"
        assert socket.closed
        await reader.stop()

    async def test_silence_without_any_reference_time_is_ignored(self):
        reader, _ = make_reader(live_config(), lambda url: _resolved(FakeSocket([])))
        reader._socket_task = (
            asyncio.get_event_loop().create_future()
        )  # "running", never connected
        reader._subscription_fingerprint = None
        # A pending never-connected task with a matching subscription is left alone.
        reader._evaluate_silence(T0)
        assert reader.status == "disabled"
        reader._socket_task.cancel()


def _config_returning(config):
    async def read_config():
        return dict(config)

    return read_config


# ── _read_config against the database ────────────────────────────────────────


class TestReadConfig:
    @pytest.fixture(autouse=True)
    def _db(self, test_engine, db_setup, monkeypatch):
        factory = sessionmaker(
            bind=test_engine, class_=AsyncSession, expire_on_commit=False
        )
        monkeypatch.setattr(ais_stream, "AsyncSessionLocal", factory)
        self.factory = factory

    async def test_defaults_without_rows(self, monkeypatch):
        monkeypatch.setattr(settings, "aisstream_api_key", " env-key-0000000 ")
        reader = AisStreamReader(AisVesselStore())
        config = await reader._read_config()
        assert config["enabled"] is False
        assert (
            config["mode"] == "aisstream" and config["url"] == settings.aisstream_ws_url
        )
        assert config["api_key"] == "env-key-0000000"
        assert config["bounding_boxes"] == ais_stream.WORLD_BOUNDING_BOXES
        assert config["source_mode"] == "online"

    async def test_settings_rows_win(self, monkeypatch):
        monkeypatch.setattr(settings, "aisstream_api_key", "env-key-0000000")
        async with self.factory() as db:
            await upsert_setting(db, "sea", "enabled", True)
            await upsert_setting(db, "sea", "aisstreamApiKey", "  saved-key-000000 ")
            await upsert_setting(db, "sea", "aisBoundingBoxes", [[[50, 0], [52, 2]]])
            await upsert_setting(db, "sea", "sourceOverride", "offgrid")
            await upsert_setting(
                db, "sea", "offgridSource", {"url": "tcp://sentry:10110"}
            )
        reader = AisStreamReader(AisVesselStore())
        config = await reader._read_config()
        assert config["enabled"] is True
        assert config["api_key"] == "saved-key-000000"
        assert config["bounding_boxes"] == [[[50.0, 0.0], [52.0, 2.0]]]
        assert config["source_mode"] == "offgrid"
        assert (
            config["mode"] == "unsupported-source"
            and config["url"] == "tcp://sentry:10110"
        )

    async def test_offgrid_without_source_is_no_source(self):
        async with self.factory() as db:
            await upsert_setting(db, "sea", "sourceOverride", "offgrid")
        reader = AisStreamReader(AisVesselStore())
        assert (await reader._read_config())["mode"] == "no-source"


# ── frame handling edge cases ─────────────────────────────────────────────────


def test_handle_frame_raises_on_auth_error_and_ignores_non_dicts():
    reader = AisStreamReader(AisVesselStore(), clock=lambda: T0)
    reader._handle_frame("[1, 2]")
    reader._handle_frame(b"\xff")
    with pytest.raises(AisStreamAuthError):
        reader._handle_frame(json.dumps({"error": "unauthorized"}))
    assert reader.last_message_at is None


async def test_default_connect_is_a_websockets_client(monkeypatch):
    called = {}

    async def fake_connect(url, **kwargs):
        called["url"] = url
        called["kwargs"] = kwargs
        return "socket"

    monkeypatch.setattr(ais_stream.websockets, "connect", fake_connect)
    assert await AisStreamReader._default_connect("wss://x") == "socket"
    assert called["url"] == "wss://x" and called["kwargs"]["ping_interval"] == 20


async def test_close_quietly_swallows_errors():
    class Bad:
        async def close(self):
            raise RuntimeError("gone")

    await ais_stream._close_quietly(None)
    await ais_stream._close_quietly(Bad())


async def test_stale_generation_socket_is_closed_and_ignored():
    """A socket that connects after the reader moved on is closed unused."""
    socket = FakeSocket([json.dumps(position())])

    async def connect(url):
        return socket

    reader, _ = make_reader(live_config(), connect)
    await reader.ensure()
    reader._generation += 1  # the reader moved on while connect was pending
    await settle()
    assert socket.closed and socket.sent == [] and len(reader.store) == 0
    await reader.stop()


async def test_tick_loop_logs_and_keeps_going(monkeypatch):
    reader, _ = make_reader(live_config(), lambda url: _resolved(FakeSocket([])))
    calls = {"n": 0}

    async def ensure():
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("once")
        raise asyncio.CancelledError

    reader.ensure = ensure
    monkeypatch.setattr(settings, "sea_ais_tick_ms", 0)
    with pytest.raises(asyncio.CancelledError):
        await reader._tick_loop()
    assert calls["n"] == 2
