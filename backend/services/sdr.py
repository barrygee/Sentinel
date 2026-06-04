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
import logging
import time
from dataclasses import dataclass, field

import numpy as np

logger = logging.getLogger(__name__)

# Default FFT parameters
DEFAULT_FFT_SIZE    = 1024   # bins used for spectrum display
MIN_FFT_SIZE        = 1024   # client-requested floor (one bin / ~1 device px on small displays)
MAX_FFT_SIZE        = 32768  # ceiling: CPU cost grows with FFT size. 32k keeps
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
READ_CHUNK_MIN_SAMPLES = 4096       # floor: must stay ≥ fft_size and efficient
READ_CHUNK_MAX_SAMPLES = 131072     # ceiling: bound latency / memory

# Connection cache: key = "host:port"
_connections: dict[str, RtlTcpConnection] = {}
# Broadcaster cache: key = "host:port"
_broadcasters: dict[str, RadioBroadcaster] = {}


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
    fft_size: int = DEFAULT_FFT_SIZE
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)

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
                logger.info("Connected to rtl_tcp at %s:%d", self.host, self.port)
                # rtl_tcp sends a 12-byte magic header on connect — discard it
                await asyncio.wait_for(self.reader.read(12), timeout=3.0)
                # ALWAYS configure the device immediately. rtl_tcp otherwise
                # streams at its own default rate (which this Pi can't sustain
                # over USB/network → ~3 fps, jumpy) until the client happens to
                # send a sample_rate command. Pushing our defaults here makes
                # every connect path produce a healthy stream from the start.
                # (_send_command needs connected+writer, both set above; we're
                # inside _lock but _send_command doesn't take it — safe.)
                await self._send_command(0x02, self.sample_rate)   # set sample rate
                await self._send_command(0x01, self.center_hz)     # set frequency
            except Exception as exc:
                self.connected = False
                raise ConnectionError(f"Cannot connect to rtl_tcp at {self.host}:{self.port}: {exc}") from exc

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

    async def _send_command(self, cmd: int, value: int) -> None:
        if not self.connected or not self.writer:
            raise ConnectionError("Not connected")
        data = bytes([cmd]) + value.to_bytes(4, "big")
        self.writer.write(data)
        await self.writer.drain()

    async def set_frequency(self, freq_hz: int) -> None:
        await self._send_command(0x01, freq_hz)
        self.center_hz = freq_hz

    async def set_sample_rate(self, rate_hz: int) -> None:
        await self._send_command(0x02, rate_hz)
        self.sample_rate = rate_hz

    async def set_gain_auto(self) -> None:
        await self._send_command(0x03, 0)  # gain mode = auto
        await self._send_command(0x08, 1)  # AGC on
        self.gain_auto = True

    async def set_gain_manual(self, gain_db: float) -> None:
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
        self._subscribers:    list[asyncio.Queue] = []   # FFT JSON frames
        self._iq_subscribers: list[asyncio.Queue] = []   # raw IQ bytes
        self._task: asyncio.Task | None = None
        self._lock = asyncio.Lock()

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
                    if payload is None:      # sentinel → recording stopped
                        break
                    await f.write(payload[8:])   # skip 8-byte header, write raw IQ
        except Exception as exc:
            logger.warning("IQ file write error (%s): %s", file_path, exc)

    def stop_iq_recording(self, q: asyncio.Queue) -> None:
        """Unsubscribe the recording queue and signal the drain task to finish."""
        self.unsubscribe_iq(q)
        try:
            q.put_nowait(None)   # sentinel to unblock the drain coroutine
        except asyncio.QueueFull:
            pass

    async def start(self) -> None:
        async with self._lock:
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

    async def _run(self) -> None:
        conn = self._conn
        logger.info("Broadcaster started for %s:%d", conn.host, conn.port)
        try:
            while True:
                # Yield to the event loop every iteration. rtl_tcp streams
                # continuously and TCP backlog can make read_iq_chunk return
                # with no real suspension, letting this loop monopolise the
                # loop and starve HTTP/WS handlers (even /health). sleep(0)
                # guarantees other tasks get scheduled each pass.
                await asyncio.sleep(0)
                try:
                    raw_iq = await conn.read_iq_chunk()
                except asyncio.IncompleteReadError:
                    # Dongle briefly stops sending during retune — skip this chunk
                    logger.debug("rtl_tcp incomplete read during retune, skipping")
                    continue
                except (ConnectionError, Exception) as exc:
                    logger.warning("rtl_tcp read error (%s:%d): %s", conn.host, conn.port, exc)
                    conn.connected = False
                    err_frame = {"type": "error", "code": "READ_ERROR", "message": str(exc)}
                    self._broadcast(err_frame)
                    break

                # FFT uses only the first fft_size samples from the chunk.
                # compute_fft_frame is CPU-bound NumPy + a per-bin Python loop;
                # run it in a worker thread so it never blocks the event loop
                # (a blocked loop stalls all HTTP/WS handling).
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
        seg = iq_all[k * n_fft:(k + 1) * n_fft] * window
        spectrum = np.fft.fftshift(np.fft.fft(seg, n=n_fft))
        power_sum += np.abs(spectrum) ** 2
    power_avg = power_sum / n_avg
    # Convert to dBFS: 0 dB = full-scale sine wave. With IQ normalised to ±1.0
    # and a Hann window (coherent gain 0.5), a full-scale tone produces a bin
    # magnitude of N/4, i.e. power N²/16. Subtract that to anchor 0 dBFS at
    # the ADC ceiling, matching SDR#/SDR++/GQRX conventions.
    fs_power_db = 10.0 * np.log10((n_fft ** 2) / 16.0)
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
    }


async def reachability_status(host: str, port: int, timeout: float = 1.5) -> dict:
    """Status for the Settings device list.

    If a live stream is already running for this radio, report its rich state
    (same as connection_status). Otherwise do a lightweight TCP probe so the
    Settings dot reflects *reachability* of the rtl_tcp host:port rather than
    "is the panel currently streaming this radio". The probe opens and
    immediately closes a socket — it never leaves a persistent connection
    behind (that would race the broadcaster's exclusive rtl_tcp session).
    """
    live = connection_status(host, port)
    if live.get("connected"):
        return live
    try:
        fut = asyncio.open_connection(host, port)
        reader, writer = await asyncio.wait_for(fut, timeout=timeout)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return {"connected": True, "reachable": True}
    except Exception:
        return {"connected": False}


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
