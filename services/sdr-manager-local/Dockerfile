# sdr-manager-local — the RTL-SDRs plugged into this machine (ADR 0007).
#
# Its own image, not the shared backend one: it carries librtlsdr's tools
# (rtl_tcp, rtl_eeprom), libusb and nmcli, and it is the one Sentinel image
# that runs as root (see the runtime stage). Built from the repo root:
#   docker compose --profile sdr-manager-local build sdr-manager-local
#   docker buildx bake sdr-manager-local          # amd64 + arm64
# It serves its own UI remote (the THIS MACHINE screens), built in stage 2.

# ── Stage 1: librtlsdr from a pinned commit ──────────────────────────────────
# rtl_tcp, rtl_eeprom (EEPROM serial flash), rtl_test/rtl_sdr (the diagnostics
# an operator needs to tell a bad cable or hub from a configuration error) and
# the shared library the ctypes adapter loads. Trixie, the same Debian release
# as the python:3.12-slim-trixie runtime below, so the libraries are
# ABI-compatible without a static link — move the two together. Fetched shallow by SHA; move the pin by editing the ARG. This
# stage is the slow one under QEMU (arm64), and it only reruns when the pin moves.
FROM debian:trixie-slim AS rtlsdr-build
# steve-m/librtlsdr "Release 2.0.3" (2026-08-11).
ARG LIBRTLSDR_COMMIT=797f8143266d983c56d8f35d2d442527529dd8a5
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential cmake git libusb-1.0-0-dev pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# -DDETACH_KERNEL_DRIVER=ON lets rtl_tcp/rtl_eeprom detach the DVB kernel driver
# at runtime, a second line of defence behind the host's driver blacklist.
RUN git init -q /src/librtlsdr && cd /src/librtlsdr \
    && git fetch -q --depth 1 https://github.com/steve-m/librtlsdr.git "${LIBRTLSDR_COMMIT}" \
    && git checkout -q FETCH_HEAD \
    && mkdir build && cd build \
    && cmake ../ -DDETACH_KERNEL_DRIVER=ON -DCMAKE_INSTALL_PREFIX=/opt/rtlsdr \
    && make -j"$(nproc)" && make install

# ── Stage 2: its UI remote ───────────────────────────────────────────────────
# The THIS MACHINE group of Settings › SDR Manager (@sentinel/sdr-manager-local),
# a Module Federation remote served from /remotes/sdr-manager-local/. Built on
# the build machine's platform, as backend/Dockerfile builds the SPA: the
# bundle is plain JS/CSS, identical for every architecture. One npm workspaces
# install, so every workspace's manifest must be present for `npm ci`; only
# this package is built (into frontend/spa-dist/remotes/sdr-manager-local/).
FROM --platform=$BUILDPLATFORM node:24-alpine AS remote-builder
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY frontend/vue/package.json ./frontend/vue/
COPY platform/web/ ./platform/web/
COPY services/sections/ ./services/sections/
COPY services/sdr-manager-local/frontend/ ./services/sdr-manager-local/frontend/
COPY services/sdr-manager-remote/frontend/ ./services/sdr-manager-remote/frontend/
RUN npm ci
RUN npm run build -w @sentinel/sdr-manager-local

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM python:3.12-slim-trixie

# libusb-1.0-0 is the runtime library rtl_tcp/rtl_eeprom link against. tini is
# PID 1: it reaps the supervisor's rtl_tcp/relay process tree and forwards
# signals, which a bare Python PID 1 does not. procps (ps/kill) is for
# inspecting a wedged dongle's processes from inside the container.
# network-manager is here for /usr/bin/nmcli ALONE (Sentry ADR-0007): its daemon
# is never started — nmcli talks to the HOST's NetworkManager over the D-Bus
# socket compose mounts in, and a second NetworkManager fighting the host's
# for the same radio is exactly what this avoids. `policy-rc.d` returning 101
# stops its package scripts trying to start a service in a build with no init.
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d \
    && chmod +x /usr/sbin/policy-rc.d \
    && apt-get update && apt-get install -y --no-install-recommends \
        libusb-1.0-0 tini procps network-manager dnsmasq-utils \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /usr/sbin/policy-rc.d

COPY --from=rtlsdr-build \
    /opt/rtlsdr/bin/rtl_tcp /opt/rtlsdr/bin/rtl_eeprom \
    /opt/rtlsdr/bin/rtl_test /opt/rtlsdr/bin/rtl_sdr \
    /usr/local/bin/
COPY --from=rtlsdr-build /opt/rtlsdr/lib/ /usr/local/lib/
RUN ldconfig

# Pinned to a release that reads backend/uv.lock's format.
COPY --from=ghcr.io/astral-sh/uv:0.10.9 /uv /bin/uv

WORKDIR /app
# uv's own settings (the names are uv's), as in backend/Dockerfile.
ENV UV_HTTP_TIMEOUT=120 \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Third-party dependencies from the one backend lock, cached until it changes.
# `--locked` checks the lock against every workspace package's metadata, so
# each pyproject.toml is copied; only this service's code is installed below.
COPY backend/pyproject.toml backend/uv.lock ./backend/
COPY services/sdr-manager-local/backend/pyproject.toml ./services/sdr-manager-local/backend/
COPY services/sdr-manager-remote/backend/pyproject.toml ./services/sdr-manager-remote/backend/
COPY services/radio/backend/pyproject.toml ./services/radio/backend/
COPY services/docs/backend/pyproject.toml ./services/docs/backend/
COPY services/sections/air/backend/pyproject.toml ./services/sections/air/backend/
COPY services/sections/land/backend/pyproject.toml ./services/sections/land/backend/
COPY services/sections/sdr/backend/pyproject.toml ./services/sections/sdr/backend/
COPY services/sections/sea/backend/pyproject.toml ./services/sections/sea/backend/
COPY services/sections/space/backend/pyproject.toml ./services/sections/space/backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --project backend --locked --no-dev --no-install-project --no-install-local

# The platform it is built on (create_service, the settings client, the
# shared database helpers) and its own package — never a section's. On the
# path rather than installed, so the other workspace packages need not be here.
COPY backend/ ./backend/
COPY services/sdr-manager-local/backend/ ./services/sdr-manager-local/backend/
# Where remotes_dir() looks: frontend/spa-dist/remotes/ beside backend/.
COPY --from=remote-builder /repo/frontend/spa-dist/remotes/sdr-manager-local/ ./frontend/spa-dist/remotes/sdr-manager-local/
ENV PATH="/app/.venv/bin:${PATH}" \
    PYTHONPATH="/app:/app/services/sdr-manager-local/backend"

# Its database (DB_PATH) lives on a volume here.
RUN mkdir -p /data

# Deliberately root, not the runtime user every other Sentinel image drops to
# (ADR 0007, and the one documented exception): the service runs privileged
# with the whole USB bus passed through, which already grants host-level
# device access, and the RTL-SDR device nodes under /dev/bus/usb are root-owned
# with no group/other access on a stock Raspberry Pi OS. A non-root user would
# not shrink what `privileged` grants, but would break every dongle open()
# unless the operator maintained udev rules nothing here sets up.

EXPOSE 8000

# /health is the outer app's: it answers as soon as the service serves, core or no core.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('SDR_MANAGER_LOCAL_HTTP_PORT', '8000') + '/health', timeout=4)"

# run_server binds uvicorn from SDR_MANAGER_LOCAL_HTTP_HOST/_HTTP_PORT and exits
# with a clear message when the port is already taken.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "-m", "sentinel_sdr_manager_local.run_server"]
