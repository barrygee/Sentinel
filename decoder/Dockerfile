# Digital-voice decoder sidecar — builds dsd-fme (and its required mbelib
# vocoder) from source, then runs a thin Python supervisor that connects the
# decoder to the Sentinel backend.
#
# ── Legal / patent note ───────────────────────────────────────────────────────
# dsd-fme's build REQUIRES mbelib (`find_package(MBE REQUIRED)`), which
# implements the AMBE/IMBE vocoders — patent-encumbered, "educational purposes
# only" per its own README. There is NO metadata-only build of dsd-fme without
# it. This image is therefore OPT-IN: it is gated behind a compose profile
# (`--profile decoder`), is never built by default, never built in CI, and is
# never published. Building it is a deliberate local action that compiles mbelib
# on YOUR machine; the resulting layers stay local. See decoder/README.md.

# Pin the upstream sources for reproducibility (override at build time if needed).
ARG MBELIB_REF=master
ARG DSDFME_REF=audio_work

# ── Stage 1: build mbelib + dsd-fme from source ───────────────────────────────
FROM debian:bookworm-slim AS build
ARG MBELIB_REF
ARG DSDFME_REF

RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates cmake build-essential pkg-config \
        libsndfile1-dev libncurses-dev libpulse-dev librtlsdr-dev \
    && rm -rf /var/lib/apt/lists/*

# mbelib (required by dsd-fme) — installs libmbe to /usr/local.
RUN git clone https://github.com/szechyjs/mbelib.git /src/mbelib \
    && cd /src/mbelib && git checkout "${MBELIB_REF}" \
    && cmake -S . -B build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --build build --parallel \
    && cmake --install build \
    && ldconfig

# dsd-fme itself.
RUN git clone https://github.com/lwvmobile/dsd-fme.git /src/dsd-fme \
    && cd /src/dsd-fme && git checkout "${DSDFME_REF}" \
    && cmake -S . -B build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --build build --parallel \
    && cmake --install build

# ── Stage 2: minimal runtime ──────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 libncurses6 libpulse0 librtlsdr0 ca-certificates python3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 decoder

# Decoder binary + the mbelib it links against.
COPY --from=build /usr/local/bin/dsd-fme /usr/local/bin/dsd-fme
COPY --from=build /usr/local/lib/libmbe* /usr/local/lib/
RUN ldconfig

COPY entrypoint.py /app/entrypoint.py

USER decoder
WORKDIR /app

# Defaults wire the decoder to the backend over the internal compose network.
ENV IQ_PCM_HOST=app \
    IQ_PCM_PORT=7355 \
    AUDIO_UDP_HOST=app \
    AUDIO_UDP_PORT=7356 \
    INGEST_URL=http://app:8000/api/sdr/decode/ingest \
    RADIO_ID=0

CMD ["python3", "/app/entrypoint.py"]
