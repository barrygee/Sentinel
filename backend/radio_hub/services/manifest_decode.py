"""Generic decode bridges for decoder kinds declared by a manifest (plan §3.4).

Voice, APRS and AIS keep their dedicated bridges in `sdr_decode.py`. A new kind
needs no hub code: its container registers a `DecoderManifest`, and the hub runs
one of two generic bridges on the shared PCM spine:

  * `ManifestDecodeBridge` (`ownership: relative`) demodulates at the offset it
    is started with, like the voice bridge;
  * `ManifestChannelOwningBridge` (`ownership: absolute`) owns the manifest's
    `channelsHz` with `ChannelOwningDecodeBridge` semantics — it tunes the radio
    to them, follows the live centre frequency and pulls the radio back when the
    span moves off channel. Two channels are served as stereo, as AIS is.

Like every other kind there is one decoder container per kind, listening on the
manifest's PCM port, so at most one bridge per kind runs at a time: starting a
kind on another radio stops it on the previous one.

Sections drive a kind over the bus, with the same plain-dict replies the HTTP
routes in `radio_hub/routers/decoders.py` translate into status codes:

  hub.decode.<kind>.start   {radio_id, db, bw_hz?, offset_hz?}
  hub.decode.<kind>.stop    {radio_id, db}
  hub.decode.<kind>.status  {radio_id, db}

Failures are `{"ok": False, "reason": ...}` with `reason` one of
`unknown_kind`, `unknown_radio`, `unavailable` (+ `message`) or
`connect_failed` (+ `message`). Decoded events the container ingests are
published as `decode.<kind>.<radioId>`.

Registration is in memory: the hub forgets kinds when it restarts, and a
container whose `/config` poll answers 404 registers again.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from backend.config import settings
from backend.platform.bus import EventPayload, bus
from backend.radio_hub import radios as radio_registry
from backend.radio_hub.services import sdr as sdr_svc
from backend.radio_hub.services.decoder_manifest import DecoderManifest
from backend.radio_hub.services.sdr_decode import (
    ChannelOwningDecodeBridge,
    DemodState,
    PcmDecodeBridge,
    demod_chunk_stereo,
)
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ManifestDecodeBridge(PcmDecodeBridge):
    """PCM bridge for a manifest kind that follows the offset it is given."""

    def __init__(self, broadcaster: sdr_svc.RadioBroadcaster, manifest: DecoderManifest) -> None:
        super().__init__(broadcaster, pcm_port=manifest.pcm.port, default_bw_hz=manifest.pcm.bw_hz)
        self.kind = manifest.decoder_kind
        self.manifest = manifest
        self.radio_id: int | None = None


class ManifestChannelOwningBridge(ChannelOwningDecodeBridge):
    """PCM bridge for a manifest kind that owns absolute channels (1 = mono, 2 = stereo)."""

    def __init__(self, broadcaster: sdr_svc.RadioBroadcaster, manifest: DecoderManifest) -> None:
        super().__init__(broadcaster, pcm_port=manifest.pcm.port, default_bw_hz=manifest.pcm.bw_hz)
        self.kind = manifest.decoder_kind
        self.manifest = manifest
        self.radio_id: int | None = None
        self._channels_hz = tuple(manifest.pcm.channels_hz)
        # The second channel needs its own filter memory, exactly as AIS channel B does.
        self._second_channel_state = DemodState(bw_hz=self._state.bw_hz) if len(self._channels_hz) == 2 else None

    def owned_channels_hz(self) -> tuple[int, ...]:
        return self._channels_hz

    def tune_target_hz(self) -> int:
        # One channel: sit on it. Two: their midpoint, so one span covers both equally.
        return sum(self._channels_hz) // len(self._channels_hz)

    def _apply_offsets(self, center_hz: int) -> None:
        self._state.offset_hz = self._channels_hz[0] - center_hz
        if self._second_channel_state is not None:
            self._second_channel_state.offset_hz = self._channels_hz[1] - center_hz
            self._second_channel_state.bw_hz = self._state.bw_hz

    def _demodulate(self, raw_iq: bytes, sample_rate: int) -> bytes:
        if self._second_channel_state is None:
            return super()._demodulate(raw_iq, sample_rate)
        return demod_chunk_stereo(raw_iq, sample_rate, self._state, self._second_channel_state)


ManifestBridge = ManifestDecodeBridge | ManifestChannelOwningBridge


class RegistrationRejected(Exception):
    """A manifest the hub won't take; `reason` says why."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


# kind → its manifest; kind → (radio key "host:port", running bridge).
_manifests: dict[str, DecoderManifest] = {}
_bridges: dict[str, tuple[str, ManifestBridge]] = {}
_bus_unsubscribers: dict[str, list[Callable[[], None]]] = {}


def _radio_key(host: str, port: int | str) -> str:
    return f"{host}:{int(port)}"


def _reserved_pcm_ports() -> set[int]:
    """The ports the dedicated voice, APRS and AIS bridges listen on."""
    return {settings.decoder_pcm_port, settings.aprs_decoder_pcm_port, settings.ais_decoder_pcm_port}


def register(manifest: DecoderManifest) -> str:
    """Take a decoder's manifest. Returns ``registered``, ``unchanged`` or ``replaced``.

    Raises :class:`RegistrationRejected` when another decoder already holds the
    kind (``kind_taken``), the kind is decoding and its spec would change under
    it (``busy``), or the PCM port belongs to another bridge (``port_in_use``).
    """
    kind = manifest.decoder_kind
    existing = _manifests.get(kind)
    if existing == manifest:
        return "unchanged"
    if existing is not None and existing.id != manifest.id:
        raise RegistrationRejected("kind_taken", f"decoder kind {kind!r} is registered by {existing.id!r}")
    if existing is not None and kind in _bridges:
        raise RegistrationRejected("busy", f"decoder kind {kind!r} is decoding; stop it before changing its manifest")
    other_ports = {other.pcm.port for other_kind, other in _manifests.items() if other_kind != kind}
    if manifest.pcm.port in _reserved_pcm_ports() | other_ports:
        raise RegistrationRejected("port_in_use", f"PCM port {manifest.pcm.port} is already in use")
    _manifests[kind] = manifest
    if existing is None:
        _bus_unsubscribers[kind] = _reply_on_bus(kind)
        logger.info("decoder kind %r registered by %s (pcm tcp :%d)", kind, manifest.id, manifest.pcm.port)
        return "registered"
    logger.info("decoder kind %r manifest replaced by %s", kind, manifest.id)
    return "replaced"


def registered_manifests() -> list[DecoderManifest]:
    return list(_manifests.values())


def get_manifest(kind: str) -> DecoderManifest | None:
    return _manifests.get(kind)


def get_active_bridge(kind: str) -> ManifestBridge | None:
    entry = _bridges.get(kind)
    return entry[1] if entry else None


def get_bridge(kind: str, host: str, port: int) -> ManifestBridge | None:
    entry = _bridges.get(kind)
    if entry is None or entry[0] != _radio_key(host, port):
        return None
    return entry[1]


def find_bridge(host: str, port: int) -> ManifestBridge | None:
    """Whichever manifest kind is decoding on this radio, if any."""
    key = _radio_key(host, port)
    return next((bridge for radio_key, bridge in _bridges.values() if radio_key == key), None)


async def _stop_kind(kind: str) -> None:
    entry = _bridges.pop(kind, None)
    if entry is not None:
        await entry[1].stop()


async def start_on_radio(
    kind: str,
    db: AsyncSession,
    radio_id: int,
    *,
    bw_hz: int | None = None,
    offset_hz: int = 0,
) -> dict[str, Any]:
    """Start (or retune) ``kind`` on a radio. The reply is a plain dict (see module docstring)."""
    manifest = _manifests.get(kind)
    if manifest is None:
        return {"ok": False, "reason": "unknown_kind"}
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if radio is None:
        return {"ok": False, "reason": "unknown_radio"}
    available, why = radio_registry.device_availability(radio)
    if not available:
        return {
            "ok": False,
            "reason": "unavailable",
            "message": f"{radio.get('name') or 'This radio'} is unavailable. {why}",
        }
    try:
        broadcaster = await sdr_svc.get_or_create_broadcaster(radio["host"], radio["port"])
    except ConnectionError as exc:
        return {"ok": False, "reason": "connect_failed", "message": f"radio connect failed: {exc}"}

    key = _radio_key(radio["host"], radio["port"])
    entry = _bridges.get(kind)
    if entry is not None and entry[0] != key:
        await _stop_kind(kind)
        entry = None
    if entry is None:
        bridge_class = ManifestChannelOwningBridge if manifest.pcm.ownership == "absolute" else ManifestDecodeBridge
        bridge = bridge_class(broadcaster, manifest)
        _bridges[kind] = (key, bridge)
    else:
        bridge = entry[1]
    # The ingest publish (decode.<kind>.<radio_id>) needs the business radio id;
    # the bridge itself is keyed by host:port.
    bridge.radio_id = radio_id
    await bridge.start(offset_hz=offset_hz, bw_hz=bw_hz or None)
    return {"ok": True, "radio_id": radio_id, "active": True}


async def stop_on_radio(kind: str, db: AsyncSession, radio_id: int) -> dict[str, Any]:
    """Stop ``kind`` if it is decoding on this radio."""
    if kind not in _manifests:
        return {"ok": False, "reason": "unknown_kind"}
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if radio is None:
        return {"ok": False, "reason": "unknown_radio"}
    if get_bridge(kind, radio["host"], radio["port"]) is not None:
        await _stop_kind(kind)
    return {"ok": True, "radio_id": radio_id, "active": False}


async def status_on_radio(kind: str, db: AsyncSession, radio_id: int) -> dict[str, Any]:
    """Whether ``kind`` is decoding on this radio, decoder reachability and channel state.

    ``on_channel`` is only meaningful for an absolute kind (``None`` otherwise):
    false means the span has moved off the owned channels and a retune is due.
    """
    manifest = _manifests.get(kind)
    if manifest is None:
        return {"ok": False, "reason": "unknown_kind"}
    radios = await radio_registry.get_radios(db)
    radio = radio_registry.get_radio_by_id(radios, radio_id)
    if radio is None:
        return {"ok": False, "reason": "unknown_radio"}
    bridge = get_bridge(kind, radio["host"], radio["port"])
    owns_channels = manifest.pcm.ownership == "absolute"
    return {
        "ok": True,
        "radio_id": radio_id,
        "active": bool(bridge and bridge.running),
        "decoder_reachable": bool(bridge and bridge.decoder_reachable),
        "channels_hz": list(manifest.pcm.channels_hz) if owns_channels else None,
        "on_channel": bool(isinstance(bridge, ManifestChannelOwningBridge) and bridge.on_channel)
        if owns_channels
        else None,
    }


def _reply_on_bus(kind: str) -> list[Callable[[], None]]:
    """Answer ``hub.decode.<kind>.{start,stop,status}``; returns their unsubscribers."""

    async def on_start(payload: EventPayload) -> dict[str, Any]:
        return await start_on_radio(
            kind,
            payload["db"],
            payload["radio_id"],
            bw_hz=payload.get("bw_hz"),
            offset_hz=payload.get("offset_hz", 0),
        )

    async def on_stop(payload: EventPayload) -> dict[str, Any]:
        return await stop_on_radio(kind, payload["db"], payload["radio_id"])

    async def on_status(payload: EventPayload) -> dict[str, Any]:
        return await status_on_radio(kind, payload["db"], payload["radio_id"])

    return [
        bus.reply(f"hub.decode.{kind}.start", on_start),
        bus.reply(f"hub.decode.{kind}.stop", on_stop),
        bus.reply(f"hub.decode.{kind}.status", on_status),
    ]


def wake_all() -> None:
    for _, bridge in _bridges.values():
        bridge.wake()


async def shutdown_all() -> None:
    for kind in list(_bridges):
        try:
            await _stop_kind(kind)
        except Exception:
            logger.exception("Error shutting down %s decode bridge", kind)
