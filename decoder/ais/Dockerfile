# Off-grid AIS decoder sidecar — runs Direwolf's AIS modem (9600 bps GMSK)
# against the Sentinel backend's FM-demodulated PCM feed, decodes the AIVDM
# sentences with pyais, and POSTs them to the backend so vessels plot on the Sea
# map with no internet connection.
#
# This is the Sea twin of decoder/aprs: same supervisor shape, same Debian base.
# The differences are the modem (AIS rather than AFSK1200), the stereo
# two-channel audio (AIS alternates between two channels 50 kHz apart, so both
# are decoded at once), pyais in place of aprslib — and that Direwolf is BUILT
# FROM SOURCE here rather than installed from Debian. See below.
#
# Direwolf is plain GPL software with no patent-encumbered vocoder, so nothing
# here is legally gated. It is still kept OPT-IN behind a compose profile
# (`--profile ais`) so it is only built/run when off-grid AIS is actually
# wanted, and never built in CI. See decoder/ais/README.md.

# ── Build stage: Direwolf 1.8.1 ───────────────────────────────────────────────
# Debian bookworm's direwolf (1.6+dfsg-3) CANNOT decode AIS, despite advertising
# the modem. Its config parser flags AIS with a sentinel baud rate (MAX_BAUD-1 =
# 39999) and, unlike the later fix, never resets it to the real 9600 — so
# demod_9600_init is handed 39999 as the symbol rate. Direwolf even says so at
# startup:
#     Channel 0: 39999 baud, AIS, +, 48000 sample rate x 4.
#     The ratio of audio samples per sec (48000) to data rate in baud (39999)
#     is 1.2. There is little hope of success with such a low ratio.
# and then decodes nothing, ever. The bug is present in 1.6 and 1.7; 1.8 added
# the missing `baud = 9600`, so that is the floor for AIS and why this image
# compiles its own rather than using the (smaller, simpler) distro package the
# APRS sidecar can rely on.
FROM debian:bookworm-slim AS direwolf-build

ARG DIREWOLF_VERSION=1.8.1

# Build deps only. The optional gpsd/hamlib integrations are deliberately left
# out — this container only ever demodulates a pipe.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake libasound2-dev libudev-dev ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/wb2osz/direwolf/archive/refs/tags/${DIREWOLF_VERSION}.tar.gz" \
        -o /tmp/direwolf.tar.gz \
    && mkdir -p /tmp/direwolf \
    && tar -xzf /tmp/direwolf.tar.gz -C /tmp/direwolf --strip-components=1 \
    && cmake -S /tmp/direwolf -B /tmp/direwolf/build -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /tmp/direwolf/build --target direwolf -j "$(nproc)"

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

# Runtime libraries only (ALSA + udev for the audio device Direwolf insists on
# opening), plus python3 + venv for the pyais-based supervisor. A venv sidesteps
# PEP 668 (externally-managed) so pip can install pyais without touching the
# system interpreter.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libasound2 libudev1 python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 ais

COPY --from=direwolf-build /tmp/direwolf/build/src/direwolf /usr/local/bin/direwolf
# Direwolf looks for these at startup and prints a warning block for each one it
# cannot find. We never use them (the supervisor parses the NMEA itself rather
# than Direwolf's symbol/tocalls lookups), but an unexplained warning in the
# container log is a false lead when something really is wrong, so ship them.
COPY --from=direwolf-build /tmp/direwolf/data/tocalls.yaml /tmp/direwolf/data/symbols-new.txt \
     /tmp/direwolf/data/symbolsX.txt /usr/local/share/direwolf/

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir pyais==3.2.3
ENV PATH="/opt/venv/bin:${PATH}"

# Direwolf opens an audio OUTPUT device even for receive-only (stdin) decode, but
# this container has no sound hardware — without a device it prints "Pointless to
# continue without audio device" and exits. Point ALSA's default PCM/CTL at the
# built-in `null` device so the output opens and is simply discarded (we only RX,
# never transmit).
RUN printf 'pcm.!default { type null }\nctl.!default { type null }\n' > /etc/asound.conf

# Direwolf refuses to start without a configuration file (it does not fall back
# to built-in defaults), so the receive-only config ships in the image and
# entrypoint.py passes it with `-c`. For AIS it is doubly load-bearing: the
# two-channel setup has no command-line equivalent. See direwolf.conf.
COPY entrypoint.py /app/entrypoint.py
COPY direwolf.conf /app/direwolf.conf

USER ais
WORKDIR /app

# Defaults wire the sidecar to the backend over the internal compose network.
# The AIS PCM feed is on 7358 (distinct from voice's 7355 and APRS's 7357 so all
# three can decode at once); ingest/config are the AIS-specific twins of the
# voice/APRS routes.
ENV IQ_PCM_HOST=app \
    IQ_PCM_PORT=7358 \
    INGEST_URL=http://app:8000/api/sdr/ais/ingest \
    CONFIG_URL=http://app:8000/api/sdr/ais/config \
    INGEST_SECRET_FILE=/run/decoder/secret \
    DIREWOLF_CONFIG=/app/direwolf.conf

CMD ["python3", "/app/entrypoint.py"]
