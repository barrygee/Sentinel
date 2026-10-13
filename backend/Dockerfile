# ── Stage 1: Build Vue SPA ────────────────────────────────────────────────────
# Built on the BUILD machine's platform, whatever the target: the bundle is
# plain JS/CSS, identical for every architecture, so a multi-arch build
# (docker-bake.hcl) compiles it once natively instead of again under QEMU
# emulation for arm64 — many times slower, for the same files.
FROM --platform=$BUILDPLATFORM node:24-alpine AS spa-builder
# The SPA build ends with `build:sections`, which runs scripts/web-packages.sh
# (a bash script) to build every section's Module Federation remote; alpine
# ships only busybox sh.
RUN apk add --no-cache bash
# npm workspaces: the lockfile and the install live at the repo root, with the SPA
# (frontend/vue) as a member. Manifests are copied before sources for layer caching.
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY frontend/vue/package.json ./frontend/vue/
# The shared @sentinel/* web packages and the section packages are workspace
# members the SPA imports from source, so they are needed for both the install
# and the build. Only each section's frontend/ is a workspace; its backend is not.
COPY platform/web/ ./platform/web/
COPY services/sections/ ./services/sections/
RUN npm ci
COPY scripts/web-packages.sh ./scripts/
WORKDIR /repo/frontend/vue
COPY frontend/vue/ ./
# template.css is imported via ../../../../frontend/assets/template.css
COPY frontend/assets/ /repo/frontend/assets/
# outDir is ../../frontend/spa-dist — resolves to /repo/frontend/spa-dist
RUN npm run build

# ── Stage 2: fetch the pinned go-pmtiles binary ───────────────────────────────
# go-pmtiles (the CLI used for `pmtiles extract` region downloads — distinct
# from the Python `pmtiles` package used for local tile serving) publishes no
# checksums.txt file, but GitHub itself records a SHA-256 digest per release
# asset. The sums below were confirmed against those on 2026-09-27 via:
#   gh api repos/protomaps/go-pmtiles/releases/tags/v1.31.2 --jq \
#     '.assets[] | select(.name | contains("Linux")) | "\(.name) \(.digest)"'
# Re-run that (or `curl -sL <asset-url> | sha256sum` against the same asset)
# and update both the version and the two hashes on any version bump.
FROM debian:bookworm-slim AS pmtiles-fetcher
ARG TARGETARCH
ARG PMTILES_VERSION=1.31.2
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /tmp/pmtiles
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) archive="go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz"; \
             sha256="3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f" ;; \
      arm64) archive="go-pmtiles_${PMTILES_VERSION}_Linux_arm64.tar.gz"; \
             sha256="f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o "${archive}" \
      "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${archive}"; \
    echo "${sha256}  ${archive}" | sha256sum -c -; \
    tar -xzf "${archive}"; \
    install -m 0755 pmtiles /usr/local/bin/pmtiles

# ── Stage 3: Python backend ───────────────────────────────────────────────────
FROM python:3.12-slim
WORKDIR /app

# The runtime user. docker-entrypoint.sh drops to it (or to
# SENTINEL_RUNTIME_USER_ID / SENTINEL_RUNTIME_GROUP_ID) after handing it the
# writable mounts; nothing runs as root.
ARG SENTINEL_RUNTIME_USER_ID=1000
ARG SENTINEL_RUNTIME_GROUP_ID=1000
RUN groupadd --gid "${SENTINEL_RUNTIME_GROUP_ID}" sentinel \
    && useradd --uid "${SENTINEL_RUNTIME_USER_ID}" --gid sentinel --create-home --shell /usr/sbin/nologin sentinel

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY --from=pmtiles-fetcher /usr/local/bin/pmtiles /usr/local/bin/pmtiles

# uv's own settings (the names are uv's): how long a package download may take,
# and where the venv goes. The project file sits in backend/ as in the repo, so
# its path dependencies (../services/sections/<id>/backend) resolve the same.
ENV UV_HTTP_TIMEOUT=120 \
    UV_PROJECT_ENVIRONMENT=/app/.venv

# Third-party dependencies first, cached until the lockfile changes; the
# section packages are installed below, once their code is in the image.
COPY backend/pyproject.toml backend/uv.lock ./backend/
# The lock check reads each section package's metadata from its pyproject.toml.
COPY services/sections/air/backend/pyproject.toml ./services/sections/air/backend/
COPY services/sections/land/backend/pyproject.toml ./services/sections/land/backend/
COPY services/sections/space/backend/pyproject.toml ./services/sections/space/backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --project backend --locked --no-dev --no-install-project --no-install-local

# uv only builds the venv; the containers run its programs directly. `uv run`
# re-syncs before starting and so installed the dev dependency group into the
# image's venv on every boot, which the unprivileged runtime user cannot (and
# should not) do.
ENV PATH="/app/.venv/bin:${PATH}"

# backend/ is owned by the runtime user: the app writes the live config file
# (backend/data/sentinel_config.json) when no bind mount replaces it.
COPY --chown=sentinel:sentinel backend/ ./backend/
# Each section's backend package (services/sections/<id>/backend), installed
# editable into the venv like in a checkout. Only the backend folders: the
# frontend packages are compiled into spa-dist by the stage above.
COPY --chown=sentinel:sentinel services/sections/air/backend/ ./services/sections/air/backend/
COPY --chown=sentinel:sentinel services/sections/land/backend/ ./services/sections/land/backend/
COPY --chown=sentinel:sentinel services/sections/space/backend/ ./services/sections/space/backend/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --project backend --locked --no-dev --no-install-project
COPY frontend/assets/ ./frontend/assets/
COPY --from=spa-builder /repo/frontend/spa-dist/ ./frontend/spa-dist/
COPY --chmod=0755 backend/docker-entrypoint.sh /usr/local/bin/sentinel-entrypoint

RUN mkdir -p /app/data && chown sentinel:sentinel /app/data

# Core and every service answer /health on :8000 once their lifespan startup
# has finished, so compose can wait on `service_healthy`. The start period
# covers the first boot, when a service copies its tables out of the app's
# database (legacy import) before it serves anything.
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

ENTRYPOINT ["sentinel-entrypoint"]
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
