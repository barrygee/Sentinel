# Digital-voice decoder sidecar — builds dsd-fme (and its required mbelib
# vocoder) from source, then runs a thin Python supervisor that connects the
# decoder to the Sentinel backend.
#
# ── Legal / patent note ───────────────────────────────────────────────────────
# dsd-fme's build REQUIRES mbelib (`find_package(MBE REQUIRED)`), which
# implements the AMBE/IMBE vocoders — patent-encumbered, "educational purposes
# only" per its own README. There is NO metadata-only build of dsd-fme without
# it. This image is therefore OPT-IN: it is gated behind a compose profile
# (`--profile voice-decoder`), is never built by default, never built in CI, and is
# never published. Building it is a deliberate local action that compiles mbelib
# on YOUR machine; the resulting layers stay local. See decoder/README.md.

# The upstream sources, pinned to commits so a rebuild compiles exactly what was
# tested rather than whatever the branch holds today. To move a pin, resolve the
# branch's current head and replace the SHA (override at build time with
# --build-arg to try one without editing):
#   git ls-remote https://github.com/szechyjs/mbelib.git refs/heads/master
#   git ls-remote https://github.com/lwvmobile/dsd-fme.git refs/heads/audio_work
# mbelib `master`, pinned 2026-10-13.
ARG MBELIB_COMMIT=9a04ed5c78176a9965f3d43f7aa1b1f5330e771f
# dsd-fme `audio_work`, pinned 2026-10-13.
ARG DSDFME_COMMIT=4fe32db7f5affb0484aa0e4f8bbc50eabe3c8531

# ── Stage 1: build mbelib + dsd-fme from source ───────────────────────────────
FROM debian:bookworm-slim AS build
ARG MBELIB_COMMIT
ARG DSDFME_COMMIT

RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates cmake build-essential pkg-config \
        libsndfile1-dev libncurses-dev libpulse-dev librtlsdr-dev \
    && rm -rf /var/lib/apt/lists/*

# mbelib (required by dsd-fme) — installs libmbe to /usr/local.
# Fetched by commit, shallow: `git clone --branch` takes only a branch or tag,
# and a full clone just to check out one commit downloads the whole history.
RUN git init -q /src/mbelib && cd /src/mbelib \
    && git fetch -q --depth 1 https://github.com/szechyjs/mbelib.git "${MBELIB_COMMIT}" \
    && git checkout -q FETCH_HEAD \
    && cmake -S . -B build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --build build --parallel \
    && cmake --install build \
    && ldconfig

# dsd-fme itself.
RUN git init -q /src/dsd-fme && cd /src/dsd-fme \
    && git fetch -q --depth 1 https://github.com/lwvmobile/dsd-fme.git "${DSDFME_COMMIT}" \
    && git checkout -q FETCH_HEAD \
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

# HTTP goes to the radio hub through Sentinel's gateway on the internal compose
# network; the hub's config reply names its PCM feed and voice-audio port.
ENV SENTINEL_GATEWAY_URL=http://gateway:8080

CMD ["python3", "/app/entrypoint.py"]
