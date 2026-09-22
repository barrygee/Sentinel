"""SDR digital-decode service — server-side FM demodulation + decoder bridge.

Digital voice protocols (P25, DMR, NXDN, D-STAR, YSF, …) are decoded by
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

The same FM-discriminator PCM feed also drives **APRS** packet decode: Direwolf
(the ``aprs-decoder`` sidecar) reads the identical 48 kHz s16 stream and emits
AX.25/APRS packets. So the PCM-serving spine is shared by a small base class
(:class:`PcmDecodeBridge`); the voice bridge (:class:`DigitalDecodeBridge`) adds a
decoded-voice UDP path, while the APRS bridge
(:class:`AprsDecodeBridge`) adds nothing (packets arrive purely as ingested
events). One sidecar container exists per kind, so at most one voice bridge and
one APRS bridge are ever active — but they may run **concurrently** on two
different radios/dongles.

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
import secrets
import struct
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from backend.config import settings
from backend.services.sdr import RadioBroadcaster, _iq_bytes_to_complex

logger = logging.getLogger(__name__)

# Cached resolved ingest secret (see resolve_ingest_secret).
_ingest_secret: str | None = None


def resolve_ingest_secret() -> str:
    """Return the shared secret authenticating decoder → backend ingest POSTs.

    Precedence: an explicit ``decoder_ingest_secret`` setting wins (useful for
    tests / pinning). Otherwise the secret is read from ``decoder_secret_file``;
    if that file does not exist yet, a random one is generated and written there
    (the decoder container mounts the same file via a shared volume). If the
    path cannot be written (e.g. a non-container dev run with no volume), an
    in-memory secret is used so the backend still functions. Cached after first
    resolution so the value is stable for the process.
    """
    global _ingest_secret
    if settings.decoder_ingest_secret:
        return settings.decoder_ingest_secret
    if _ingest_secret is not None:
        return _ingest_secret
    path = Path(settings.decoder_secret_file)
    try:
        if path.exists():
            _ingest_secret = path.read_text().strip()
        else:
            generated = secrets.token_urlsafe(32)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(generated)
            # World-readable on purpose: the decoder container runs as a
            # different uid and mounts this shared volume to read the secret.
            # The secret guards the network ingest path, not local file access
            # within the trusted compose stack.
            path.chmod(0o644)
            _ingest_secret = generated
    except OSError:
        # No writable shared volume (e.g. local dev without the decoder) — fall
        # back to an ephemeral secret so the backend still runs.
        _ingest_secret = secrets.token_urlsafe(32)
    return _ingest_secret


# Output audio rate fed to dsd-fme — the SDR++ TCP-audio-sink convention is
# 48 kHz mono s16, which dsd-fme's `-i tcp` input expects by default.
OUTPUT_RATE = 48000

# Audio rate calculation configuration
_AUDIO_RATE_MEASURE_SECONDS = 1.5
_AUDIO_BYTES_PER_SAMPLE = 2

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

# Shared empty result for the demod path, so the no-samples case allocates nothing.
_EMPTY_AUDIO = np.zeros(0, dtype=np.float64)


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


def demodulate_to_audio(raw_iq: bytes, sample_rate: int, state: DemodState) -> np.ndarray:
    """FM-demodulate one raw IQ chunk to 48 kHz real audio (discriminator radians).

    Reproduces the browser worklet's chain — IQ decimate, NCO mix, channel LPF,
    FM discriminator, fractional resample — without de-emphasis or squelch.
    ``state`` is mutated to carry filter memory to the next chunk. Returns the
    float audio (range ±π); callers scale it to PCM with :func:`audio_to_pcm_bytes`.

    Split out from :func:`demod_chunk` so a bridge can demodulate the SAME IQ
    chunk twice, at two different offsets, and interleave the results into
    stereo PCM (see :func:`demod_chunk_stereo`).
    """
    samples = _iq_bytes_to_complex(raw_iq).astype(np.complex128)
    if samples.size == 0:
        return _EMPTY_AUDIO

    decim = _compute_iq_decim(sample_rate, state.bw_hz)
    if decim != state.iq_decim:
        state.iq_decim = decim
        state.reset_filters()
    effective_sr = sample_rate / decim

    samples = _decimate_iq(samples, decim, state)
    if samples.size == 0:
        return _EMPTY_AUDIO

    if state.offset_hz != 0:
        samples = _mix_nco(samples, state.offset_hz, effective_sr, state)

    # The channel is always far narrower than the (decimated) span for digital
    # modes, so the LPF always runs; the >= 0.95 ratio guard mirrors the worklet
    # for the degenerate case where the bandwidth covers the whole stream.
    bw_ratio = state.bw_hz / effective_sr if state.bw_hz > 0 else 1.0
    if 0 < bw_ratio < 0.95:
        samples = _lpf_channel(samples, effective_sr, state)

    discriminated = _fm_discriminate(samples, state)
    return _resample_to_output(discriminated, effective_sr, state)


def audio_to_pcm_bytes(audio: np.ndarray) -> bytes:
    """Scale discriminator audio (±π radians) to full-scale s16 LE PCM bytes."""
    if audio.size == 0:
        return b""
    scaled = np.clip(audio / math.pi * 32767.0, -32768, 32767).astype("<i2")
    return scaled.tobytes()


def demod_chunk(raw_iq: bytes, sample_rate: int, state: DemodState) -> bytes:
    """FM-demodulate one raw IQ chunk to 48 kHz MONO s16 LE PCM bytes.

    The single-channel case (voice, APRS): demodulate at ``state.offset_hz`` and
    scale to PCM for the decoder's TCP audio feed.
    """
    return audio_to_pcm_bytes(demodulate_to_audio(raw_iq, sample_rate, state))


def demod_chunk_stereo(
    raw_iq: bytes,
    sample_rate: int,
    left_state: DemodState,
    right_state: DemodState,
) -> bytes:
    """FM-demodulate one IQ chunk at two offsets into interleaved STEREO s16 PCM.

    Used by the AIS bridge: AIS alternates between two channels 50 kHz apart, so
    both are demodulated from the same IQ and handed to a two-channel Direwolf as
    one interleaved stream (left = channel A, right = channel B), which reads
    stdin as ``ACHANNELS``-wide interleaved audio.

    Both states see the same input length, bandwidth and decimation, so their
    resamplers emit the same number of samples. The lengths are still reconciled
    defensively: a mismatch would otherwise offset one channel against the other
    for the rest of the session, turning stereo into noise.
    """
    left_audio = demodulate_to_audio(raw_iq, sample_rate, left_state)
    right_audio = demodulate_to_audio(raw_iq, sample_rate, right_state)
    paired_count = min(left_audio.size, right_audio.size)
    if paired_count == 0:
        return b""
    if left_audio.size != right_audio.size:
        logger.warning(
            "AIS stereo demod length mismatch (A=%d, B=%d); truncating to %d",
            left_audio.size,
            right_audio.size,
            paired_count,
        )
    interleaved = np.empty(paired_count * 2, dtype=np.float64)
    interleaved[0::2] = left_audio[:paired_count]
    interleaved[1::2] = right_audio[:paired_count]
    return audio_to_pcm_bytes(interleaved)


# ── Decoder bridges ─────────────────────────────────────────────────────────────


class _DecodedAudioProtocol(asyncio.DatagramProtocol):
    """UDP receiver for decoded voice PCM sent back by dsd-fme (`-o udp:...`)."""

    def __init__(self, on_audio) -> None:
        self._on_audio = on_audio

    def datagram_received(self, data: bytes, addr) -> None:  # noqa: ARG002 - addr unused
        self._on_audio(data)


class PcmDecodeBridge:
    """Shared per-radio spine: IQ fan-out → FM demod → PCM over TCP → event fan-out.

    Subscribes to the radio's :class:`RadioBroadcaster` IQ stream, FM-demodulates
    each chunk in a worker thread, and serves the resulting 48 kHz s16 PCM over a
    TCP socket the decoder container connects to. Decoded events (HTTP-ingested
    from the sidecar log parser) are fanned out to WebSocket subscriber queues for
    the browser.

    Mode-specific outputs are added by subclasses via the ``_on_start`` /
    ``_on_stop`` / ``_extra_subscriber_queues`` / ``_clear_extra_subscribers``
    hooks: :class:`DigitalDecodeBridge` (voice) adds a decoded-voice UDP path,
    :class:`AprsDecodeBridge` adds nothing. Because there is one sidecar container
    per kind, a single bridge of each kind is active at a time.
    """

    #: Human/logging label for this decoder kind (overridden by subclasses).
    kind: str = "pcm"

    def __init__(
        self,
        broadcaster: RadioBroadcaster,
        *,
        pcm_port: int | None = None,
        default_bw_hz: int | None = None,
    ) -> None:
        self._broadcaster = broadcaster
        self._pcm_port = settings.decoder_pcm_port if pcm_port is None else pcm_port
        self._state = DemodState(bw_hz=default_bw_hz or settings.decoder_default_bw_hz)

        self._iq_queue: asyncio.Queue | None = None
        self._demod_task: asyncio.Task | None = None
        self._server: asyncio.base_events.Server | None = None
        self._pcm_writer: asyncio.StreamWriter | None = None
        self._decoder_connected = False
        self._running = False

        self._event_subs: list[asyncio.Queue] = []

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
        self._pcm_port = self._server.sockets[0].getsockname()[1]

        await self._on_start()

        self._running = True
        self._demod_task = asyncio.create_task(self._run(), name=f"sdr-decode-{self.kind}")
        logger.info("%s decode bridge started (pcm tcp :%d)", self.kind, self._pcm_port)

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
                await asyncio.wait_for(self._server.wait_closed(), timeout=2.0)
            except Exception:
                pass
            self._server = None
        await self._on_stop()
        self._decoder_connected = False
        self._drain_subscribers()
        logger.info("%s decode bridge stopped", self.kind)

    # ── subclass hooks ─────────────────────────────────────────────────────
    async def _on_start(self) -> None:
        """Set up mode-specific outputs after the PCM server is listening."""

    async def _on_stop(self) -> None:
        """Tear down mode-specific outputs (mirror of :meth:`_on_start`)."""

    def _extra_subscriber_queues(self) -> list[asyncio.Queue]:
        """Per-subscriber queues beyond events to wake/drain on stop."""
        return []

    def _clear_extra_subscribers(self) -> None:
        """Drop references to any extra subscriber queues after draining."""

    def _demodulate(self, raw_iq: bytes, sample_rate: int) -> bytes:
        """Demodulate one IQ chunk into the PCM bytes served to the sidecar.

        Called in a worker thread (the DSP is CPU-bound). The base bridge serves
        one channel as mono; :class:`AisDecodeBridge` overrides this to serve its
        two channels as interleaved stereo.
        """
        return demod_chunk(raw_iq, sample_rate, self._state)

    def _accept_chunk(self, *, sample_rate: int, center_hz: int) -> bool:
        """Decide whether to demodulate an IQ chunk, given the span it was captured on.

        Runs on the demod loop before each chunk, so a subclass can re-derive its
        channel offset from the live centre frequency (or skip the chunk when its
        channel isn't in the span). The base bridge trusts the caller's offset.
        """
        return True

    def _drain_subscribers(self) -> None:
        """Push a None sentinel to every subscriber so WS drains exit promptly."""
        for queue in [*self._event_subs, *self._extra_subscriber_queues()]:
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                pass
        self._event_subs.clear()
        self._clear_extra_subscribers()

    # ── channel control ────────────────────────────────────────────────────
    def set_channel(self, *, offset_hz: int = 0, bw_hz: int | None = None) -> None:
        """Update the demod offset/bandwidth live (e.g. when the user retunes)."""
        self._state.offset_hz = offset_hz
        if bw_hz:
            self._state.bw_hz = bw_hz

    @property
    def running(self) -> bool:
        """True once :meth:`start` has begun serving PCM (until :meth:`stop`)."""
        return self._running

    @property
    def decoder_reachable(self) -> bool:
        return self._decoder_connected

    @property
    def pcm_port(self) -> int:
        return self._pcm_port

    # ── decoder TCP (PCM out) ──────────────────────────────────────────────
    async def _on_decoder_connection(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
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
        assert self._iq_queue is not None
        try:
            while True:
                payload = await self._iq_queue.get()
                if payload is None:
                    break
                if self._pcm_writer is None or len(payload) < 8:
                    continue
                sample_rate, center_hz = struct.unpack("<II", payload[:8])
                if not self._accept_chunk(sample_rate=sample_rate, center_hz=center_hz):
                    continue
                raw_iq = payload[8:]
                pcm = await asyncio.to_thread(self._demodulate, raw_iq, sample_rate)
                if not pcm:
                    continue
                writer = self._pcm_writer
                if writer is None:
                    continue
                try:
                    writer.write(pcm)
                    await writer.drain()
                except (ConnectionResetError, BrokenPipeError, OSError):
                    if self._pcm_writer is writer:
                        self._pcm_writer = None
                        self._decoder_connected = False
                        self._publish_status()
        except asyncio.CancelledError:
            pass

    # ── event subscriptions for the browser WS ─────────────────────────────
    def subscribe_events(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=64)
        self._event_subs.append(queue)
        RadioBroadcaster._put_dropping(queue, self._status_frame())
        return queue

    def unsubscribe_events(self, queue: asyncio.Queue) -> None:
        try:
            self._event_subs.remove(queue)
        except ValueError:
            pass

    def publish_event(self, event: dict) -> None:
        for queue in list(self._event_subs):
            RadioBroadcaster._put_dropping(queue, event)

    def _status_frame(self) -> dict:
        return {
            "type": "decode_status",
            "decoder_reachable": self._decoder_connected,
        }

    def _publish_status(self) -> None:
        self.publish_event(self._status_frame())

    def wake(self) -> None:
        for queue in [*self._event_subs, *self._extra_subscriber_queues()]:
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:
                pass


class DigitalDecodeBridge(PcmDecodeBridge):
    """Voice-decode bridge (dsd-fme sidecar).

    Extends the PCM spine with the decoded-voice UDP path (dsd-fme sends audio
    back over UDP) and a measured-rate resampler that normalises the varying
    blaster rate to a uniform 48 kHz.
    """

    kind = "voice"

    def __init__(
        self,
        broadcaster: RadioBroadcaster,
        *,
        pcm_port: int | None = None,
        audio_udp_port: int | None = None,
        default_bw_hz: int | None = None,
    ) -> None:
        super().__init__(broadcaster, pcm_port=pcm_port, default_bw_hz=default_bw_hz)
        self._audio_udp_port = settings.decoder_audio_udp_port if audio_udp_port is None else audio_udp_port
        self._udp_transport: asyncio.BaseTransport | None = None
        self._audio_subs: list[asyncio.Queue] = []

        # Decoded-voice rate handling. dsd-fme's UDP blaster rate varies by
        # build/protocol and isn't carried in the stream, so the bridge MEASURES
        # the actual incoming rate, then resamples to a uniform 48 kHz before
        # forwarding (so the browser always plays at one known rate). None until
        # measured.
        self._detected_input_rate: int | None = None
        self._audio_measure_start: float | None = None
        self._audio_measure_bytes = 0

    async def _on_start(self) -> None:
        self._detected_input_rate = None
        self._audio_measure_start = None
        self._audio_measure_bytes = 0

        loop = asyncio.get_running_loop()
        self._udp_transport, _ = await loop.create_datagram_endpoint(
            lambda: _DecodedAudioProtocol(self._on_decoded_audio),
            local_addr=("0.0.0.0", self._audio_udp_port),
        )
        self._audio_udp_port = self._udp_transport.get_extra_info("sockname")[1]
        logger.info("Voice decode audio udp :%d", self._audio_udp_port)

    async def _on_stop(self) -> None:
        if self._udp_transport is not None:
            self._udp_transport.close()
            self._udp_transport = None

    def _extra_subscriber_queues(self) -> list[asyncio.Queue]:
        return list(self._audio_subs)

    def _clear_extra_subscribers(self) -> None:
        self._audio_subs.clear()

    @property
    def audio_udp_port(self) -> int:
        return self._audio_udp_port

    # ── decoded audio (UDP in) ─────────────────────────────────────────────
    def _on_decoded_audio(self, data: bytes) -> None:
        """Resample one decoded-voice datagram to 48 kHz and fan it to WS clients.

        While the incoming rate is still being measured, frames are dropped
        rather than forwarded — playing them at the wrong (not-yet-known) rate
        would be audible as a brief chipmunk/stretched burst.
        """
        if self._detected_input_rate is None:
            self._measure_input_rate(len(data), time.monotonic())
            return

        for queue in list(self._audio_subs):
            RadioBroadcaster._put_dropping(queue, self._resample_to_output(data))

    def _resample_to_output(self, data: bytes) -> bytes:
        """Linearly resample s16 mono PCM from the measured input rate to OUTPUT_RATE.

        dsd-fme's blaster rate varies, so the browser is given a single uniform
        rate. A no-op when the measured rate already equals OUTPUT_RATE.
        """
        if self._detected_input_rate == OUTPUT_RATE or len(data) < _AUDIO_BYTES_PER_SAMPLE:
            return data
        input_samples = np.frombuffer(data, dtype="<i2")
        source_length = len(input_samples)
        assert self._detected_input_rate is not None  # forwarding only runs once measured
        destination_length = round(source_length / self._detected_input_rate * OUTPUT_RATE)
        positions = np.linspace(0, source_length - 1, num=destination_length)
        resampled = np.interp(positions, np.arange(source_length), input_samples)
        return resampled.astype("<i2").tobytes()

    def _measure_input_rate(self, byte_count: int, now: float) -> None:
        """Estimate dsd-fme's actual UDP output rate from real datagram throughput.

        Measured once per session over a short window: the first datagram opens
        the window, then bytes accumulate until ``_AUDIO_RATE_MEASURE_SECONDS``
        have elapsed. The ACTUAL measured rate is used (not snapped to a preset),
        so any real blaster rate resamples to the right pitch. ``now`` is injected
        for deterministic testing.
        """
        if self._audio_measure_start is None:
            self._audio_measure_start = now
            self._audio_measure_bytes = 0
            return

        self._audio_measure_bytes += byte_count
        elapsed = now - self._audio_measure_start
        if elapsed < _AUDIO_RATE_MEASURE_SECONDS:
            return

        samples = self._audio_measure_bytes // _AUDIO_BYTES_PER_SAMPLE
        if samples <= 0:  # window elapsed but no audio yet — keep measuring
            return

        self._detected_input_rate = round(samples / elapsed)
        logger.info(
            "Decoder input rate measured: %d Hz → resampling to %d Hz",
            self._detected_input_rate,
            OUTPUT_RATE,
        )
        self._publish_status()

    # ── audio subscriptions for the browser WS ─────────────────────────────
    def subscribe_audio(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=8)
        self._audio_subs.append(queue)
        return queue

    def unsubscribe_audio(self, queue: asyncio.Queue) -> None:
        try:
            self._audio_subs.remove(queue)
        except ValueError:
            pass

    def _status_frame(self) -> dict:
        # Decoded voice is always resampled to OUTPUT_RATE before the browser
        # sees it, so the reported playback rate is constant.
        return {
            "type": "decode_status",
            "decoder_reachable": self._decoder_connected,
            "audio_sample_rate": OUTPUT_RATE,
        }


# Minimum gap (s) between a channel-owning bridge's attempts to pull the dongle
# back onto its channel after something else tuned it out of the span. Long
# enough not to fight a viewer who is deliberately sweeping the band, short
# enough that decode recovers promptly once they stop.
APRS_RETUNE_INTERVAL_S = 15.0


class ChannelOwningDecodeBridge(PcmDecodeBridge):
    """A PCM bridge that OWNS an absolute channel rather than following a viewer.

    The voice bridge demodulates wherever the viewer points it. The background
    packet bridges (APRS, AIS) can't: they run unattended, so they cannot rely on
    a viewer having left the dongle in the right place. This base gives them the
    shared ownership behaviour:

      * on start, tune the dongle so the owned channel(s) fall in the span;
      * for every IQ chunk, re-derive the demod offset(s) from the centre
        frequency the chunk was actually captured on, so a viewer retuning
        *within* the span doesn't disturb decode at all;
      * when something moves the span off channel (a viewer sweeping the band, a
        satellite auto-tune parking the radio on the ISS), pull it back after
        :data:`APRS_RETUNE_INTERVAL_S` rather than decoding silence indefinitely.

    Subclasses define *which* frequencies they own (:meth:`owned_channels_hz`),
    where the dongle should sit to hear them (:meth:`tune_target_hz`), and how an
    in-span centre maps onto their demod offset(s) (:meth:`_apply_offsets`).
    """

    def __init__(
        self,
        broadcaster: RadioBroadcaster,
        *,
        pcm_port: int | None = None,
        default_bw_hz: int | None = None,
    ) -> None:
        super().__init__(broadcaster, pcm_port=pcm_port, default_bw_hz=default_bw_hz)
        self._on_channel = False
        self._last_retune_monotonic = 0.0
        self._retune_task: asyncio.Task | None = None

    # ── subclass contract ──────────────────────────────────────────────────
    def owned_channels_hz(self) -> tuple[int, ...]:
        """The absolute frequencies that must all be inside the captured span."""
        raise NotImplementedError

    def tune_target_hz(self) -> int:
        """Where to put the dongle's centre so every owned channel is heard."""
        raise NotImplementedError

    def _apply_offsets(self, center_hz: int) -> None:
        """Re-derive this bridge's demod offset(s) from the live centre frequency."""
        raise NotImplementedError

    @property
    def on_channel(self) -> bool:
        """True while the radio's captured span covers every owned channel."""
        return self._on_channel

    # ── lifecycle ──────────────────────────────────────────────────────────
    async def _on_start(self) -> None:
        # Nothing has told the dongle where this channel lives yet — a fresh
        # connection sits on whatever the relay/rtl_tcp last had (see the
        # 145.800 MHz incident), so put it on channel before the first chunk.
        await self._tune_to_channel()

    async def _on_stop(self) -> None:
        if self._retune_task is not None:
            self._retune_task.cancel()
            self._retune_task = None
        self._on_channel = False

    # ── span tracking ──────────────────────────────────────────────────────
    def _channels_in_span(self, *, sample_rate: int, center_hz: int) -> bool:
        """Whether every owned channel (plus its bandwidth) fits in the span.

        The outer ~10% of an RTL-SDR span is rolled off by the tuner's anti-alias
        filter, so a channel there decodes poorly; treat it as out of span too.
        """
        usable_half_span = sample_rate * 0.45
        return all(
            abs(channel_hz - center_hz) + self._state.bw_hz / 2 <= usable_half_span
            for channel_hz in self.owned_channels_hz()
        )

    def _accept_chunk(self, *, sample_rate: int, center_hz: int) -> bool:
        if sample_rate and self._channels_in_span(sample_rate=sample_rate, center_hz=center_hz):
            self._apply_offsets(center_hz)
            if not self._on_channel:
                self._on_channel = True
                logger.info(
                    "%s channel(s) %s back in span (centre %d Hz)",
                    self.kind,
                    self.owned_channels_hz(),
                    center_hz,
                )
            return True
        if self._on_channel:
            self._on_channel = False
            logger.warning(
                "%s channel(s) %s outside the captured span (centre %d Hz, rate %d); retuning",
                self.kind,
                self.owned_channels_hz(),
                center_hz,
                sample_rate,
            )
        self._schedule_retune()
        return False

    def _schedule_retune(self) -> None:
        """Kick off a throttled retune from the demod loop without blocking it."""
        if self._retune_task is not None and not self._retune_task.done():
            return
        if time.monotonic() - self._last_retune_monotonic < APRS_RETUNE_INTERVAL_S:
            return
        self._retune_task = asyncio.create_task(self._tune_to_channel(), name=f"sdr-{self.kind}-retune")

    async def _tune_to_channel(self) -> None:
        """Point the dongle at the channel, unless the current span already covers it.

        Best-effort: a tuner owned by another Sentinel instance, or a dropped
        connection, is logged and left for the next throttled attempt — the
        bridge keeps serving (silence) rather than tearing down.
        """
        self._last_retune_monotonic = time.monotonic()
        connection = self._broadcaster.connection
        if connection.center_hz and self._channels_in_span(
            sample_rate=connection.sample_rate, center_hz=connection.center_hz
        ):
            return
        target_hz = self.tune_target_hz()
        try:
            await connection.set_frequency(target_hz)
            logger.info("%s bridge tuned radio to %d Hz", self.kind, target_hz)
        except Exception as exc:  # noqa: BLE001 - any tuning failure is non-fatal here
            logger.warning("%s bridge could not tune radio to %d Hz: %s", self.kind, target_hz, exc)


class AprsDecodeBridge(ChannelOwningDecodeBridge):
    """APRS packet-decode bridge (Direwolf sidecar).

    Adds nothing to the PCM spine: Direwolf consumes the 48 kHz s16 mono feed and
    the decoded APRS packets arrive back purely as HTTP-ingested events (there is
    no decoded-voice UDP stream). It owns a single absolute channel
    (``channel_hz``, e.g. 144.800 MHz) — see :class:`ChannelOwningDecodeBridge`.
    """

    kind = "aprs"

    def __init__(
        self,
        broadcaster: RadioBroadcaster,
        *,
        channel_hz: int | None = None,
        pcm_port: int | None = None,
        default_bw_hz: int | None = None,
    ) -> None:
        super().__init__(
            broadcaster,
            pcm_port=settings.aprs_decoder_pcm_port if pcm_port is None else pcm_port,
            default_bw_hz=default_bw_hz or settings.aprs_decoder_default_bw_hz,
        )
        self._channel_hz = channel_hz or settings.aprs_channel_hz

    @property
    def channel_hz(self) -> int:
        """The absolute frequency (Hz) this bridge decodes."""
        return self._channel_hz

    def owned_channels_hz(self) -> tuple[int, ...]:
        return (self._channel_hz,)

    def tune_target_hz(self) -> int:
        return self._channel_hz

    def _apply_offsets(self, center_hz: int) -> None:
        self._state.offset_hz = self._channel_hz - center_hz

    async def set_channel_hz(self, channel_hz: int) -> None:
        """Move the bridge to a new channel (Settings change) and retune at once."""
        if channel_hz == self._channel_hz:
            return
        self._channel_hz = channel_hz
        if self._running:
            await self._tune_to_channel()


class AisDecodeBridge(ChannelOwningDecodeBridge):
    """Off-grid AIS decode bridge (two-channel Direwolf sidecar).

    The Sea twin of :class:`AprsDecodeBridge`, with one structural difference:
    AIS ships alternate between two 25 kHz channels 50 kHz apart (A 161.975 MHz,
    B 162.025 MHz), so decoding one loses roughly half the traffic. This bridge
    therefore owns BOTH: it parks the dongle on their midpoint and demodulates
    the same IQ chunk twice, interleaving the results into stereo PCM (left = A,
    right = B) for a Direwolf running ``ACHANNELS 2``. Decoded AIVDM sentences
    arrive back as HTTP-ingested events, exactly as APRS packets do.
    """

    kind = "ais"

    def __init__(
        self,
        broadcaster: RadioBroadcaster,
        *,
        channel_a_hz: int | None = None,
        channel_b_hz: int | None = None,
        pcm_port: int | None = None,
        default_bw_hz: int | None = None,
    ) -> None:
        super().__init__(
            broadcaster,
            pcm_port=settings.ais_decoder_pcm_port if pcm_port is None else pcm_port,
            default_bw_hz=default_bw_hz or settings.ais_decoder_default_bw_hz,
        )
        self._channel_a_hz = channel_a_hz or settings.ais_channel_a_hz
        self._channel_b_hz = channel_b_hz or settings.ais_channel_b_hz
        # Channel A uses the inherited `_state`; channel B needs its own filter
        # memory (its own NCO phase, FIR delay line and resampler phase), so the
        # two demodulations stay continuous and independent across chunks.
        self._channel_b_state = DemodState(bw_hz=self._state.bw_hz)

    @property
    def channel_a_hz(self) -> int:
        """Absolute frequency (Hz) of AIS channel A (left in the stereo feed)."""
        return self._channel_a_hz

    @property
    def channel_b_hz(self) -> int:
        """Absolute frequency (Hz) of AIS channel B (right in the stereo feed)."""
        return self._channel_b_hz

    def owned_channels_hz(self) -> tuple[int, ...]:
        return (self._channel_a_hz, self._channel_b_hz)

    def tune_target_hz(self) -> int:
        """The midpoint of the two channels, so one span covers both equally."""
        return (self._channel_a_hz + self._channel_b_hz) // 2

    def _apply_offsets(self, center_hz: int) -> None:
        self._state.offset_hz = self._channel_a_hz - center_hz
        self._channel_b_state.offset_hz = self._channel_b_hz - center_hz
        # Bandwidth is user/settings-driven on the inherited state only; keep the
        # second channel in step so both filters stay identical (and, with it,
        # their sample counts — see demod_chunk_stereo).
        self._channel_b_state.bw_hz = self._state.bw_hz

    def _demodulate(self, raw_iq: bytes, sample_rate: int) -> bytes:
        return demod_chunk_stereo(raw_iq, sample_rate, self._state, self._channel_b_state)


# ── Bridge cache helpers ────────────────────────────────────────────────────────

# One registry per decoder kind. Keeping them separate means starting an APRS or
# AIS decode never disturbs a running voice decode (each ``get_or_create_*``
# stops only *other bridges of the same kind* — one sidecar container per kind),
# so voice, APRS and AIS can run concurrently on three different radios/dongles.
_bridges: dict[str, DigitalDecodeBridge] = {}
_aprs_bridges: dict[str, AprsDecodeBridge] = {}
_ais_bridges: dict[str, AisDecodeBridge] = {}


def _bridge_key(host: str, port: int | str) -> str:
    return f"{host}:{int(port)}"


# ── voice (dsd-fme) ──────────────────────────────────────────────────────────


def get_bridge(host: str, port: int) -> DigitalDecodeBridge | None:
    return _bridges.get(_bridge_key(host, port))


def get_active_bridge() -> DigitalDecodeBridge | None:
    return next(iter(_bridges.values()), None)


async def get_or_create_bridge(host: str, port: int, broadcaster: RadioBroadcaster) -> DigitalDecodeBridge:
    key = _bridge_key(host, port)
    for other_key in list(_bridges):
        if other_key != key:
            await stop_bridge(*other_key.rsplit(":", 1))
    bridge = _bridges.get(key)
    if bridge is None:
        bridge = DigitalDecodeBridge(broadcaster)
        _bridges[key] = bridge
    return bridge


async def stop_bridge(host: str, port: int | str) -> None:
    bridge = _bridges.pop(_bridge_key(host, port), None)
    if bridge is not None:
        await bridge.stop()


# ── APRS (Direwolf) ──────────────────────────────────────────────────────────


def get_aprs_bridge(host: str, port: int) -> AprsDecodeBridge | None:
    return _aprs_bridges.get(_bridge_key(host, port))


def get_active_aprs_bridge() -> AprsDecodeBridge | None:
    return next(iter(_aprs_bridges.values()), None)


async def get_or_create_aprs_bridge(
    host: str, port: int, broadcaster: RadioBroadcaster, *, channel_hz: int | None = None
) -> AprsDecodeBridge:
    key = _bridge_key(host, port)
    for other_key in list(_aprs_bridges):
        if other_key != key:
            await stop_aprs_bridge(*other_key.rsplit(":", 1))
    bridge = _aprs_bridges.get(key)
    if bridge is None:
        bridge = AprsDecodeBridge(broadcaster, channel_hz=channel_hz)
        _aprs_bridges[key] = bridge
    elif channel_hz is not None:
        await bridge.set_channel_hz(channel_hz)
    return bridge


async def stop_aprs_bridge(host: str, port: int | str) -> None:
    bridge = _aprs_bridges.pop(_bridge_key(host, port), None)
    if bridge is not None:
        await bridge.stop()


# ── AIS (Direwolf, off-grid Sea) ─────────────────────────────────────────────


def get_ais_bridge(host: str, port: int) -> AisDecodeBridge | None:
    return _ais_bridges.get(_bridge_key(host, port))


def get_active_ais_bridge() -> AisDecodeBridge | None:
    return next(iter(_ais_bridges.values()), None)


async def get_or_create_ais_bridge(
    host: str,
    port: int,
    broadcaster: RadioBroadcaster,
    *,
    channel_a_hz: int | None = None,
    channel_b_hz: int | None = None,
) -> AisDecodeBridge:
    key = _bridge_key(host, port)
    for other_key in list(_ais_bridges):
        if other_key != key:
            await stop_ais_bridge(*other_key.rsplit(":", 1))
    bridge = _ais_bridges.get(key)
    if bridge is None:
        bridge = AisDecodeBridge(broadcaster, channel_a_hz=channel_a_hz, channel_b_hz=channel_b_hz)
        _ais_bridges[key] = bridge
    return bridge


async def stop_ais_bridge(host: str, port: int | str) -> None:
    bridge = _ais_bridges.pop(_bridge_key(host, port), None)
    if bridge is not None:
        await bridge.stop()


# ── all-kinds lifecycle ──────────────────────────────────────────────────────


def wake_all_decoders() -> None:
    for bridge in [*_bridges.values(), *_aprs_bridges.values(), *_ais_bridges.values()]:
        bridge.wake()


async def shutdown_all_decoders() -> None:
    for registry, stopper in (
        (_bridges, stop_bridge),
        (_aprs_bridges, stop_aprs_bridge),
        (_ais_bridges, stop_ais_bridge),
    ):
        for key in list(registry):
            host, _, port = key.rpartition(":")
            try:
                await stopper(host, int(port))
            except Exception:
                logger.exception("Error shutting down decode bridge %s", key)
