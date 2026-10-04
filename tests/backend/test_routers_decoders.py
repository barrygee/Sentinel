"""
tests/backend/test_routers_decoders.py

Tests for backend/radio_hub/routers/decoders.py — the HTTP surface for decoder
kinds declared by a manifest (section-containers plan §3.4): registration, the
start/stop/status controls, and the decoder-facing ingest/config pair.

The bridges themselves (sockets, demod, retune) are covered in
test_radio_hub_manifest_decode.py. Here the registry is real and a bridge is
placed in it directly, because each TestClient request runs on its own event
loop and could not keep a real PCM server alive between requests. Pinned:
  * register/ingest/config are secret-gated and fail closed, like every other
    decoder endpoint;
  * each plain-dict failure reason maps to one status code;
  * ingest keeps the 409 gate, publishes decode.<kind>.<radioId>, and relays
    the event to the radio's WebSocket subscribers typed as the kind;
  * config answers 404 for an unknown kind — the decoder's cue to re-register.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from typing import Any

import pytest

from backend.config import settings
from backend.platform.bus import bus
from backend.radio_hub.services import manifest_decode, sdr_decode
from backend.radio_hub.services.decoder_manifest import DecoderManifest
from backend.radio_hub.services.manifest_decode import ManifestDecodeBridge

SECRET = {"X-Decode-Secret": "decoder-secret"}


def _manifest_body(kind: str = "pocsag", **overrides) -> dict[str, Any]:
    return {
        "id": f"decoder-{kind}",
        "kind": "decoder",
        "decoderKind": kind,
        "version": "1.0.0",
        "contracts": "^1",
        "pcm": {"port": 7360, "bwHz": 12_500},
        **overrides,
    }


class _IdleBroadcaster:
    """Never started — a bridge placed in the registry only needs a broadcaster to exist."""

    def subscribe_iq(self) -> asyncio.Queue:
        return asyncio.Queue()

    def unsubscribe_iq(self, queue: asyncio.Queue) -> None:
        pass


@pytest.fixture(autouse=True)
def _decoder_state(monkeypatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "decoder_ingest_secret", "decoder-secret")
    yield
    for unsubscribers in manifest_decode._bus_unsubscribers.values():
        for unsubscribe in unsubscribers:
            unsubscribe()
    manifest_decode._bus_unsubscribers.clear()
    manifest_decode._manifests.clear()
    manifest_decode._bridges.clear()


def _register(kind: str = "pocsag") -> DecoderManifest:
    manifest = DecoderManifest.model_validate(_manifest_body(kind))
    manifest_decode.register(manifest)
    return manifest


def _running_bridge(
    kind: str = "pocsag", radio_id: int = 3, *, running: bool = True
) -> ManifestDecodeBridge:
    """Put a bridge for ``kind`` into the registry as if it were started on ``radio_id``."""
    bridge = ManifestDecodeBridge(
        _IdleBroadcaster(), manifest_decode.get_manifest(kind)
    )
    bridge.radio_id = radio_id
    bridge._running = running
    manifest_decode._bridges[kind] = ("roof:1234", bridge)
    return bridge


def _add_radio(client) -> int:
    return client.post(
        "/api/sdr/radios", json={"name": "Roof", "host": "roof", "port": 1234}
    ).json()["id"]


# ── listing and registration ─────────────────────────────────────────────────


class TestListDecoders:
    def test_empty_until_a_decoder_registers(self, client):
        assert client.get("/api/sdr/decoders").json() == []

    def test_lists_manifests_in_their_wire_shape(self, client):
        _register()
        listed = client.get("/api/sdr/decoders").json()
        assert [entry["decoderKind"] for entry in listed] == ["pocsag"]
        assert listed[0]["pcm"]["bwHz"] == 12_500


class TestRegisterDecoder:
    def test_first_registration_is_created(self, client):
        resp = client.post(
            "/api/sdr/decoders/register", json=_manifest_body(), headers=SECRET
        )
        assert resp.status_code == 201
        assert resp.json() == {
            "status": "registered",
            "kind": "pocsag",
            "pcm_port": 7360,
        }
        assert manifest_decode.get_manifest("pocsag") is not None

    def test_sending_it_again_is_ok_and_unchanged(self, client):
        client.post("/api/sdr/decoders/register", json=_manifest_body(), headers=SECRET)
        resp = client.post(
            "/api/sdr/decoders/register", json=_manifest_body(), headers=SECRET
        )
        assert (resp.status_code, resp.json()["status"]) == (200, "unchanged")

    def test_a_new_version_replaces_it(self, client):
        client.post("/api/sdr/decoders/register", json=_manifest_body(), headers=SECRET)
        resp = client.post(
            "/api/sdr/decoders/register",
            json=_manifest_body(version="1.1.0"),
            headers=SECRET,
        )
        assert (resp.status_code, resp.json()["status"]) == (200, "replaced")

    def test_a_conflict_says_why(self, client):
        client.post("/api/sdr/decoders/register", json=_manifest_body(), headers=SECRET)
        resp = client.post(
            "/api/sdr/decoders/register",
            json=_manifest_body(id="decoder-other"),
            headers=SECRET,
        )
        assert resp.status_code == 409
        assert resp.json()["detail"]["reason"] == "kind_taken"

    def test_an_invalid_manifest_is_rejected_and_not_registered(self, client):
        resp = client.post(
            "/api/sdr/decoders/register", json=_manifest_body("aprs"), headers=SECRET
        )
        assert resp.status_code == 422
        assert manifest_decode.get_manifest("aprs") is None

    def test_needs_the_decoder_secret(self, client):
        resp = client.post(
            "/api/sdr/decoders/register",
            json=_manifest_body(),
            headers={"X-Decode-Secret": "wrong"},
        )
        assert resp.status_code == 401
        assert (
            client.post("/api/sdr/decoders/register", json=_manifest_body()).status_code
            == 401
        )
        assert manifest_decode.get_manifest("pocsag") is None

    def test_fails_closed_without_a_secret(self, client, monkeypatch):
        monkeypatch.setattr(sdr_decode, "resolve_ingest_secret", lambda: "")
        resp = client.post(
            "/api/sdr/decoders/register", json=_manifest_body(), headers=SECRET
        )
        assert resp.status_code == 503


# ── start / stop / status ────────────────────────────────────────────────────


class TestControls:
    def test_an_unregistered_kind_is_404(self, client):
        radio_id = _add_radio(client)
        resp = client.post(
            "/api/sdr/decoders/pocsag/start", json={"radio_id": radio_id}
        )
        assert (resp.status_code, resp.json()["detail"]) == (
            404,
            "Decoder kind not registered",
        )

    def test_an_unknown_radio_is_404(self, client):
        _register()
        resp = client.post("/api/sdr/decoders/pocsag/stop", json={"radio_id": 999})
        assert (resp.status_code, resp.json()["detail"]) == (404, "Radio not found")

    @pytest.mark.parametrize("kind", ["Bad", "a.b", "x"])
    def test_a_malformed_kind_never_reaches_the_hub(self, client, kind):
        assert (
            client.post(
                f"/api/sdr/decoders/{kind}/start", json={"radio_id": 1}
            ).status_code
            == 422
        )

    @pytest.mark.parametrize(
        "body",
        [{"radio_id": 1, "bw_hz": -1}, {"radio_id": 1, "offset_hz": 10_000_001}, {}],
    )
    def test_the_start_body_is_bounded(self, client, body):
        _register()
        assert (
            client.post("/api/sdr/decoders/pocsag/start", json=body).status_code == 422
        )

    @pytest.mark.parametrize(
        "reply, status_code",
        [
            (
                {
                    "ok": False,
                    "reason": "unavailable",
                    "message": "Roof is unavailable. Unplugged.",
                },
                503,
            ),
            (
                {
                    "ok": False,
                    "reason": "connect_failed",
                    "message": "radio connect failed: refused",
                },
                502,
            ),
        ],
    )
    def test_radio_failures_keep_their_message(
        self, client, monkeypatch, reply, status_code
    ):
        async def _start(*args, **kwargs):
            return reply

        monkeypatch.setattr(manifest_decode, "start_on_radio", _start)
        resp = client.post("/api/sdr/decoders/pocsag/start", json={"radio_id": 1})
        assert (resp.status_code, resp.json()["detail"]) == (
            status_code,
            reply["message"],
        )

    def test_start_passes_the_body_through_and_returns_the_reply(
        self, client, monkeypatch
    ):
        calls = []

        async def _start(kind, db, radio_id, *, bw_hz, offset_hz):
            calls.append((kind, radio_id, bw_hz, offset_hz))
            return {"ok": True, "radio_id": radio_id, "active": True}

        monkeypatch.setattr(manifest_decode, "start_on_radio", _start)
        resp = client.post(
            "/api/sdr/decoders/pocsag/start",
            json={"radio_id": 3, "bw_hz": 6_250, "offset_hz": -500},
        )
        assert resp.json() == {"status": "ok", "radio_id": 3, "active": True}
        client.post("/api/sdr/decoders/pocsag/start", json={"radio_id": 3})
        assert calls == [
            ("pocsag", 3, 6_250, -500),
            ("pocsag", 3, None, 0),
        ]  # 0 = the manifest's bandwidth

    def test_stop_and_status_answer_from_the_hub(self, client):
        _register()
        radio_id = _add_radio(client)
        status = client.get(f"/api/sdr/decoders/pocsag/status/{radio_id}").json()
        assert status == {
            "status": "ok",
            "radio_id": radio_id,
            "active": False,
            "decoder_reachable": False,
            "channels_hz": None,
            "on_channel": None,
        }
        stopped = client.post(
            "/api/sdr/decoders/pocsag/stop", json={"radio_id": radio_id}
        )
        assert stopped.json() == {"status": "ok", "radio_id": radio_id, "active": False}


# ── decoder-facing: ingest + config ──────────────────────────────────────────


@pytest.fixture()
def published() -> Iterator[list[dict]]:
    """The payload of every decode.pocsag.* publish."""
    seen: list[dict] = []

    async def _record(payload):
        seen.append(payload)

    unsubscribe = bus.subscribe("decode.pocsag.*", _record)
    yield seen
    unsubscribe()


class TestIngest:
    def test_publishes_for_sections_and_relays_to_the_radios_sockets(
        self, client, published
    ):
        _register()
        bridge = _running_bridge(radio_id=3)
        events = bridge.subscribe_events()
        events.get_nowait()  # the initial decode_status frame

        resp = client.post(
            "/api/sdr/decoders/pocsag/ingest",
            json={"event": {"capcode": 1234567}},
            headers=SECRET,
        )

        assert resp.json() == {"status": "ok"}
        assert published == [{"event": {"capcode": 1234567}, "radio_id": 3}]
        assert events.get_nowait() == {"type": "pocsag", "capcode": 1234567}

    def test_the_decoder_may_type_its_own_frames(self, client, published):
        _register()
        events = _running_bridge().subscribe_events()
        events.get_nowait()
        client.post(
            "/api/sdr/decoders/pocsag/ingest",
            json={"event": {"type": "log", "line": "sync"}},
            headers=SECRET,
        )
        assert events.get_nowait() == {"type": "log", "line": "sync"}

    def test_the_subject_names_the_radio_the_kind_runs_on(self, client):
        _register()
        _running_bridge(radio_id=7)
        seen = []

        async def _record(payload):
            seen.append(payload)

        unsubscribe = bus.subscribe("decode.pocsag.7", _record)
        try:
            client.post(
                "/api/sdr/decoders/pocsag/ingest", json={"event": {}}, headers=SECRET
            )
        finally:
            unsubscribe()
        assert seen == [{"event": {}, "radio_id": 7}]

    def test_409_when_no_session_is_active(self, client, published):
        _register()
        resp = client.post(
            "/api/sdr/decoders/pocsag/ingest", json={"event": {"a": 1}}, headers=SECRET
        )
        assert (resp.status_code, resp.json()["detail"]) == (
            409,
            "pocsag decode not active",
        )
        assert published == []

    def test_404_for_an_unregistered_kind(self, client):
        resp = client.post(
            "/api/sdr/decoders/pocsag/ingest", json={"event": {}}, headers=SECRET
        )
        assert resp.status_code == 404

    def test_needs_the_decoder_secret(self, client, published):
        _register()
        _running_bridge()
        resp = client.post(
            "/api/sdr/decoders/pocsag/ingest",
            json={"event": {}},
            headers={"X-Decode-Secret": "no"},
        )
        assert resp.status_code == 401
        assert published == []

    def test_an_oversized_event_is_refused(self, client, published):
        _register()
        _running_bridge()
        resp = client.post(
            "/api/sdr/decoders/pocsag/ingest",
            json={"event": {"blob": "x" * 5000}},
            headers=SECRET,
        )
        assert resp.status_code == 422
        assert published == []


class TestConfig:
    def test_inactive_until_a_session_serves_pcm(self, client):
        _register()
        assert client.get("/api/sdr/decoders/pocsag/config", headers=SECRET).json() == {
            "active": False
        }
        _running_bridge(running=False)
        assert client.get("/api/sdr/decoders/pocsag/config", headers=SECRET).json() == {
            "active": False
        }

    def test_active_while_a_session_serves_pcm(self, client):
        _register()
        _running_bridge()
        assert client.get("/api/sdr/decoders/pocsag/config", headers=SECRET).json() == {
            "active": True
        }

    def test_404_tells_the_decoder_to_register_again(self, client):
        resp = client.get("/api/sdr/decoders/pocsag/config", headers=SECRET)
        assert (resp.status_code, resp.json()["detail"]) == (
            404,
            "Decoder kind not registered",
        )

    def test_needs_the_decoder_secret(self, client):
        _register()
        assert client.get("/api/sdr/decoders/pocsag/config").status_code == 401
