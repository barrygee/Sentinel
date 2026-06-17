"""SDR digital-decode service — server-side FM demodulation + decoder bridge.

Digital voice/trunked protocols (P25, DMR, NXDN, D-STAR, YSF, …) are decoded by
an external ``dsd-fme`` sidecar container, NOT in the browser.  ``dsd-fme``'s
clean input is **FM-demodulated 48 kHz mono s16 PCM over TCP** (the SDR++
"TCP audio sink" convention) — not raw IQ.  So this module reproduces, on the
server, the exact demodulation chain the browser AudioWorklet runs in
``frontend/vue/src/composables/useSdrAudio.ts`` (``PROCESSOR_SRC``):

    IQ decimate → NCO mix → channel LPF → FM discriminator → resample to 48 kHz

The physical RTL-SDR is reached over a single-client ``rtl_tcp`` connection, so
the decoder cannot open its own connection.  Instead the bridge subscribes to
the existing :class:`~backend.services.sdr.RadioBroadcaster` IQ fan-out (exactly
like IQ recording does) and never touches ``rtl_tcp`` directly.

This file holds the pure DSP core (:class:`DemodState`, :func:`demod_chunk`).
The networking bridge that serves the PCM to the decoder container is added on
top of these primitives.

Differences from the browser worklet, on purpose:
  * No de-emphasis and no squelch gate — ``dsd-fme`` wants the raw discriminator
    output, continuously, so it can find sync and decode control data.
  * Output is int16 LE bytes (s16) rather than Float32 audio.
"""

from __future__ import annotations

import asyncio
import logging
import math
import struct
from dataclasses import dataclass, field

import numpy as np
from backend.config import settings
from backend.services.sdr import RadioBroadcaster, _iq_bytes_to_complex

logger = logging.getLogger(__name__)

# Output audio rate fed to dsd-fme — the SDR++ TCP-audio-sink convention is
# 48 kHz mono s16, which dsd-fme's `-i tcp` input expects by default.
OUTPUT_RATE = 48000

# Default channel bandwidth for digital modes (Hz). DMR/P25/NXDN are all
# ~12.5 kHz channels, so a 12.5 kHz LPF isolates one channel from the span.
DEFAULT_DECODE_BW_HZ = 12_500

# Pre-LPF integer IQ decimation ceiling (mirrors the browser worklet). The FIR
# is O(taps·N); decimating IQ down to ≤ ~1.024 Msps first keeps server CPU sane
# at 2.048 Msps without losing a 12.5 kHz channel.
_IQ_DECIM_FLOOR_SR = 1_024_000
_IQ_DECIM_MAX = 8

# FIR length used for the channel low-pass filter (number of taps = _FIR_M + 1),
# matching the worklet's 64-order / 65-tap Hamming-windowed sinc.
_FIR_M = 64


def _compute_iq_decim(sample_rate: int, bw_hz: int) -> int:
    """Pick the integer IQ-decimation factor (power of two, ≤ _IQ_DECIM_MAX).

    Ported from the worklet: keep the post-decimation rate at or above both the
    channel's Nyquist-plus-margin (``bw_hz * 2.2``) and a 1.024 Msps floor so
    narrowband channels stay sharp, while halving the FIR's input rate as far as
    the ceiling allows.
    """
    target_max_sr = max(bw_hz * 2.2, _IQ_DECIM_FLOOR_SR)
    decim = 1
    while decim < _IQ_DECIM_MAX and sample_rate / (decim * 2) >= target_max_sr:
        decim *= 2
    return decim


def _build_lpf_taps(cut_hz: float, sample_rate: float) -> np.ndarray:
    """Hamming-windowed sinc low-pass FIR, normalised to unity DC gain.

    Direct numpy port of the worklet's ``_buildLpf`` so the server and browser
    channel filters are identical.
    """
    fc = cut_hz / sample_rate
    indices = np.arange(_FIR_M + 1, dtype=np.float64)
    centre = _FIR_M / 2.0
    delta = indices - centre
    # sinc with the n == M/2 singularity replaced by its limit (2·π·fc).
    with np.errstate(divide="ignore", invalid="ignore"):
        sinc = np.where(delta == 0.0, 2 * math.pi * fc, np.sin(2 * math.pi * fc * delta) / delta)
    window = 0.54 - 0.46 * np.cos(2 * math.pi * indices / _FIR_M)
    taps = sinc * window
    taps /= taps.sum()
    return taps.astype(np.float64)


@dataclass
class DemodState:
    """Carried DSP state for one decode session, mutated across chunks.

    A single consumer (the bridge's demod loop) owns one instance, so no locking
    is needed.  ``offset_hz``/``bw_hz`` are set by the caller (and updated live
    on retune); the remaining fields are internal filter memory that must persist
    between chunks to avoid discontinuities at block boundaries.
    """

    # Caller-controlled channel selection.
    offset_hz: int = 0
    bw_hz: int = DEFAULT_DECODE_BW_HZ

    # NCO (frequency-shift) phase accumulator, radians.
    nco_phase: float = 0.0

    # Integer IQ decimator: current factor + raw leftover samples (< factor) that
    # didn't complete a group at the end of the previous chunk.
    iq_decim: int = 1
    iq_leftover: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.complex128))

    # Channel FIR low-pass: cached taps (rebuilt on bw/sr change) + the tail of
    # the previous block's input (filter delay line).
    lpf_taps: np.ndarray | None = None
    lpf_bw: int = 0
    lpf_sr: float = 0.0
    lpf_tail: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.complex128))

    # FM discriminator: previous complex sample for the cross-block phase diff.
    fm_prev: complex = 1 + 0j

    # Fractional resampler to OUTPUT_RATE: phase accumulator + previous input
    # sample for the interpolation that straddles block boundaries.
    res_phase: float = 0.0
    res_prev: float = 0.0

    def reset_filters(self) -> None:
        """Drop all carried filter memory (used when the decimation factor flips)."""
        self.iq_leftover = np.zeros(0, dtype=np.complex128)
        self.lpf_taps = None
        self.lpf_tail = np.zeros(0, dtype=np.complex128)
        self.res_phase = 0.0
        self.res_prev = 0.0
        self.fm_prev = 1 + 0j
        self.nco_phase = 0.0


def _decimate_iq(samples: np.ndarray, factor: int, state: DemodState) -> np.ndarray:
    """Boxcar-decimate complex IQ by an integer factor, carrying a partial group.

    Equivalent to the worklet's ``_decIq`` (a running sum of ``factor`` samples)
    but carries the raw leftover samples instead of an accumulator — simpler to
    vectorise and numerically identical (boxcar = mean of ``factor`` samples).
    """
    if factor <= 1:
        return samples
    buffer = np.concatenate((state.iq_leftover, samples))
    group_count = buffer.size // factor
    used = group_count * factor
    state.iq_leftover = buffer[used:]
    if group_count == 0:
        return np.zeros(0, dtype=np.complex128)
    return buffer[:used].reshape(group_count, factor).mean(axis=1)


def _mix_nco(samples: np.ndarray, offset_hz: int, effective_sr: float, state: DemodState) -> np.ndarray:
    """Shift ``offset_hz`` down to baseband via a continuous-phase NCO.

    Mirrors the worklet's ``_mix``: sample ``k`` is multiplied by
    ``exp(j·(phase + k·dPhase))`` with ``dPhase = -2π·offset/sr`` (a downmix),
    and the phase accumulator is carried (wrapped to ±π) across chunks.
    """
    count = samples.size
    if count == 0:
        return samples
    d_phase = -2 * math.pi * offset_hz / effective_sr
    phases = state.nco_phase + d_phase * np.arange(count)
    mixed = samples * np.exp(1j * phases)
    end_phase = state.nco_phase + d_phase * count
    state.nco_phase = (end_phase + math.pi) % (2 * math.pi) - math.pi
    return mixed


def _lpf_channel(samples: np.ndarray, effective_sr: float, state: DemodState) -> np.ndarray:
    """Apply the channel FIR low-pass with carried filter state.

    Prepends the previous block's tail (the FIR delay line) so the per-sample
    output equals ``Σ taps[j]·x[k-j]`` continuously across chunks — the
    vectorised equivalent of the worklet's circular-buffer ``_lpf``.
    """
    bw = state.bw_hz
    if state.lpf_taps is None or state.lpf_bw != bw or state.lpf_sr != effective_sr:
        state.lpf_taps = _build_lpf_taps(bw / 2.0, effective_sr)
        state.lpf_bw = bw
        state.lpf_sr = effective_sr
        state.lpf_tail = np.zeros(state.lpf_taps.size - 1, dtype=np.complex128)
    taps = state.lpf_taps
    history = taps.size - 1
    if state.lpf_tail.size != history:
        # Tail size only changes when taps change, which also clears it above;
        # this guards a resumed session whose tail predates a taps rebuild.
        state.lpf_tail = np.zeros(history, dtype=np.complex128)
    buffer = np.concatenate((state.lpf_tail, samples))
    if samples.size == 0:
        return np.zeros(0, dtype=np.complex128)
    filtered = np.convolve(buffer, taps, mode="valid")
    state.lpf_tail = buffer[-history:] if history > 0 else state.lpf_tail
    return filtered


def _fm_discriminate(samples: np.ndarray, state: DemodState) -> np.ndarray:
    """FM discriminator: instantaneous frequency as the inter-sample phase diff.

    ``d[k] = angle(x[k] · conj(x[k-1]))`` — the vectorised form of the worklet's
    ``_fm`` loop, with the previous complex sample carried across chunks. No
    de-emphasis (dsd-fme wants the raw discriminator).
    """
    if samples.size == 0:
        return np.zeros(0, dtype=np.float64)
    extended = np.concatenate(([state.fm_prev], samples))
    discriminated = np.angle(extended[1:] * np.conj(extended[:-1]))
    state.fm_prev = samples[-1]
    return discriminated


def _resample_to_output(samples: np.ndarray, input_rate: float, state: DemodState) -> np.ndarray:
    """Linearly resample a real signal to OUTPUT_RATE, carrying phase + prev sample.

    Port of the worklet's ``_decimate``: walks an input-sample phase accumulator
    in steps of ``input_rate / OUTPUT_RATE`` and linearly interpolates, using the
    previous chunk's last sample for the interpolation at phase < 1.
    """
    step = input_rate / OUTPUT_RATE
    if step <= 1 or samples.size == 0:
        return samples
    count = samples.size
    phase = state.res_phase
    prev = state.res_prev
    output: list[float] = []
    while phase < count:
        index = int(math.floor(phase))
        frac = phase - index
        earlier = prev if index == 0 else samples[index - 1]
        output.append(float(earlier + (samples[index] - earlier) * frac))
        phase += step
    state.res_phase = phase - count
    state.res_prev = float(samples[-1])
    return np.asarray(output, dtype=np.float64)


def demod_chunk(raw_iq: bytes, sample_rate: int, state: DemodState) -> bytes:
    """FM-demodulate one raw IQ chunk to 48 kHz mono s16 LE PCM bytes.

    Reproduces the browser worklet's chain — IQ decimate, NCO mix, channel LPF,
    FM discriminator, fractional resample — without de-emphasis or squelch, then
    scales the discriminator output (range ±π) to full-scale int16. Returns the
    PCM bytes to write to the decoder's TCP audio feed; ``state`` is mutated to
    carry filter memory to the next chunk.
    """
    samples = _iq_bytes_to_complex(raw_iq).astype(np.complex128)
    if samples.size == 0:
        return b""

    decim = _compute_iq_decim(sample_rate, state.bw_hz)
    if decim != state.iq_decim:
        state.iq_decim = decim
        state.reset_filters()
    effective_sr = sample_rate / decim

    samples = _decimate_iq(samples, decim, state)
    if samples.size == 0:
        return b""

    if state.offset_hz != 0:
        samples = _mix_nco(samples, state.offset_hz, effective_sr, state)

    # The channel is always far narrower than the (decimated) span for digital
    # modes, so the LPF always runs; the >= 0.95 ratio guard mirrors the worklet
    # for the degenerate case where the bandwidth covers the whole stream.
    bw_ratio = state.bw_hz / effective_sr if state.bw_hz > 0 else 1.0
    if 0 < bw_ratio < 0.95:
        samples = _lpf_channel(samples, effective_sr, state)

    discriminated = _fm_discriminate(samples, state)
    audio = _resample_to_output(discriminated, effective_sr, state)
    if audio.size == 0:
        return b""

    # Discriminator output is in radians (±π); normalise to ±1 then scale to s16.
    scaled = np.clip(audio / math.pi * 32767.0, -32768, 32767).astype("<i2")
    return scaled.tobytes()


# ── Decoder bridge ─────────────────────────────────────────────────────────────


class _DecodedAudioProtocol(asyncio.DatagramProtocol):
    """UDP receiver for decoded voice PCM sent back by dsd-fme (`-o udp:...`)."""

    def __init__(self, on_audio) -> None:
        self._on_audio = on_audio

    def datagram_received(self, data: bytes, addr) -> None:  # noqa: ARG002 - addr unused
        self._on_audio(data)


class DigitalDecodeBridge:
    """Per-radio bridge between the IQ fan-out and the dsd-fme sidecar.

    Subscribes to the radio's :class:`RadioBroadcaster` IQ stream, FM-demodulates
    each chunk in a worker thread, and serves the resulting 48 kHz s16 PCM over a
    TCP socket the decoder container connects to.  Decoded voice (UDP from
    dsd-fme) and decoded events (HTTP-ingested from the sidecar log parser) are
    fanned out to WebSocket subscriber queues for the browser.

    Only one decoder container exists, so a single bridge is active at a time;
    its PCM/audio ports are fixed (see :class:`~backend.config.Settings`).
    """

    def __init__(
        self,
        broadcaster: RadioBroadcaster,
        *,
        pcm_port: int | None = None,
        audio_udp_port: int | None = None,
        default_bw_hz: int | None = None,
    ) -> None:
        self._broadcaster = broadcaster
        self._pcm_port = settings.decoder_pcm_port if pcm_port is None else pcm_port
        self._audio_udp_port = settings.decoder_audio_udp_port if audio_udp_port is None else audio_udp_port
        self._state = DemodState(bw_hz=default_bw_hz or settings.decoder_default_bw_hz)

        self._iq_queue: asyncio.Queue | None = None
        self._demod_task: asyncio.Task | None = None
        self._server: asyncio.base_events.Server | None = None
        self._udp_transport: asyncio.BaseTransport | None = None
        self._pcm_writer: asyncio.StreamWriter | None = None
        self._decoder_connected = False
        self._running = False

        self._event_subs: list[asyncio.Queue] = []
        self._audio_subs: list[asyncio.Queue] = []

    # ── lifecycle ──────────────────────────────────────────────────────────
    async def start(self, *, offset_hz: int = 0, bw_hz: int | None = None) -> None:
        """Begin demodulating and serving PCM. Idempotent while running."""
        if self._running:
            self.set_channel(offset_hz=offset_hz, bw_hz=bw_hz)
            return
        self._state.offset_hz = offset_hz
        if bw_hz:
            self._state.bw_hz = bw_hz

        self._iq_queue = self._broadcaster.subscribe_iq()
        self._server = await asyncio.start_server(self._on_decoder_connection, host="0.0.0.0", port=self._pcm_port)
        # Resolve the actually-bound port (supports port 0 in tests).
        self._pcm_port = self._server.sockets[0].getsockname()[1]

        loop = asyncio.get_running_loop()
        self._udp_transport, _ = await loop.create_datagram_endpoint(
            lambda: _DecodedAudioProtocol(self._on_decoded_audio),
            local_addr=("0.0.0.0", self._audio_udp_port),
        )
        self._audio_udp_port = self._udp_transport.get_extra_info("sockname")[1]

        self._running = True
        self._demod_task = asyncio.create_task(self._run(), name="sdr-decode-demod")
        logger.info(
            "Digital decode bridge started (pcm tcp :%d, audio udp :%d)",
            self._pcm_port,
            self._audio_udp_port,
        )

    async def stop(self) -> None:
        """Stop demodulating, close sockets, and unblock subscriber drains."""
        self._running = False
        if self._iq_queue is not None:
            self._broadcaster.unsubscribe_iq(self._iq_queue)
            self._iq_queue = None
        if self._demod_task is not None:
            self._demod_task.cancel()
            try:
                await self._demod_task
            except asyncio.CancelledError:
                pass
            self._demod_task = None
        if self._pcm_writer is not None:
            try:
                self._pcm_writer.close()
            except Exception:
                pass
            self._pcm_writer = None
        if self._server is not None:
            self._server.close()
            try:
                # wait_closed() can block on a still-open decoder connection
                # (Python 3.12 waits for active handlers); cap it so shutdown
                # never hangs — the socket is already closed for new accepts.
                await asyncio.wait_for(self._server.wait_closed(), timeout=2.0)
            except Exception:
                pass
            self._server = None
        if self._udp_transport is not None:
            self._udp_transport.close()
            self._udp_transport = None
        self._decoder_connected = False
        self._drain_subscribers()
        logger.info("Digital decode bridge stopped")

    def _drain_subscribers(self) -> None:
        """Push a None sentinel to every subscriber so WS drains exit promptly."""
        for queue in [*self._event_subs, *self._audio_subs]:
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                pass
        self._event_subs.clear()
        self._audio_subs.clear()

    # ── channel control ────────────────────────────────────────────────────
    def set_channel(self, *, offset_hz: int = 0, bw_hz: int | None = None) -> None:
        """Update the demod offset/bandwidth live (e.g. when the user retunes)."""
        self._state.offset_hz = offset_hz
        if bw_hz:
            self._state.bw_hz = bw_hz

    @property
    def decoder_reachable(self) -> bool:
        return self._decoder_connected

    @property
    def pcm_port(self) -> int:
        """TCP port the decoder connects to for PCM (resolved after start())."""
        return self._pcm_port

    @property
    def audio_udp_port(self) -> int:
        """UDP port the backend listens on for decoded voice (resolved after start())."""
        return self._audio_udp_port

    # ── decoder TCP (PCM out) ──────────────────────────────────────────────
    async def _on_decoder_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        """Accept the dsd-fme PCM client. Only the latest connection is served."""
        peer = writer.get_extra_info("peername")
        logger.info("Decoder connected from %s", peer)
        if self._pcm_writer is not None:
            try:
                self._pcm_writer.close()
            except Exception:
                pass
        self._pcm_writer = writer
        self._decoder_connected = True
        self._publish_status()
        # The decoder only consumes PCM; we read to detect EOF/disconnect.
        try:
            while await reader.read(4096):
                pass
        except Exception:
            pass
        finally:
            if self._pcm_writer is writer:
                self._pcm_writer = None
                self._decoder_connected = False
                self._publish_status()
            logger.info("Decoder disconnected from %s", peer)

    async def _run(self) -> None:
        """Demod loop: IQ chunk → PCM → decoder TCP. Skips work with no client."""
        assert self._iq_queue is not None
        try:
            while True:
                payload = await self._iq_queue.get()
                if payload is None:  # broadcaster shutdown
                    break
                # Skip the (CPU-heavy) demod entirely when no decoder is attached.
                if self._pcm_writer is None or len(payload) < 8:
                    continue
                sample_rate = struct.unpack("<I", payload[:4])[0]
                raw_iq = payload[8:]
                pcm = await asyncio.to_thread(demod_chunk, raw_iq, sample_rate, self._state)
                if not pcm:
                    continue
                writer = self._pcm_writer
                if writer is None:
                    continue
                try:
                    writer.write(pcm)
                    await writer.drain()
                except (ConnectionResetError, BrokenPipeError, OSError):
                    # Decoder went away mid-stream — drop it and notify the UI.
                    if self._pcm_writer is writer:
                        self._pcm_writer = None
                        self._decoder_connected = False
                        self._publish_status()
        except asyncio.CancelledError:
            pass

    # ── decoded audio (UDP in) ─────────────────────────────────────────────
    def _on_decoded_audio(self, data: bytes) -> None:
        for queue in list(self._audio_subs):
            RadioBroadcaster._put_dropping(queue, data)

    # ── event / audio subscriptions for the browser WS ─────────────────────
    def subscribe_events(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._event_subs.append(queue)
        # Seed the new subscriber with current reachability so the UI is correct
        # the instant it connects, without waiting for the next event.
        RadioBroadcaster._put_dropping(queue, self._status_frame())
        return queue

    def unsubscribe_events(self, queue: asyncio.Queue) -> None:
        try:
            self._event_subs.remove(queue)
        except ValueError:
            pass

    def subscribe_audio(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=8)
        self._audio_subs.append(queue)
        return queue

    def unsubscribe_audio(self, queue: asyncio.Queue) -> None:
        try:
            self._audio_subs.remove(queue)
        except ValueError:
            pass

    def publish_event(self, event: dict) -> None:
        """Fan a decoded event (from the sidecar log parser) to WS subscribers."""
        for queue in list(self._event_subs):
            RadioBroadcaster._put_dropping(queue, event)

    def _status_frame(self) -> dict:
        return {"type": "decode_status", "decoder_reachable": self._decoder_connected}

    def _publish_status(self) -> None:
        self.publish_event(self._status_frame())

    def wake(self) -> None:
        """Synchronously sentinel subscriber queues (safe from a signal handler)."""
        for queue in [*self._event_subs, *self._audio_subs]:
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                pass


# ── Bridge cache helpers ────────────────────────────────────────────────────────

# Key = "host:port"; a single bridge is active at a time (one decoder container).
_bridges: dict[str, DigitalDecodeBridge] = {}


def get_bridge(host: str, port: int) -> DigitalDecodeBridge | None:
    """Return the running bridge for this radio, or None."""
    return _bridges.get(f"{host}:{port}")


async def get_or_create_bridge(host: str, port: int, broadcaster: RadioBroadcaster) -> DigitalDecodeBridge:
    """Return the bridge for this radio, creating it (and stopping any other) first.

    Only one decoder container exists, so a bridge for a *different* radio is
    stopped before a new one starts — this also frees the fixed PCM/UDP ports.
    """
    key = f"{host}:{port}"
    for other_key in list(_bridges):
        if other_key != key:
            await stop_bridge(*other_key.rsplit(":", 1))  # type: ignore[misc]
    bridge = _bridges.get(key)
    if bridge is None:
        bridge = DigitalDecodeBridge(broadcaster)
        _bridges[key] = bridge
    return bridge


async def stop_bridge(host: str, port: int | str) -> None:
    """Stop and remove the bridge for this radio, if any."""
    key = f"{host}:{int(port)}"
    bridge = _bridges.pop(key, None)
    if bridge is not None:
        await bridge.stop()


def wake_all_decoders() -> None:
    """Synchronously sentinel every bridge's subscriber queues (signal-safe)."""
    for bridge in list(_bridges.values()):
        bridge.wake()


async def shutdown_all_decoders() -> None:
    """Stop every bridge — called from the app lifespan on shutdown."""
    for key in list(_bridges):
        host, _, port = key.rpartition(":")
        try:
            await stop_bridge(host, int(port))
        except Exception:
            logger.exception("Error shutting down decode bridge %s", key)
