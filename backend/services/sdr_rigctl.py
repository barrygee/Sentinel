"""Minimal rigctld-compatible TCP server for SDR trunk tracking.

Trunked digital systems (P25, DMR Tier III / Capacity-Plus / Connect-Plus,
NXDN, EDACS …) carry voice on channels assigned at call time by a *control
channel*. ``dsd-fme`` decodes that control channel and, on a call grant, asks
its radio to retune to the assigned voice frequency, then back when the call
ends. It issues those retunes over Hamlib's **rigctl** protocol, acting as the
rigctl *client* — normally the *server* is GQRX or SDR++.

In Sentinel the backend owns the single-client ``rtl_tcp`` connection (see
:mod:`backend.services.sdr`) and FM-demodulates one channel for the decoder, so
``dsd-fme`` cannot tune the hardware itself. The backend must therefore *be* the
rigctld server ``dsd-fme`` connects to (``dsd-fme -U <port>``). This module
implements the small command subset ``dsd-fme`` actually sends — ``F`` (set
freq), ``f`` (get freq), ``M`` (set mode/bandwidth), ``l`` (get level) — and
translates each requested frequency into a retune.

Retune strategy (span-aware — :func:`plan_retune`):
  * **Preferred — in-span offset shift.** If the requested frequency falls
    inside the already-captured span (``center_hz ± sample_rate/2``), shift the
    demod NCO offset (:meth:`DigitalDecodeBridge.set_channel`). This is gapless
    and never disturbs the broadcaster or the running control-channel decode —
    it reuses the exact lever the manual digital-decode tuning uses.
  * **Fallback — hardware retune.** If the frequency is outside the span,
    retune the dongle (:meth:`RtlTcpConnection.set_frequency`). This briefly
    interrupts the IQ stream (``rtl_tcp`` stops sending during a retune) and
    moves the whole span, so it is used only when an offset shift cannot reach
    the channel.

The server has no authentication — rigctl defines none — so, like the decoder
PCM port, it is intended to be reachable only on the internal compose network.
"""

from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from backend.config import settings
from backend.services import sdr_decode

logger = logging.getLogger(__name__)

# Short-protocol responses. Hamlib clients read "RPRT <code>" (0 = success) for
# command-style requests, or a bare value line for get-style requests.
RIGCTL_OK = b"RPRT 0\n"
RIGCTL_ERR = b"RPRT 1\n"

# Reported signal level for `l` (get_level). dsd-fme queries it but does not use
# it for tuning decisions in rigctl mode (tuning is driven by control-channel
# decode), so a benign constant keeps its parser happy without faking telemetry.
_REPORTED_LEVEL = b"0\n"


@dataclass(frozen=True)
class RetunePlan:
    """How a requested absolute frequency should be reached.

    ``method`` is ``"offset"`` for an in-span demod shift (``offset_hz`` relative
    to the unchanged ``center_hz``) or ``"hardware"`` for a dongle retune (the
    span moves to ``center_hz`` and the demod offset becomes 0).
    """

    method: Literal["offset", "hardware"]
    offset_hz: int
    center_hz: int
    target_hz: int


def plan_retune(requested_hz: int, center_hz: int, sample_rate: int, guard_hz: int) -> RetunePlan:
    """Decide whether ``requested_hz`` is reachable by an in-span offset shift.

    The usable half-span is ``sample_rate/2`` minus ``guard_hz`` (kept clear so a
    full channel sits inside the span rather than clipping the edge). If the
    requested frequency is within that reach of the current centre, an offset
    shift is planned; otherwise a hardware retune centred on the request.
    """
    usable_half_span = sample_rate / 2 - guard_hz
    if usable_half_span > 0 and abs(requested_hz - center_hz) <= usable_half_span:
        return RetunePlan("offset", requested_hz - center_hz, center_hz, requested_hz)
    return RetunePlan("hardware", 0, requested_hz, requested_hz)


@dataclass(frozen=True)
class RigctlCommand:
    """One parsed rigctl request line."""

    kind: Literal["set_freq", "get_freq", "set_mode", "get_level", "quit", "unknown"]
    frequency_hz: int | None = None
    bandwidth_hz: int | None = None


def _parse_int(tokens: list[str]) -> int | None:
    """Parse the first token as an integer number of Hz, tolerating a float form.

    Returns None when the token is missing or not numeric, so the caller can
    answer the malformed command with an error rather than raising.
    """
    if not tokens:
        return None
    try:
        return int(float(tokens[0]))
    except (TypeError, ValueError):
        return None


def parse_rigctl_command(line: str) -> RigctlCommand:
    """Parse one rigctl protocol line into a :class:`RigctlCommand`.

    Accepts both the short single-letter forms ``dsd-fme`` sends and their long
    aliases. ``F <hz>`` sets frequency, ``f`` gets it, ``M <mode> <bw>`` sets the
    demodulator mode/bandwidth (only the bandwidth is meaningful here), ``l``
    gets the signal level, ``q`` quits. Anything else is ``"unknown"`` and is
    tolerated (answered ``RPRT 0``) so probe commands don't break the session.
    """
    tokens = line.strip().split()
    if not tokens:
        return RigctlCommand("unknown")
    head = tokens[0]
    if head in ("F", "set_freq", "\\set_freq"):
        return RigctlCommand("set_freq", frequency_hz=_parse_int(tokens[1:]))
    if head in ("f", "get_freq", "\\get_freq"):
        return RigctlCommand("get_freq")
    if head in ("M", "set_mode", "\\set_mode"):
        # "M <mode> <bandwidth>" — the mode token is ignored; the bandwidth maps
        # to the channel filter width.
        return RigctlCommand("set_mode", bandwidth_hz=_parse_int(tokens[2:]))
    if head in ("l", "get_level", "\\get_level"):
        return RigctlCommand("get_level")
    if head in ("q", "quit", "\\quit"):
        return RigctlCommand("quit")
    return RigctlCommand("unknown")


# Resolver returning the decode session a retune should act on. Indirected (and
# injectable) so the controller can be unit-tested without a live bridge.
BridgeResolver = Callable[[], "sdr_decode.DigitalDecodeBridge | None"]


class RetuneController:
    """Applies rigctl frequency/bandwidth requests to the active decode session.

    Holds no state of its own: every call resolves the current bridge (only one
    decode session is active at a time) and reads the live centre/sample-rate off
    its connection, so it always targets whatever radio is decoding.
    """

    def __init__(self, resolve_bridge: BridgeResolver | None = None, *, guard_hz: int | None = None) -> None:
        self._resolve_bridge = resolve_bridge or sdr_decode.get_active_bridge
        self._guard_hz = settings.decoder_rigctl_guard_hz if guard_hz is None else guard_hz

    async def set_frequency(self, requested_hz: int) -> bool:
        """Retune to ``requested_hz`` via an offset shift or hardware retune.

        Returns False when no decode session is active (nothing to retune).
        """
        bridge = self._resolve_bridge()
        if bridge is None:
            return False
        connection = bridge.connection
        plan = plan_retune(requested_hz, connection.center_hz, connection.sample_rate, self._guard_hz)
        if plan.method == "hardware":
            await connection.set_frequency(plan.center_hz)
            bridge.set_channel(offset_hz=0)
        else:
            bridge.set_channel(offset_hz=plan.offset_hz)
        logger.info(
            "rigctl retune to %d Hz via %s (offset %d Hz, centre %d Hz)",
            requested_hz,
            plan.method,
            plan.offset_hz,
            plan.center_hz,
        )
        # Surface the retune to the browser from the authoritative source (the
        # rigctl command itself), rather than scraping dsd-fme's log. A retune
        # back to the recorded control channel is flagged so the UI can show
        # "control channel" vs an active call's voice frequency.
        control_channel_hz = get_control_channel()
        bridge.publish_event(
            {
                "type": "trunk_event",
                "tuned_hz": requested_hz,
                "method": plan.method,
                "is_control_channel": control_channel_hz is not None and requested_hz == control_channel_hz,
            }
        )
        return True

    def current_frequency(self) -> int | None:
        """Absolute frequency currently demodulated (centre + demod offset), or None."""
        bridge = self._resolve_bridge()
        if bridge is None:
            return None
        return bridge.connection.center_hz + bridge.current_offset_hz

    def set_bandwidth(self, bandwidth_hz: int) -> bool:
        """Apply a channel bandwidth without disturbing the current demod offset.

        ``set_channel`` resets the offset to 0 unless one is passed, so the live
        offset is read back and re-supplied alongside the new bandwidth.
        """
        bridge = self._resolve_bridge()
        if bridge is None:
            return False
        bridge.set_channel(offset_hz=bridge.current_offset_hz, bw_hz=bandwidth_hz)
        return True


class RigctlServer:
    """Asyncio TCP server speaking the rigctl subset ``dsd-fme`` drives."""

    def __init__(self, *, port: int | None = None, controller: RetuneController | None = None) -> None:
        self._port = settings.decoder_rigctl_port if port is None else port
        self._controller = controller or RetuneController()
        self._server: asyncio.base_events.Server | None = None

    @property
    def port(self) -> int:
        return self._port

    async def start(self) -> None:
        """Begin listening. Idempotent while already running."""
        if self._server is not None:
            return
        self._server = await asyncio.start_server(self._on_client, host="0.0.0.0", port=self._port)
        self._port = self._server.sockets[0].getsockname()[1]
        logger.info("rigctl trunk-tracking server listening on :%d", self._port)

    async def stop(self) -> None:
        """Stop listening and drop the server."""
        if self._server is None:
            return
        self._server.close()
        try:
            await asyncio.wait_for(self._server.wait_closed(), timeout=2.0)
        except Exception:  # pragma: no cover - defensive: close should not hang/raise
            pass
        self._server = None
        logger.info("rigctl trunk-tracking server stopped")

    async def handle_command(self, command: RigctlCommand) -> bytes | None:
        """Map one parsed command to its wire response (None means close the link)."""
        if command.kind == "set_freq":
            if command.frequency_hz is None:
                return RIGCTL_ERR
            applied = await self._controller.set_frequency(command.frequency_hz)
            return RIGCTL_OK if applied else RIGCTL_ERR
        if command.kind == "get_freq":
            frequency = self._controller.current_frequency()
            return f"{frequency}\n".encode() if frequency is not None else RIGCTL_ERR
        if command.kind == "set_mode":
            if command.bandwidth_hz:
                self._controller.set_bandwidth(command.bandwidth_hz)
            return RIGCTL_OK
        if command.kind == "get_level":
            return _REPORTED_LEVEL
        if command.kind == "quit":
            return None
        # Unknown probe (e.g. chk_vfo / dump_state): acknowledge without acting so
        # the client keeps the session open.
        return RIGCTL_OK

    async def _on_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        logger.info("rigctl client connected: %s", peer)
        try:
            while True:
                raw = await reader.readline()
                if not raw:  # client closed the connection
                    break
                response = await self.handle_command(parse_rigctl_command(raw.decode("utf-8", "replace")))
                if response is None:  # explicit quit
                    break
                writer.write(response)
                await writer.drain()
        except (
            ConnectionResetError,
            BrokenPipeError,
            OSError,
            asyncio.CancelledError,
        ):  # pragma: no cover - mid-stream socket drop
            pass
        except Exception:  # pragma: no cover - defensive: a handler bug must not kill the server
            logger.exception("rigctl client error (%s)", peer)
        finally:
            try:
                writer.close()
            except Exception:  # pragma: no cover - close on an already-broken socket
                pass
            logger.info("rigctl client disconnected: %s", peer)


# ── Trunk configuration ─────────────────────────────────────────────────────────
# The desired trunk-tracking state for the single active decode session. The
# decoder supervisor reads this (via GET /api/sdr/decode/config) to decide
# whether to launch dsd-fme in trunk mode and with which channel-map CSV.

# A channel-map / group-list reference is a bare CSV filename within the decoder
# container's mounted maps directory — never a path. This allow-list bounds it to
# a single safe filename component so it cannot traverse out of that directory
# when the decoder interpolates it into a dsd-fme "-C"/"-G" path.
_CSV_NAME = re.compile(r"^[A-Za-z0-9._-]+\.csv$")


def validate_csv_name(name: str | None) -> str | None:
    """Validate a channel-map/group-list CSV filename, or return None if unset.

    Accepts only a plain ``<name>.csv`` component (letters, digits, dot, dash,
    underscore) and rejects anything containing a path separator or ``..``.
    Raises :class:`ValueError` on a non-empty but invalid name so the caller can
    reject the request rather than pass an unsafe value to the decoder.
    """
    if name is None:
        return None
    candidate = name.strip()
    if not candidate:
        return None
    if ".." in candidate or "/" in candidate or "\\" in candidate or not _CSV_NAME.match(candidate):
        raise ValueError(f"invalid channel-map filename: {name!r}")
    return candidate


@dataclass
class TrunkConfig:
    """Desired trunk-tracking state for the active decode session."""

    enabled: bool = False
    channel_map: str | None = None
    group_list: str | None = None

    def as_dict(self) -> dict:
        return {"enabled": self.enabled, "channel_map": self.channel_map, "group_list": self.group_list}


_trunk_config = TrunkConfig()

# Absolute frequency (Hz) of the control channel the operator tuned to when trunk
# tracking was enabled. Used only to label retune events: a retune back to this
# frequency is a "return to control channel", anything else is "following a call".
_control_channel_hz: int | None = None


def set_control_channel(frequency_hz: int | None) -> None:
    """Record the control-channel frequency for labelling subsequent retunes."""
    global _control_channel_hz
    _control_channel_hz = frequency_hz


def get_control_channel() -> int | None:
    """Return the recorded control-channel frequency, or None if unset."""
    return _control_channel_hz


def set_trunk_config(*, enabled: bool, channel_map: str | None = None, group_list: str | None = None) -> TrunkConfig:
    """Set the desired trunk state, validating the CSV filenames. Raises ValueError on a bad name.

    A channel map is required to enable trunking — dsd-fme cannot follow grants
    without one (P25 can self-derive, but a map is still the supported path here).
    """
    safe_channel_map = validate_csv_name(channel_map)
    safe_group_list = validate_csv_name(group_list)
    if enabled and not safe_channel_map:
        raise ValueError("a channel-map CSV is required to enable trunk tracking")
    global _trunk_config
    _trunk_config = TrunkConfig(enabled=enabled, channel_map=safe_channel_map, group_list=safe_group_list)
    return _trunk_config


def get_trunk_config() -> TrunkConfig:
    """Return the current desired trunk configuration."""
    return _trunk_config


def reset_trunk_config() -> None:
    """Clear trunk state back to disabled (called when a decode session ends)."""
    global _trunk_config, _control_channel_hz
    _trunk_config = TrunkConfig()
    _control_channel_hz = None


# ── Server lifecycle singleton ──────────────────────────────────────────────────
# One rigctld server serves the single active decode session (only one decoder
# runs at a time), mirroring the bridge-cache pattern in sdr_decode.

_server: RigctlServer | None = None


async def start_rigctl_server() -> RigctlServer:
    """Start the shared rigctl server if not already running, and return it."""
    global _server
    if _server is None:
        server = RigctlServer()
        await server.start()
        _server = server
    return _server


async def stop_rigctl_server() -> None:
    """Stop and drop the shared rigctl server, if running."""
    global _server
    if _server is not None:
        await _server.stop()
        _server = None


def get_rigctl_server() -> RigctlServer | None:
    """Return the shared rigctl server, or None if not running."""
    return _server
