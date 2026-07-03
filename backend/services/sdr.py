"""SDR service — rtl_tcp connection manager and IQ/FFT processing pipeline.

Each SdrRadio connects to a remote rtl_tcp daemon via a raw asyncio TCP socket.
IQ samples are read by a single background broadcaster task per radio; computed
spectrum frames are fanned out to all subscribed WebSocket queues.  This avoids
the "readexactly() called while another coroutine is already waiting" error that
occurs when multiple WebSocket handlers share the same StreamReader.

rtl_tcp binary command format: 5 bytes — [cmd_byte (1)] [value (4, big-endian uint32)]
Key commands:
  0x01  set center frequency (Hz)
  0x02  set sample rate (Hz)
  0x03  set gain mode (0=auto, 1=manual)
  0x04  set gain (tenths of dB, e.g. 300 = 30.0 dB)
  0x05  set frequency correction (ppm)
  0x08  set AGC mode (0=off, 1=on)
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np
from backend.config import settings

logger = logging.getLogger(__name__)


class ReadOnlyTuningError(RuntimeError):
    """Raised when a tuning change is requested but another instance owns the tuner.

    Two Sentinel backends sharing one dongle coordinate a single tuning owner over
    the relay's control channel (see ``RelayControlClient``). A follower that tries
    to retune (and can't claim the freed token because the token is held) raises
    this instead of silently moving — nothing — so the WebSocket layer can tell the
    browser it is read-only.
    """


# Default FFT parameters
DEFAULT_FFT_SIZE = 1024  # bins used for spectrum display
MIN_FFT_SIZE = 1024  # client-requested floor (one bin / ~1 device px on small displays)
MAX_FFT_SIZE = 32768  # ceiling: CPU cost grows with FFT size. 32k keeps
# the waterfall crisp out to ~16x zoom on a 2000-px
# canvas; SDR++ uses 65k+, but 32k is the sweet
# spot between Pi CPU load and visual fidelity.
# Tried 65536 — Pi can't keep up: FFT frames drop
# and audio chops on wide bandwidths.
DEFAULT_SAMPLE_RATE = 2_048_000
# One spectrum frame is produced per IQ read. Sizing the read by a fixed
# SAMPLE COUNT made the frame rate collapse whenever the sample rate dropped:
# changing bandwidth snaps the rtl_tcp sample rate down (e.g. 500k BW → 300k
# Hz), so a fixed 87040-sample read spanned ~290ms instead of ~42ms → ~3 fps
# → jumpy waterfall ("it broke when I changed the bandwidth"). Instead, size
# the read by TIME so the frame rate stays ~constant regardless of sample
# rate. ~40ms ≈ 25 fps, matching the client's waterfall cap.
READ_CHUNK_TARGET_MS = 40
READ_CHUNK_MIN_SAMPLES = 4096  # floor: must stay ≥ fft_size and efficient
READ_CHUNK_MAX_SAMPLES = 131072  # ceiling: bound latency / memory

# Auto-reconnect. A single-client rtl_tcp dongle shared by two Sentinel instances
# (or briefly stolen by a Settings reachability probe) drops the active reader.
# Rather than killing the stream on the first drop — which left the status dot
# stuck red until a manual reconnect — the broadcaster retries with capped
# exponential backoff for as long as clients still want the stream.
RECONNECT_BACKOFF_START_S = 1.0
RECONNECT_BACKOFF_MAX_S = 10.0
# Idle release. Once the last subscriber leaves, keep the rtl_tcp socket open for a
# short grace period (absorbs a quick WS reconnect) then release it, so a second
# instance — or the reachability probe — can reach the same single-client dongle
# instead of being locked out by a broadcaster streaming to nobody.
IDLE_RELEASE_GRACE_S = 10.0

# Connection cache: key = "host:port"
_connections: dict[str, RtlTcpConnection] = {}
# Broadcaster cache: key = "host:port"
_broadcasters: dict[str, RadioBroadcaster] = {}


def _enable_tcp_keepalive(writer: asyncio.StreamWriter) -> None:
    """Turn on aggressive TCP keepalive for an rtl_tcp socket.

    rtl_tcp radios live on the LAN, and a reboot or power-off leaves a half-open
    connection: the peer is gone but our socket stays ESTABLISHED, so a blocked
    ``readexactly`` waits the full read timeout (~10s) before erroring. During that
    window the connection still reports ``connected`` and the status dot stays
    green. Keepalive makes the OS probe the dead peer and fail the socket within a
    few seconds, so the broadcaster detects the drop (and the dot turns red) fast.

    Best-effort and portable: the per-idle/interval/count options are Linux-only
    (the deployment target); each is guarded so dev on macOS/other platforms still
    enables plain SO_KEEPALIVE without raising.
    """
    sock = writer.get_extra_info("socket")
    if sock is None:  # pragma: no cover - always a real socket outside tests
        return
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        # ~2s idle, then probe every 1s, dead after 3 failures ≈ 5s detection.
        # Safe to be this aggressive on a LAN: a healthy 25fps stream never idles
        # long enough to probe, and a live-but-paused peer still ACKs the probes,
        # so this only trips when the radio is genuinely gone.
        if hasattr(socket, "TCP_KEEPIDLE"):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 2)
        if hasattr(socket, "TCP_KEEPINTVL"):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 1)
        if hasattr(socket, "TCP_KEEPCNT"):
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
    except OSError as exc:  # pragma: no cover - setsockopt rarely fails
        logger.debug("Could not set TCP keepalive: %s", exc)


# ── Relay tuning-ownership control client ─────────────────────────────────────


class RelayControlClient:
    """Client for the fan-out relay's NDJSON tuning-ownership control channel.

    Connects to the relay's control port (``host:control_port``), claims the single
    tuning token, and runs a background read loop that keeps ``is_owner`` and the
    mirrored tuner state (``center_hz``/``sample_rate``/``gain_db``/``gain_auto``) in
    step with the relay's ``state`` pushes. Tuning changes go out as semantic ``set``
    messages — the relay (sole writer of commands to the dongle while a token is
    held) applies them and broadcasts the result, so every follower stays truthful.

    A radio reached directly (raw ``rtl_tcp``) or via a relay without the control
    channel simply fails to connect here; callers then fall back to driving the IQ
    socket directly (``available`` stays ``False``).
    """

    def __init__(self, host: str, port: int, on_state: Callable[[dict], None] | None = None) -> None:
        self.host = host
        self.port = port
        self._on_state = on_state
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._read_task: asyncio.Task | None = None
        self._state_event = asyncio.Event()  # set on every received state message
        self.available = False
        self.is_owner = False
        self.locked = False  # the token is held by some instance (possibly another)
        self.center_hz = 0
        self.sample_rate = 0
        self.gain_db = 0.0
        self.gain_auto = False
        # Owner demod state, mirrored to followers so a read-only watcher hears
        # EXACTLY what the owner hears — not just the hardware centre. These ride
        # the same control channel as the hardware params but describe the
        # per-listener demod: the NCO offset within the band, the demod mode, and
        # the audio bandwidth. The relay must pass them through set→state (it
        # already does for gain_db/gain_auto); if it drops them, followers simply
        # fall back to centre-only viewing.
        self.offset_hz = 0
        self.mode = ""
        self.bw_hz = 0

    async def connect(self) -> bool:
        """Open the control channel and start the read loop. Returns availability.

        Best-effort: any failure to reach the control port leaves ``available``
        False so the caller falls back to direct IQ-socket tuning.
        """
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=settings.sdr_relay_control_timeout_s,
            )
        except (TimeoutError, OSError) as exc:
            logger.info("Relay control channel unavailable at %s:%d (%s)", self.host, self.port, exc)
            self.available = False
            return False
        _enable_tcp_keepalive(self._writer)
        self.available = True
        self._read_task = asyncio.create_task(self._read_loop(), name=f"sdr-control-{self.host}:{self.port}")
        # Consume the relay's initial state push so a later claim()/set() awaits its
        # OWN response rather than racing this one (both signal the same event).
        await self._await_next_state()
        return True

    async def _read_loop(self) -> None:
        """Apply each ``state`` message the relay pushes (connect, claim, retune)."""
        reader = self._reader
        if reader is None:  # pragma: no cover - connect() always sets the reader first
            return
        try:
            while True:
                line = await reader.readline()
                if not line:  # relay closed the control connection
                    break
                try:
                    message = json.loads(line)
                except (json.JSONDecodeError, ValueError):
                    continue
                if not isinstance(message, dict) or message.get("event") != "state":
                    continue
                self.is_owner = bool(message.get("owner"))
                self.locked = bool(message.get("locked"))
                self.center_hz = int(message.get("center_hz", self.center_hz))
                self.sample_rate = int(message.get("sample_rate", self.sample_rate))
                self.gain_db = float(message.get("gain_db", self.gain_db))
                self.gain_auto = bool(message.get("gain_auto", self.gain_auto))
                # Owner demod state — null-guarded (a relay that doesn't carry these
                # simply omits them, leaving the follower's last-known values). mode
                # only updates on a non-empty string so a missing field never blanks
                # the follower's demod.
                if message.get("offset_hz") is not None:
                    self.offset_hz = int(message["offset_hz"])
                if message.get("bw_hz") is not None:
                    self.bw_hz = int(message["bw_hz"])
                mode_value = message.get("mode")
                if isinstance(mode_value, str) and mode_value:
                    self.mode = mode_value
                self._state_event.set()
                if self._on_state is not None:
                    self._on_state(message)
        except (OSError, ConnectionError, asyncio.CancelledError):
            pass

    async def _send(self, message: dict) -> None:
        writer = self._writer
        if writer is None:
            return
        writer.write((json.dumps(message) + "\n").encode("utf-8"))
        await writer.drain()

    async def _await_next_state(self) -> None:
        """Block until the next state push arrives (bounded by the control timeout)."""
        self._state_event.clear()
        try:
            await asyncio.wait_for(self._state_event.wait(), timeout=settings.sdr_relay_control_timeout_s)
        except TimeoutError:
            pass

    async def claim(self) -> bool:
        """Try to become the tuning owner; returns whether this client now owns it.

        The relay replies with exactly one ``state`` message either way (owner=True
        if the token was free, owner=False if another client holds it).
        """
        if not self.available:
            return False
        await self._send({"op": "claim"})
        await self._await_next_state()
        return self.is_owner

    async def release(self) -> None:
        """Give up the tuning token but KEEP the control channel connected.

        Distinct from ``close()`` (which tears down the socket): the read loop stays
        alive so this instance remains a live follower — still receiving state and
        able to reclaim later by tuning — while another instance is free to take
        over. Used when the owner stops/deselects so it stops hogging the dongle.
        The relay echoes a fresh ``state`` (owner=False, locked=False) which the
        read loop applies and fans to this instance's own subscribers.
        """
        if not self.available:
            return
        await self._send({"op": "release"})
        await self._await_next_state()
        self.is_owner = False

    async def set(self, **fields: object) -> None:
        """Send a semantic tuning change. Honoured by the relay only while we own it."""
        if not self.available:
            return
        await self._send({"op": "set", **fields})

    async def close(self) -> None:
        """Release ownership (best-effort) and tear down the control connection."""
        if self._writer is not None:
            try:
                await self._send({"op": "release"})
            except OSError:
                pass
        if self._read_task is not None:
            self._read_task.cancel()
            try:
                await self._read_task
            except asyncio.CancelledError:
                pass
            self._read_task = None
        if self._writer is not None:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except (OSError, ConnectionError):
                pass
        self._reader = None
        self._writer = None
        self.available = False
        self.is_owner = False


@dataclass
class RtlTcpConnection:
    host: str
    port: int
    reader: asyncio.StreamReader | None = field(default=None, repr=False)
    writer: asyncio.StreamWriter | None = field(default=None, repr=False)
    connected: bool = False
    center_hz: int = 100_000_000
    sample_rate: int = DEFAULT_SAMPLE_RATE
    gain_db: float = 30.0
    gain_auto: bool = False
    mode: str = "AM"
    # Demod state shared owner→followers over the control channel (see
    # RelayControlClient). `demod_offset_hz` is the NCO offset within the band and
    # `bw_hz` the audio bandwidth; `mode` above doubles as the shared demod mode.
    # For an owner these mirror what its browser is doing; for a follower they are
    # adopted from the relay so its own browser can reproduce the owner's audio.
    demod_offset_hz: int = 0
    bw_hz: int = 0
    fft_size: int = DEFAULT_FFT_SIZE
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    # Tuning-ownership control channel (None until the first connect attempt).
    # ``control_available`` is False for a raw rtl_tcp / pre-control-channel relay,
    # in which case tuning falls back to direct IQ-socket commands.
    control: RelayControlClient | None = field(default=None, repr=False)
    control_available: bool = False
    is_owner: bool = False
    # Set by the broadcaster so a relay-pushed retune (the owner moving the dongle)
    # can be forwarded to this connection's WebSocket subscribers immediately.
    state_change_callback: Callable[[], None] | None = field(default=None, repr=False)

    @property
    def control_port(self) -> int:
        """The relay control-channel port derived from the IQ port + configured offset."""
        return self.port + settings.sdr_relay_control_port_offset

    @property
    def tuner_locked(self) -> bool:
        """Whether the shared tuner is currently owned by some instance (maybe another).

        A follower distinguishes "another instance is tuning" (read-only) from "the
        token is free" (a tune attempt can take it over) with this flag.
        """
        return self.control.locked if self.control is not None else False

    async def connect(self) -> None:
        async with self._lock:
            if self.connected:
                return
            try:
                self.reader, self.writer = await asyncio.wait_for(
                    asyncio.open_connection(self.host, self.port),
                    timeout=5.0,
                )
                self.connected = True
                _enable_tcp_keepalive(self.writer)
                logger.info("Connected to rtl_tcp at %s:%d", self.host, self.port)
                # rtl_tcp sends a 12-byte magic header on connect — discard it
                await asyncio.wait_for(self.reader.read(12), timeout=3.0)
                # Establish the tuning-ownership control channel once (it persists
                # across IQ-socket reconnects so a transient stream drop never costs
                # ownership). With control available the relay drives the dongle, so
                # we must NOT also push commands over the IQ socket.
                await self._ensure_control()
                if not self.control_available:
                    # Legacy / raw rtl_tcp path. Configure the device immediately:
                    # rtl_tcp otherwise streams at its own default rate (which this
                    # Pi can't sustain → ~3 fps, jumpy) until a sample_rate command
                    # arrives. Pushing our defaults here makes every connect path
                    # produce a healthy stream from the start.
                    await self._send_command(0x02, self.sample_rate)  # set sample rate
                    await self._send_command(0x01, self.center_hz)  # set frequency
            except Exception as exc:
                self.connected = False
                raise ConnectionError(f"Cannot connect to rtl_tcp at {self.host}:{self.port}: {exc}") from exc

    async def _ensure_control(self) -> None:
        """Connect the control channel and claim ownership, once per connection.

        Idempotent across IQ reconnects. When this client becomes the owner it
        asserts sample rate + centre frequency (exactly what the legacy direct
        ``connect()`` pushed, so the stream starts at a healthy rate); gain is left
        for the explicit connect/WS commands that follow. When another instance
        already owns the tuner, this client becomes a read-only follower and adopts
        the relay's reported tuning so its frames are labelled correctly.
        """
        if self.control is not None and self.control.available:
            return
        control = RelayControlClient(self.host, self.control_port, on_state=self._on_control_state)
        if not await control.connect():
            self.control_available = False
            return
        self.control = control
        self.control_available = True
        became_owner = await control.claim()
        self.is_owner = became_owner
        if became_owner:
            await control.set(sample_rate=self.sample_rate, center_hz=self.center_hz)
        else:
            # Follower: adopt the owner's live tuning so our FFT/IQ frames are
            # labelled with the real centre frequency instead of our stale default.
            self._adopt_control_state(control)

    def _adopt_control_state(self, control: RelayControlClient) -> None:
        """Copy the relay's reported tuner state onto this connection."""
        if control.sample_rate:
            self.sample_rate = control.sample_rate
        if control.center_hz:
            self.center_hz = control.center_hz
        self.gain_db = control.gain_db
        self.gain_auto = control.gain_auto
        # Adopt the owner's demod state so a follower's frames/WS carry the real
        # offset/mode/bandwidth (mode only when the relay actually supplied one).
        self.demod_offset_hz = control.offset_hz
        self.bw_hz = control.bw_hz
        if control.mode:
            self.mode = control.mode

    def _on_control_state(self, _message: dict) -> None:
        """Relay state push: mirror ownership + tuning, then notify WS subscribers."""
        if self.control is None:
            return  # pragma: no cover - callback only fires while control is set
        self.is_owner = self.control.is_owner
        self._adopt_control_state(self.control)
        if self.state_change_callback is not None:
            self.state_change_callback()

    async def disconnect(self) -> None:
        async with self._lock:
            self.connected = False
            if self.writer:
                try:
                    self.writer.close()
                    await self.writer.wait_closed()
                except Exception:
                    pass
            self.reader = None
            self.writer = None
            logger.info("Disconnected from rtl_tcp at %s:%d", self.host, self.port)

    async def close_control(self) -> None:
        """Tear down the control channel (releasing ownership). For permanent close."""
        if self.control is not None:
            await self.control.close()
            self.control = None
        self.control_available = False
        self.is_owner = False

    async def _claim_or_read_only(self) -> None:
        """Ensure this connection owns the tuner before a control-mode tuning change.

        Claims the token if it is free (implicit takeover of an unowned tuner — not
        the deferred forcible handoff from a live owner); raises ``ReadOnlyTuningError``
        when another instance holds it so nothing touches the shared hardware.
        """
        assert self.control is not None  # control_available implies control is set
        if not self.control.is_owner:
            await self.control.claim()
        if not self.control.is_owner:
            raise ReadOnlyTuningError(f"another instance owns the tuner at {self.host}:{self.port}")
        self.is_owner = True

    async def _send_command(self, cmd: int, value: int) -> None:
        if not self.connected or not self.writer:
            raise ConnectionError("Not connected")
        data = bytes([cmd]) + value.to_bytes(4, "big")
        self.writer.write(data)
        await self.writer.drain()

    async def set_frequency(self, freq_hz: int) -> None:
        if self.control_available and self.control is not None:
            await self._claim_or_read_only()
            await self.control.set(center_hz=freq_hz)
            self.center_hz = freq_hz
            return
        await self._send_command(0x01, freq_hz)
        self.center_hz = freq_hz

    async def release_ownership(self) -> None:
        """Release the shared tuner so another instance can take over.

        No-op unless this connection actually owns it over a live control channel
        (a follower or a raw rtl_tcp has nothing to release). The control channel
        stays connected — only the token is handed back.
        """
        if self.control_available and self.control is not None and self.is_owner:
            await self.control.release()
            self.is_owner = False

    async def claim_ownership(self) -> None:
        """Take the shared tuner when it is free (an actively-watching follower
        grabbing control the instant the owner releases it — a clean handoff).

        Attempts a fresh claim over the control channel; the relay grants it only if
        the token is actually free, so this never steals an active owner's tuner.
        No-op for a raw rtl_tcp / when we already own it.
        """
        if self.control_available and self.control is not None and not self.is_owner:
            await self.control.claim()
            self.is_owner = self.control.is_owner

    async def set_demod(self, offset_hz: int, mode: str, bw_hz: int) -> None:
        """Record this instance's demod state and, when we own the shared tuner,
        publish it to followers over the relay control channel.

        Unlike ``set_frequency``/``set_gain_*`` this touches no hardware — the demod
        (NCO offset within the band, mode, audio bandwidth) is done in each browser.
        We forward it so read-only watchers can reproduce the owner's audio exactly
        instead of only tracking the hardware centre. A follower never forwards
        (``is_owner`` is False); a single instance / raw rtl_tcp just stores it.
        """
        self.demod_offset_hz = offset_hz
        self.mode = mode
        self.bw_hz = bw_hz
        if self.control_available and self.control is not None and self.is_owner:
            await self.control.set(offset_hz=offset_hz, mode=mode, bw_hz=bw_hz)

    async def set_sample_rate(self, rate_hz: int) -> None:
        if self.control_available and self.control is not None:
            await self._claim_or_read_only()
            await self.control.set(sample_rate=rate_hz)
            self.sample_rate = rate_hz
            return
        await self._send_command(0x02, rate_hz)
        self.sample_rate = rate_hz

    async def set_gain_auto(self) -> None:
        if self.control_available and self.control is not None:
            await self._claim_or_read_only()
            await self.control.set(gain_auto=True)
            self.gain_auto = True
            return
        await self._send_command(0x03, 0)  # gain mode = auto
        await self._send_command(0x08, 1)  # AGC on
        self.gain_auto = True

    async def set_gain_manual(self, gain_db: float) -> None:
        if self.control_available and self.control is not None:
            await self._claim_or_read_only()
            await self.control.set(gain_auto=False, gain_db=gain_db)
            self.gain_db = gain_db
            self.gain_auto = False
            return
        await self._send_command(0x03, 1)  # gain mode = manual
        await self._send_command(0x08, 0)  # AGC off
        tenths = max(0, int(round(gain_db * 10)))
        await self._send_command(0x04, tenths)
        self.gain_db = gain_db
        self.gain_auto = False

    def set_fft_size(self, n: int) -> None:
        """Snap n to a power of two within [MIN_FFT_SIZE, MAX_FFT_SIZE]."""
        if n < MIN_FFT_SIZE:
            n = MIN_FFT_SIZE
        elif n > MAX_FFT_SIZE:
            n = MAX_FFT_SIZE
        # Round UP to next power of two so canvas-derived requests aren't halved
        # (frontend already rounds up to ensure ≥1 device-px per bin; rounding
        # down here would undo that and produce a chunky raster on wide displays).
        if n & (n - 1):
            p = 1 << n.bit_length()
        else:
            p = n
        if p > MAX_FFT_SIZE:
            p = MAX_FFT_SIZE
        self.fft_size = p

    async def read_iq_chunk(self) -> bytes:
        """Read ~READ_CHUNK_TARGET_MS of IQ, sized by the CURRENT sample rate.

        Sizing by time (not a fixed sample count) keeps the spectrum frame
        rate ~constant when the sample rate changes with bandwidth.
        """
        if not self.connected or not self.reader:
            raise ConnectionError("Not connected")
        sr = self.sample_rate or DEFAULT_SAMPLE_RATE
        n = int(sr * READ_CHUNK_TARGET_MS / 1000)
        n = min(READ_CHUNK_MAX_SAMPLES, n)
        # Floor must stay ≥ fft_size so compute_fft_frame has enough samples.
        n = max(READ_CHUNK_MIN_SAMPLES, self.fft_size, n)
        data = await asyncio.wait_for(
            self.reader.readexactly(n * 2),  # 2 bytes per IQ pair
            timeout=10.0,
        )
        return data


# ── Fan-out broadcaster ───────────────────────────────────────────────────────


class RadioBroadcaster:
    """Single read loop per radio; fans computed frames and raw IQ to subscriber queues."""

    def __init__(self, conn: RtlTcpConnection) -> None:
        self._conn = conn
        self._subscribers: list[asyncio.Queue] = []  # FFT JSON frames
        self._iq_subscribers: list[asyncio.Queue] = []  # raw IQ bytes
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

    @property
    def connection(self) -> RtlTcpConnection:
        """The underlying rtl_tcp connection (center freq, sample rate, retune)."""
        return self._conn

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=4)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def subscribe_iq(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=4)
        self._iq_subscribers.append(q)
        return q

    def unsubscribe_iq(self, q: asyncio.Queue) -> None:
        try:
            self._iq_subscribers.remove(q)
        except ValueError:
            pass

    async def start_iq_recording(self, file_path: str) -> asyncio.Queue:
        """Subscribe to the IQ stream and write raw uint8 IQ pairs to file_path.

        Returns the queue so the caller can stop recording via stop_iq_recording().
        File format: raw uint8 interleaved I/Q pairs (no header) — standard .u8 SDR format.
        sample_rate and center_hz are stored in the SdrRecording DB row, not in the file.
        """
        q: asyncio.Queue = asyncio.Queue(maxsize=8)
        self._iq_subscribers.append(q)
        asyncio.create_task(self._drain_iq_to_file(q, file_path))
        return q

    async def _drain_iq_to_file(self, q: asyncio.Queue, file_path: str) -> None:
        """Drain the IQ subscriber queue to disk.

        Strips the 8-byte header (sample_rate + center_hz) from each broadcast
        payload and writes only the raw uint8 IQ bytes.
        """
        import aiofiles

        try:
            async with aiofiles.open(file_path, "wb") as f:
                while True:
                    payload = await q.get()
                    if payload is None:  # sentinel → recording stopped
                        break
                    await f.write(payload[8:])  # skip 8-byte header, write raw IQ
        except Exception as exc:
            logger.warning("IQ file write error (%s): %s", file_path, exc)

    def stop_iq_recording(self, q: asyncio.Queue) -> None:
        """Unsubscribe the recording queue and signal the drain task to finish."""
        self.unsubscribe_iq(q)
        try:
            q.put_nowait(None)  # sentinel to unblock the drain coroutine
        except asyncio.QueueFull:
            pass

    def _on_control_state(self) -> None:
        """Relay tuning-ownership change → push a ``control`` frame to subscribers.

        Lets a follower's UI react the instant the owner retunes (or the token frees)
        rather than waiting to infer it from the next relabelled spectrum frame.
        """
        conn = self._conn
        self._broadcast(
            {
                "type": "control",
                "is_owner": conn.is_owner,
                "control_available": conn.control_available,
                "locked": conn.tuner_locked,
                "center_hz": conn.center_hz,
                "sample_rate": conn.sample_rate,
                "gain_db": conn.gain_db,
                "gain_auto": conn.gain_auto,
                "mode": conn.mode,
                "offset_hz": conn.demod_offset_hz,
                "bw_hz": conn.bw_hz,
            }
        )

    async def start(self) -> None:
        async with self._lock:
            # Forward relay-pushed ownership/tuning changes to WS subscribers.
            self._conn.state_change_callback = self._on_control_state
            if self._task and not self._task.done():
                return
            self._task = asyncio.create_task(self._run(), name=f"sdr-broadcast-{self._conn.host}:{self._conn.port}")

    async def stop(self) -> None:
        async with self._lock:
            # Unblock every subscriber that's parked on `await queue.get()`
            # (WS stream loops and IQ recording drains) with a None sentinel,
            # so those handlers exit promptly. Without this they block forever
            # and uvicorn's graceful shutdown hangs ("Waiting for background
            # tasks to complete").
            for q in [*self._subscribers, *self._iq_subscribers]:
                try:
                    q.put_nowait(None)
                except asyncio.QueueFull:
                    pass
            self._subscribers.clear()
            self._iq_subscribers.clear()
            if self._task:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
                self._task = None

    def _has_subscribers(self) -> bool:
        """True while any client (FFT spectrum or raw IQ) still wants the stream."""
        return bool(self._subscribers or self._iq_subscribers)

    async def _reconnect(self) -> bool:
        """Re-establish the rtl_tcp connection after a drop, while clients still want it.

        Returns ``True`` once reconnected (the read loop resumes for the same
        subscribers), or ``False`` to stop the broadcaster because no subscribers
        remain. A second Sentinel instance — or even its Settings reachability
        probe — connecting to the same Pi steals the single-client dongle and
        drops our reader; retrying with capped backoff lets the stream recover on
        its own the moment the dongle is free again, instead of leaving the status
        dot stuck red until a manual reconnect.
        """
        conn = self._conn
        await conn.disconnect()
        # Tell viewers we dropped but are recovering. Deliberately a "status"
        # frame, NOT an "error" frame: an error frame makes the WS handler close
        # the socket and drop the subscriber, which would defeat the in-place
        # reconnect we are about to attempt.
        self._broadcast({"type": "status", "connected": False, "reconnecting": True})
        backoff = RECONNECT_BACKOFF_START_S
        while self._has_subscribers():
            try:
                await conn.connect()
            except Exception as exc:
                logger.debug("rtl_tcp reconnect failed (%s:%d): %s", conn.host, conn.port, exc)
                await asyncio.sleep(backoff)
                backoff = min(RECONNECT_BACKOFF_MAX_S, backoff * 2)
                continue
            logger.info("Broadcaster reconnected to %s:%d", conn.host, conn.port)
            return True
        return False

    async def _run(self) -> None:
        conn = self._conn
        logger.info("Broadcaster started for %s:%d", conn.host, conn.port)
        idle_since: float | None = None
        try:
            while True:
                # Yield to the event loop every iteration. rtl_tcp streams
                # continuously and TCP backlog can make read_iq_chunk return
                # with no real suspension, letting this loop monopolise the
                # loop and starve HTTP/WS handlers (even /health). sleep(0)
                # guarantees other tasks get scheduled each pass.
                await asyncio.sleep(0)

                # Release the dongle when nobody is watching. rtl_tcp serves ONE
                # client at a time, so holding the socket open with zero
                # subscribers would lock a second instance (or a reachability
                # probe) out of the same Pi indefinitely. The grace period
                # absorbs brief gaps such as a WS client reconnecting.
                if not self._has_subscribers():
                    if idle_since is None:
                        idle_since = time.monotonic()
                    elif time.monotonic() - idle_since >= IDLE_RELEASE_GRACE_S:
                        logger.info("Broadcaster idle, releasing %s:%d", conn.host, conn.port)
                        # Hand back the tuning token too, not just the IQ socket —
                        # otherwise this instance keeps owning the shared tuner with
                        # nobody watching, locking every other instance out. The
                        # control channel is torn down here; it re-establishes (and
                        # re-claims only if the user tunes) on the next connect.
                        await conn.close_control()
                        await conn.disconnect()
                        break
                else:
                    idle_since = None

                try:
                    raw_iq = await conn.read_iq_chunk()
                except asyncio.IncompleteReadError:
                    # readexactly raises this only at EOF. A reader at EOF means
                    # the rtl_tcp session closed — the radio rebooted/unplugged,
                    # or a second client stole the single-client dongle — so try
                    # to reconnect rather than skip (skipping spin-locked the loop
                    # on repeated EOF). Only a partial read that is NOT at EOF is a
                    # transient blip worth skipping.
                    if conn.reader is None or conn.reader.at_eof():
                        logger.warning("rtl_tcp stream closed (%s:%d)", conn.host, conn.port)
                        if not await self._reconnect():
                            break
                        idle_since = None
                        continue
                    logger.debug("rtl_tcp incomplete read, skipping")
                    continue
                except (ConnectionError, Exception) as exc:
                    logger.warning("rtl_tcp read error (%s:%d): %s", conn.host, conn.port, exc)
                    if not await self._reconnect():
                        break
                    idle_since = None
                    continue

                # FFT uses only the first fft_size samples from the chunk.
                # compute_fft_frame is CPU-bound NumPy + a per-bin Python loop;
                # run it in a worker thread so it never blocks the event loop
                # (a blocked loop stalls all HTTP/WS handling). Skip it entirely
                # during the idle grace window when no one is subscribed.
                if self._subscribers:
                    frame = await asyncio.to_thread(
                        compute_fft_frame, raw_iq, conn.fft_size, conn.sample_rate, conn.center_hz
                    )
                    self._broadcast(frame)
                self._broadcast_iq(raw_iq, conn.sample_rate, conn.center_hz)
        except asyncio.CancelledError:
            pass
        finally:
            logger.info("Broadcaster stopped for %s:%d", conn.host, conn.port)

    @staticmethod
    def _put_dropping(q: asyncio.Queue, item: object) -> None:
        """Put item onto queue, dropping the oldest entry if the queue is full."""
        try:
            q.put_nowait(item)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(item)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass

    def _broadcast(self, frame: dict) -> None:
        for q in list(self._subscribers):
            self._put_dropping(q, frame)

    def _broadcast_iq(self, raw_iq: bytes, sample_rate: int, center_hz: int) -> None:
        """Fan raw IQ bytes to IQ subscribers.

        Wire format (binary): 4-byte little-endian uint32 sample_rate,
        4-byte little-endian uint32 center_hz, then raw uint8 IQ pairs.
        """
        if not self._iq_subscribers:
            return
        import struct

        header = struct.pack("<II", sample_rate, center_hz)
        payload = header + raw_iq
        for q in list(self._iq_subscribers):
            self._put_dropping(q, payload)


# ── FFT ───────────────────────────────────────────────────────────────────────


def _iq_bytes_to_complex(raw: bytes) -> np.ndarray:
    """Convert raw rtl_tcp 8-bit IQ bytes to normalised complex float array."""
    samples = np.frombuffer(raw, dtype=np.uint8).astype(np.float32)
    samples = (samples - 127.5) / 127.5
    return samples[0::2] + 1j * samples[1::2]


def _hann_window(n: int) -> np.ndarray:
    return np.hanning(n).astype(np.float32)


def compute_fft_frame(
    raw_iq: bytes,
    n_fft: int,
    sample_rate: int,
    center_hz: int,
) -> dict:
    """Compute a spectrum frame from raw IQ bytes.

    Uses Welch-style averaging: the IQ chunk is split into as many length-n_fft
    segments as fit, each is windowed and FFT'd, and the per-bin powers are
    averaged. Averaging N segments drops noise variance by ~1/N (≈ 10·log10(N)
    dB of smoothing) while leaving real signals where they are, matching SDR++
    / GQRX behaviour and turning the grainy noise floor into a smooth band.
    """
    iq_all = _iq_bytes_to_complex(raw_iq)
    n_avg = max(1, len(iq_all) // n_fft)
    window = _hann_window(n_fft)
    power_sum = np.zeros(n_fft, dtype=np.float64)
    for k in range(n_avg):
        seg = iq_all[k * n_fft : (k + 1) * n_fft] * window
        spectrum = np.fft.fftshift(np.fft.fft(seg, n=n_fft))
        power_sum += np.abs(spectrum) ** 2
    power_avg = power_sum / n_avg
    # Convert to dBFS: 0 dB = full-scale sine wave. With IQ normalised to ±1.0
    # and a Hann window (coherent gain 0.5), a full-scale tone produces a bin
    # magnitude of N/4, i.e. power N²/16. Subtract that to anchor 0 dBFS at
    # the ADC ceiling, matching SDR#/SDR++/GQRX conventions.
    fs_power_db = 10.0 * np.log10((n_fft**2) / 16.0)
    power_db = 10.0 * np.log10(power_avg + 1e-12) - fs_power_db
    return {
        "type": "spectrum",
        "center_hz": center_hz,
        "sample_rate": sample_rate,
        "bins": [round(float(v), 1) for v in power_db],
        "timestamp_ms": int(time.time() * 1000),
    }


# ── Connection cache helpers ──────────────────────────────────────────────────


def get_connection(host: str, port: int) -> RtlTcpConnection | None:
    return _connections.get(f"{host}:{port}")


async def get_or_create_connection(host: str, port: int) -> RtlTcpConnection:
    key = f"{host}:{port}"
    conn = _connections.get(key)
    if conn is None:
        conn = RtlTcpConnection(host=host, port=port)
        _connections[key] = conn
    if not conn.connected:
        await conn.connect()
    return conn


async def close_connection(host: str, port: int) -> None:
    key = f"{host}:{port}"
    broadcaster = _broadcasters.pop(key, None)
    if broadcaster:
        await broadcaster.stop()
    conn = _connections.pop(key, None)
    if conn:
        await conn.close_control()
        await conn.disconnect()


def connection_status(host: str, port: int) -> dict:
    conn = get_connection(host, port)
    if conn is None or not conn.connected:
        return {"connected": False}
    return {
        "connected": True,
        "center_hz": conn.center_hz,
        "sample_rate": conn.sample_rate,
        "gain_db": conn.gain_db,
        "gain_auto": conn.gain_auto,
        "mode": conn.mode,
        "offset_hz": conn.demod_offset_hz,
        "bw_hz": conn.bw_hz,
        "is_owner": conn.is_owner,
        "control_available": conn.control_available,
        "locked": conn.tuner_locked,
    }


# rtl_tcp announces itself on connect with a 12-byte dongle-info block whose
# first 4 bytes are the ASCII magic "RTL0" (followed by tuner type + gain count).
# We validate this so reachability means "a live rtl_tcp dongle answered", not
# merely "some TCP port is open" — an unplugged dongle or an unrelated listener
# would otherwise read as online.
_RTL_TCP_MAGIC = b"RTL0"
_RTL_TCP_HEADER_LEN = 12

# Reachability probe cache. The Settings device list polls reachability every few
# seconds per radio; each miss opens a real rtl_tcp client connection, and rtl_tcp
# serves only ONE client — so an over-eager probe steals an active stream (its own
# broadcaster's or a second instance's). Caching a *successful* probe for a few
# seconds collapses the poll storm into the occasional real probe. Keyed by
# "host:port"; value is (monotonic timestamp, result dict).
_reachability_cache: dict[str, tuple[float, dict]] = {}
REACHABILITY_CACHE_TTL_S = 8.0
# Brief pause before re-probing a failed radio (see reachability_status).
REACHABILITY_RETRY_DELAY_S = 0.25


async def _probe_rtl_tcp(host: str, port: int, timeout: float) -> dict:
    """Open a one-shot rtl_tcp connection and validate the ``RTL0`` magic header.

    Connects, reads the 12-byte dongle-info header, then immediately closes — it
    never leaves a persistent connection behind (that would race the broadcaster's
    exclusive rtl_tcp session). Returns ``{"connected": True, "reachable": True}``
    when a real dongle answers, else ``{"connected": False}``.
    """
    try:
        fut = asyncio.open_connection(host, port)
        reader, writer = await asyncio.wait_for(fut, timeout=timeout)
        try:
            header = await asyncio.wait_for(reader.readexactly(_RTL_TCP_HEADER_LEN), timeout=timeout)
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass
        if header[:4] != _RTL_TCP_MAGIC:
            return {"connected": False}
        return {"connected": True, "reachable": True}
    except Exception:
        return {"connected": False}


async def reachability_status(host: str, port: int, timeout: float = 1.5) -> dict:
    """Status for the Settings device list.

    If a live stream is already running for this radio, report its rich state
    (same as connection_status). Otherwise do a lightweight TCP probe so the
    Settings dot reflects *reachability* of the rtl_tcp host:port rather than
    "is the panel currently streaming this radio".

    The probe is a direct TCP connection to the configured host:port, so it works
    for LAN/localhost radios regardless of internet connectivity — that is the
    "ping the local IP" behaviour the SDR section relies on in offgrid mode. It
    validates the rtl_tcp ``RTL0`` magic header and closes immediately.

    Because that probe is itself a single-client rtl_tcp connection, two guards
    keep it from stealing the dongle or flapping the dot when two instances share
    one Pi: a successful result is cached for ``REACHABILITY_CACHE_TTL_S`` (so the
    fast poll does not re-probe a known-good radio), and a single failure is
    retried once before the radio is declared offline (masking a transient
    collision where another client briefly held the dongle).
    """
    live = connection_status(host, port)
    if live.get("connected"):
        return live
    key = f"{host}:{port}"
    now = time.monotonic()
    cached = _reachability_cache.get(key)
    if cached is not None and now - cached[0] < REACHABILITY_CACHE_TTL_S:
        return cached[1]
    result = await _probe_rtl_tcp(host, port, timeout)
    if not result.get("connected"):
        await asyncio.sleep(REACHABILITY_RETRY_DELAY_S)
        result = await _probe_rtl_tcp(host, port, timeout)
    if result.get("connected"):
        _reachability_cache[key] = (now, result)
    return result


def get_broadcaster(host: str, port: int) -> RadioBroadcaster | None:
    """Return the existing broadcaster for this radio, or None if not running."""
    return _broadcasters.get(f"{host}:{port}")


async def get_or_create_broadcaster(host: str, port: int) -> RadioBroadcaster:
    """Return the running broadcaster for this radio, starting it if needed."""
    key = f"{host}:{port}"
    conn = await get_or_create_connection(host, port)
    broadcaster = _broadcasters.get(key)
    if broadcaster is None:
        broadcaster = RadioBroadcaster(conn)
        _broadcasters[key] = broadcaster
    await broadcaster.start()
    return broadcaster


def wake_all_subscribers() -> None:
    """Synchronously push the None sentinel to every subscriber queue.

    Safe to call from an asyncio signal handler (no awaiting). This unblocks
    WS stream loops / IQ drains parked on `await queue.get()` the instant the
    shutdown signal arrives — before uvicorn starts waiting for in-flight
    tasks to drain. Without this, those handlers never return and uvicorn's
    graceful shutdown hangs at "Waiting for background tasks to complete",
    so the lifespan shutdown (which would call shutdown_all) never even runs.
    """
    for b in list(_broadcasters.values()):
        for q in [*b._subscribers, *b._iq_subscribers]:
            try:
                q.put_nowait(None)
            except asyncio.QueueFull:
                pass


async def shutdown_all() -> None:
    """Stop every broadcaster and close every connection.

    Called from the app lifespan on shutdown so the long-lived broadcaster
    tasks are cancelled and awaited; otherwise uvicorn's graceful shutdown
    hangs waiting on them ("Waiting for background tasks to complete").
    Resilient per radio so one failure doesn't strand the rest.
    """
    for key in list({*_broadcasters, *_connections}):
        host, _, port = key.rpartition(":")
        try:
            await close_connection(host, int(port))
        except Exception:
            logger.exception("Error shutting down SDR %s", key)
