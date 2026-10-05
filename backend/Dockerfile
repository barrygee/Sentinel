# ── Stage 1: Build Vue SPA ────────────────────────────────────────────────────
FROM node:24-alpine AS spa-builder
# npm workspaces: the lockfile and the install live at the repo root, with the SPA
# (frontend/vue) as a member. Manifests are copied before sources for layer caching.
WORKDIR /repo
COPY package.json package-lock.json .npmrc ./
COPY frontend/vue/package.json ./frontend/vue/
# The shared @sentinel/* web packages are workspace members the SPA imports from
# source, so they are needed for both the install and the build.
COPY platform/web/ ./platform/web/
RUN npm ci
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

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY --from=pmtiles-fetcher /usr/local/bin/pmtiles /usr/local/bin/pmtiles

ENV UV_HTTP_TIMEOUT=120

COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev --no-install-project

COPY backend/ ./backend/
COPY frontend/assets/ ./frontend/assets/
COPY --from=spa-builder /repo/frontend/spa-dist/ ./frontend/spa-dist/

RUN mkdir -p /app/data

CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
