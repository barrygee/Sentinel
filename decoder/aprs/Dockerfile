# APRS decoder sidecar — runs Direwolf (a software TNC) against the Sentinel
# backend's FM-demodulated PCM feed, parses the decoded packets with aprslib, and
# POSTs them to the backend so they plot on the Land map and show in the SDR
# panels.
#
# Unlike the digital-voice decoder, Direwolf is plain GPL software with no
# patent-encumbered vocoder, so nothing here is legally gated. It is still kept
# OPT-IN behind a compose profile (`--profile aprs`) so it is only built/run when
# APRS decode is actually wanted, and never built in CI. See decoder/aprs/README.md.

FROM debian:bookworm-slim

# Direwolf (the AFSK1200 / AX.25 modem + TNC) from Debian; python3 + venv for the
# aprslib-based supervisor. A venv sidesteps PEP 668 (externally-managed) so pip
# can install aprslib without touching the system interpreter.
RUN apt-get update && apt-get install -y --no-install-recommends \
        direwolf python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 aprs

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir aprslib==0.7.2
ENV PATH="/opt/venv/bin:${PATH}"

# Direwolf opens an audio OUTPUT device even for receive-only (stdin) decode, but
# this container has no sound hardware — without a device it prints "Pointless to
# continue without audio device" and exits. Point ALSA's default PCM/CTL at the
# built-in `null` device so the output opens and is simply discarded (we only RX,
# never transmit).
RUN printf 'pcm.!default { type null }\nctl.!default { type null }\n' > /etc/asound.conf

COPY entrypoint.py /app/entrypoint.py

USER aprs
WORKDIR /app

# Defaults wire the sidecar to the backend over the internal compose network.
# The APRS PCM feed is on 7357 (distinct from the voice feed's 7355 so both can
# run at once); ingest/config are the APRS-specific twins of the voice routes.
ENV IQ_PCM_HOST=app \
    IQ_PCM_PORT=7357 \
    INGEST_URL=http://app:8000/api/sdr/aprs/ingest \
    CONFIG_URL=http://app:8000/api/sdr/aprs/config \
    INGEST_SECRET_FILE=/run/decoder/secret

CMD ["python3", "/app/entrypoint.py"]
