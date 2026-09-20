<img width="1891" height="1063" alt="sentinel-contour-logo-background-large" src="https://github.com/user-attachments/assets/98d0566d-fde8-42ca-bb24-9cc06ce8f882" />

# Sentinel

Sentinel is a real-time, multi-domain surveillance dashboard: aircraft (ADS-B), satellites (SGP4), ships (AIS), land (APRS, live traffic cameras, UK repeaters) and the radio spectrum (RTL-SDR) on one interactive map. A **FastAPI** backend serves a **Vue 3** single-page app rendering on **MapLibre GL**.

It is **offline-first**: every domain has online and offline data sources with automatic failover, and local **PMTiles** vector tiles keep the map working without internet.

---

## Setup

### Prerequisites

| Tool                                      | Version                                                        |
| ----------------------------------------- | -------------------------------------------------------------- |
| Docker + Docker Compose                   | latest (simplest route — nothing else needed)                  |
| [uv](https://docs.astral.sh/uv/) + Python | uv latest, Python 3.12+ (local backend)                        |
| Node.js / npm                             | Node 24–25, npm 11 — `nvm use` reads `.nvmrc` (local frontend) |

### Run with Docker

```bash
docker compose up --build -d      # http://localhost:8080
```

The build compiles the SPA and packages the backend; the SQLite database is created, seeded and persisted in the `sentinel_db` volume on first run. `--build` is only needed again when dependencies change.

Once running, open **Settings** (gear icon, bottom-right) and set **My Location**.

### Local development (hot reload)

Two terminals. Vite proxies `/api`, `/ws` and `/assets` to the backend on **:8080**.

```bash
# Terminal 1 — backend on :8080
docker compose up                                      # Docker, backend code volume-mounted
#   …or without Docker, from the repo root:
#   uv sync --project backend
#   uv run --project backend uvicorn backend.main:app --reload --port 8080

# Terminal 2 — Vite dev server with HMR
cd frontend/vue && npm install && npm run dev          # http://localhost:5173
```

### Build the SPA for deployment

```bash
cd frontend/vue && npm run build   # → frontend/spa-dist/ (committed; served by the backend)
```

Outside the Vite dev server the backend serves the **pre-built** bundle, so rebuild (and commit) `frontend/spa-dist/` when shipping a frontend change. A hard browser refresh picks it up — no restart needed.

### Configuration

Settings are Pydantic (`backend/config.py`), overridable via environment variables or a git-ignored `.env` in the repo root — copy `.env.example`. Everything has a working default; no secrets are required to run.

| Variable                                 | Default                                 | Purpose                                                                                             |
| ---------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `DB_PATH`                                | `backend/sentinel.db`                   | SQLite file (Docker sets `/app/data/sentinel.db`)                                                   |
| `ADSB_TTL_MS` / `ADSB_STALE_MS`          | `10000` / `60000`                       | ADS-B cache fresh window / stale window                                                             |
| `ADSB_UPSTREAM_BASE`                     | `https://api.adsb.lol/v2`               | ADS-B upstream                                                                                      |
| `TLE_TTL_MS` / `TLE_STALE_MS`            | 6 h / 12 h                              | TLE cache windows                                                                                   |
| `TLE_MANUAL_TTL_MS`                      | 30 d                                    | TTL for manually uploaded TLEs                                                                      |
| `CELESTRAK_ISS_URL`                      | Celestrak active-satellites feed        | Default TLE source                                                                                  |
| `AISSTREAM_API_KEY`                      | _(empty)_                               | [AISStream.io](https://aisstream.io) key for SEA (Settings › SEA takes precedence)                  |
| `AISSTREAM_WS_URL`                       | `wss://stream.aisstream.io/v0/stream`   | AISStream endpoint                                                                                  |
| `SEA_AIS_STALE_MS` / `SEA_AIS_CACHE_MAX` | 30 min / `50000`                        | Vessel retention / in-memory cap                                                                    |
| `LAND_FEED_CREDENTIALS_JSON`             | _(empty)_                               | Live-feed credentials keyed by feed id, for headless deployments (Settings › LAND takes precedence) |
| `REPEATERS_UPSTREAM_URL`                 | `https://ukrepeater.net/csvcreate8.php` | UK repeater register; refreshed daily, stale copy served for 30 d                                   |
| `SENTINEL_DECODER_SECRET`                | _(auto-generated)_                      | Optional override for the sidecar ingest secret                                                     |

Decoder (`DECODER_*`, `APRS_DECODER_*`), Sentry (`SENTRY_*`) and AIS watchdog tunables are wired by `docker-compose.yml` and rarely need changing — see `backend/config.py`.

---

## Domains

| Domain    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AIR**   | ADS-B aircraft from [adsb.lol](https://adsb.lol), proxied and cached (10 s fresh / 60 s stale). Airports with frequencies, military bases, AWACS lobes, range rings, overhead-alert zone. Optional flight replay (`air.replayEnabled`, off by default) and [Off Grid](#off-grid-ads-b) decoding from your own SDR.                                                                                                                                                                                                                                                          |
| **SPACE** | SGP4 propagation from TLEs (ISS by default, any NORAD ID). Multi-orbit ground track, footprint, pass prediction with heads-up notifications and optional SDR **auto-tune** to a downlink, day/night terminator, TLE database management (Celestrak fetch, upload, categorise).                                                                                                                                                                                                                                                                                              |
| **SEA**   | Live AIS from AISStream.io (free key → Settings › SEA). One WebSocket per process, vessels held in memory with static data merged in, 30-min retention, dead-reckoned between 10 s polls, snapshotted to SQLite for warm restarts. Type-coloured hulls, filter/search pane (the map's accessible data list), recent track on select, charted ferry routes from the base tiles. Coverage box in Settings › SEA — worldwide is heavy; pick a region on a small host.                                                                                                          |
| **LAND**  | Three layers, one at a time: **APRS stations** from the [Direwolf sidecar](#aprs-decoding); **live traffic cameras** (Durham CC, TfL JamCams, UTMC, TrafficWatchNI — credentials in Settings › LAND › Live Feeds); the **UK repeater directory** from [ukrepeater.net](https://ukrepeater.net/) with per-channel frequencies (tap to tune the SDR), modes, tones, BAND/MODE/STATUS filters and configurable labels. The register refreshes daily and falls back to `backend/data/uk_repeaters.json` offline; the directory is viewable/editable as JSON in Settings › LAND. |
| **SDR**   | Each radio is a remote `rtl_tcp`. One IQ broadcaster per radio fans FFT frames to every WebSocket client for a live spectrum + waterfall. Tune, set bandwidth/gain, demodulate audio, colour-coded frequency groups, range search, band plan overlay, WAV + raw-IQ recording. Optional [digital voice](#digital-voice-decoding) and [APRS](#aprs-decoding) decode.                                                                                                                                                                                                          |

---

## Optional decoder sidecars

Each decoder is a separate container behind its own compose **profile** — never built by default or in CI. All three can run at once, but **each needs its own dongle**: Sentinel takes an enforced lease on the receiver it is using. No configuration is needed; the ingest secret is auto-generated by the backend and shared via a Docker volume. A `401` in a sidecar's logs means it started before `app` wrote the secret — `docker compose --profile <name> restart <service>`.

```bash
docker compose --profile decoder up -d --build     # digital voice (dsd-fme)
docker compose --profile aprs up -d --build        # APRS (Direwolf)
docker compose --profile adsb up -d --build        # Off Grid ADS-B (readsb)
docker compose --profile decoder --profile aprs up -d --build   # combine profiles freely
docker compose --profile <name> logs -f <service>  # decoder · aprs-decoder · adsb-decoder
docker compose --profile <name> down && docker compose up -d    # back to app-only
```

### Digital voice decoding

P25, DMR, NXDN, D-STAR, YSF, M17 via **`dsd-fme`**. Opt-in because it compiles the patent-encumbered **`mbelib`** vocoder on your machine; the first build takes several minutes. In the SDR view: start a radio, tune a digital channel, click **DIGITAL** — call metadata appears in the decode panel and voice plays. "No sync" with nothing tuned in is expected. Details: [`decoder/README.md`](decoder/README.md).

### APRS decoding

1200-baud AFSK/AX.25 via **Direwolf** (144.800 MHz Europe, 144.390 MHz North America). Select the radio on your APRS frequency and click **APRS**; packets list below the waterfall and stations plot on the Land map (Land domain must be enabled). Decode keeps running in the background and resumes on restart. Details: [`decoder/aprs/README.md`](decoder/aprs/README.md).

### Off Grid ADS-B

Decodes 1090 MHz locally with **readsb** fed raw I/Q from a Sentry Pi's `rtl_tcp` — roughly **38 Mbps sustained** on your LAN, so not for constrained links. Setup:

1. **Settings › SDR** — add the Sentry host with its console password.
2. **Settings › AIR › Off Grid SDR** — pick the dongle.
3. **Settings › AIR › Off Grid Data Source** — `http://adsb-decoder:8080/data/aircraft.json` (or `http://<host>:8090/…` from outside the compose network).
4. Switch to **Off Grid** and open **AIR**.

Opening AIR claims the dongle, tunes it to 1090 MHz and holds a TTL lease that self-heals after a replug or Sentry restart and releases when the tab closes. If the map stays empty, the notice at the top of AIR says why. Details: [`decoder/adsb/README.md`](decoder/adsb/README.md), [ADR 0003](docs/adr/0003-sentry-sdr-lock-and-tune.md).

---

## Offline maps

Place [PMTiles](https://protomaps.com) archives in `frontend/assets/tiles/`:

| File                   | Coverage                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `surroundings.pmtiles` | Global overview (zoom 0–6)                                                                                  |
| `uk.pmtiles`           | Regional detail (zoom 0–14)                                                                                 |
| `uk-terrain.pmtiles`   | Optional Terrarium DEM for the **TERRAIN** layer (hillshade + contours); the button is disabled when absent |

```bash
brew install pmtiles    # or a binary from https://github.com/protomaps/go-pmtiles/releases
mkdir -p frontend/assets/tiles
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/surroundings.pmtiles --maxzoom=6
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/uk.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=14
pmtiles extract https://download.mapterhorn.com/planet.pmtiles frontend/assets/tiles/uk-terrain.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=12
```

`--bbox` is `west,south,east,north`; add `--dry-run` to see the download size first. Switch via **Settings › Connectivity Mode › Offline**, or let Sentinel fail over automatically.

---

## Architecture

FastAPI is the only server: JSON API, SDR WebSockets, static map assets and the built SPA, with an `index.html` catch-all for Vue Router.

```
Browser ──┬─► /api/**            → routers: air · space · sea · land · land/feeds · sdr · sdr/sentry-hosts · sdr/adsb · settings
          ├─► /ws/sdr/{id}[/iq|/decode]  → spectrum frames / raw IQ / decoded calls
          ├─► /assets/**         → map tiles, PMTiles, sprites, fonts
          ├─► /spa-assets/**     → hashed Vue bundle
          └─► /{any}             → SPA index.html
```

- **Connectivity** — each domain has online + offline source slots; a global `connectivityMode` plus per-domain `sourceOverride` (auto/online/offline) picks the active one, with a probe URL for auto-failover.
- **Caching** — upstream responses are write-through cached in SQLite with a fresh TTL and a longer stale window; ADS-B responses carry `X-Cache: HIT|MISS|STALE`.
- **Persistence** — SQLite via async SQLAlchemy 2.0. Tables are created from the ORM models (`backend/models.py`) on startup; reference data is seeded from `backend/data/*.json`; preferences live in `user_settings` as `namespace/key/JSON`.
- **API docs** — Swagger at `/api/docs`, ReDoc at `/api/redoc`, liveness at `/health`.

```
backend/          FastAPI app — main.py · config.py · models.py · routers/ · services/ · data/
frontend/vue/     Vue 3 + Vite SPA — src/components/<domain>/ · stores/ · router/ · services/
frontend/assets/  Map tiles, PMTiles, sprites, fonts
frontend/spa-dist Built SPA bundle (committed; served by the backend)
decoder/          Opt-in sidecars — dsd-fme · aprs/ (Direwolf) · adsb/ (readsb)
tests/            pytest (backend) + Playwright full-stack smoke
docs/adr/         Architecture decision records
```

| Layer     | Technology                                                                 |
| --------- | -------------------------------------------------------------------------- |
| Backend   | Python 3.12+, FastAPI, SQLAlchemy 2.0 async, aiosqlite, NumPy (FFT), sgp4  |
| Frontend  | Vue 3 + TypeScript, Pinia, Vue Router, Vite, MapLibre GL, PMTiles, sigplot |
| Packaging | uv, Docker Compose                                                         |

---

## Tests & quality gates

All gates run in CI on every PR and push to `main`. Backend commands run from the repo **root** with `--project backend` so uv resolves the backend venv.

```bash
# Backend
uv run --project backend pytest
uv run --project backend ruff check backend && uv run --project backend ruff format --check backend

# Vue SPA (frontend/vue/)
npm run lint && npm run typecheck
npm run test:coverage         # vitest — gated at 100% coverage
npx playwright install chromium   # once
npm run test:e2e              # Playwright + axe-core (WCAG 2.2 AA) against the committed spa-dist — run `npm run build` first
A11Y_BASE_URL=http://localhost:8080 npm run test:e2e   # …or against a running backend

# Root tooling
npm run lint && npm run typecheck
```

The e2e suite is a **separate** gate from vitest — UI restructuring can break it while every unit test passes. See [CONTRIBUTING.md](CONTRIBUTING.md) for first-time setup, the tooling contexts, the coverage gate and commit/branch/PR conventions (branch off `main`, [Conventional Commits](https://www.conventionalcommits.org) — `CHANGELOG.md` is generated from them).
