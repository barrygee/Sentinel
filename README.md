![Sentinel logo](frontend/assets/logo.svg)

# Sentinel

**One screen. Every signal in the sky.**

Sentinel is a real-time, multi-domain surveillance dashboard that tracks aircraft, satellites, and the radio spectrum on a single interactive map. A **FastAPI** backend serves a **Vue 3** single-page app that renders live data on **MapLibre GL** maps.

It is built **offline-first**: each domain has online and offline data sources with automatic failover, and offline vector map tiles (**PMTiles**) mean the map keeps working when the internet doesn't.

---

## Domains

| Domain | Status | What it does |
|---|---|---|
| **AIR** | ✅ Live | Real-time ADS-B aircraft tracking, flight replay, military/civil filtering, airports & airspace overlays |
| **SPACE** | ✅ Live | SGP4 satellite propagation, ground tracks & footprints, pass prediction, day/night terminator, TLE management, satellite-radio auto-tune |
| **SDR** | ✅ Live | Live RTL-SDR spectrum + waterfall over `rtl_tcp`, tuning, audio demod, frequency groups, frequency search, recordings |
| **SEA** | 🚧 Stub | Routing/settings scaffolding only — no data integration yet |
| **LAND** | 🚧 Stub | Routing/settings scaffolding only — no data integration yet |

### AIR
ADS-B aircraft from the [airplanes.live](https://airplanes.live) API are proxied through the backend and cached in SQLite (10 s fresh TTL, 60 s stale window) to limit upstream load. Aircraft render as oriented icons; clicking one opens a detail panel and lets you track it. Map controls add airports (with frequencies), military bases, AWACS lobes, range rings, roads, an overhead-alert zone, and live labels.

Optional **flight replay** (off by default, behind `air.replayEnabled`) records periodic snapshots into SQLite so past flights can be browsed by date and replayed on the map.

### SPACE
Satellites are propagated from TLE data using **SGP4**. The default view tracks the ISS; any catalogued satellite can be selected by NORAD ID to show its current position, multi-orbit ground track, and visibility footprint. Pass prediction lists upcoming passes over your location, with heads-up notifications and optional **auto-tune** that drives the SDR to a satellite's downlink frequency during a pass. A day/night terminator overlay and full **TLE database management** (fetch from Celestrak, upload `.txt`, categorise, clear) are built in.

### SDR
Each configured radio connects to a remote **`rtl_tcp`** daemon. The backend runs one IQ broadcaster per radio and fans computed FFT frames out to all subscribed WebSocket clients, which render a live **spectrum + waterfall**. You can tune, set bandwidth/gain, demodulate audio, organise frequencies into colour-coded groups, run a frequency **search** across ranges, overlay a band plan, and **record** audio (WAV) and raw IQ clips for later playback.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2.0 (async), aiosqlite |
| Frontend | Vue 3 + TypeScript, Pinia, Vue Router, Vite |
| Maps | MapLibre GL JS, PMTiles (offline vector tiles) |
| Spectrum | sigplot (waterfall), NumPy (FFT) |
| Satellites | sgp4 (TLE propagation), Celestrak feeds |
| SDR | `rtl_tcp` over raw asyncio TCP, WebSocket streaming |
| Database | SQLite (aiosqlite) |
| Packaging | uv (Python), Docker / Docker Compose |

---

## Architecture

FastAPI is the only server. It exposes the JSON API and SDR WebSockets, serves the static map assets, and serves the built Vue SPA, falling back to the SPA's `index.html` so Vue Router can handle client-side routes.

```
Browser ──┬─► /api/**            → domain routers (air, space, settings, sdr)
          ├─► /ws/sdr/{id}[/iq]  → SDR spectrum / raw-IQ WebSocket stream
          ├─► /assets/**         → map tiles, PMTiles, sprites, fonts
          ├─► /spa-assets/**     → hashed Vue JS/CSS bundle
          └─► /{any}             → SPA index.html (Vue Router)
```

**Connectivity model.** Each domain has online + offline data-source slots. A global `connectivityMode` (online/offline) plus a per-domain `sourceOverride` (auto/online/offline) decide which is active; a probe URL is polled to auto-switch on connectivity loss.

**Caching.** Upstream responses are write-through cached in SQLite with a *fresh* TTL and a longer *stale* window — stale data is served if the upstream is unreachable. ADS-B responses carry an `X-Cache: HIT|MISS|STALE` header.

**Persistence.** SQLite via SQLAlchemy async. The schema is created from the ORM models on startup, and defaults plus SDR/satellite reference data are seeded from `backend/data/*.json`. User preferences live in `user_settings` as `namespace / key / JSON-value` triples.

### Project layout

```
Sentinel/
├── backend/                  FastAPI application (uv-managed)
│   ├── main.py               App, lifespan, static mounts, SPA catch-all
│   ├── config.py             Pydantic settings (TTLs, upstream URLs)
│   ├── database.py           Engine, table creation, seeders, migrations
│   ├── models.py             SQLAlchemy ORM models
│   ├── routers/              air.py · space.py · sdr.py · settings.py
│   ├── services/             adsb · satellite · tle · daynight · sdr · sdr_data
│   │                         · sat_radio · flight_history · json_store
│   └── data/                 Seed JSON (bandplan, frequencies, satellite radio)
│
├── frontend/
│   ├── vue/                  Vue 3 + Vite SPA (the application)
│   │   └── src/              components/<domain>/ · stores/ · router/ · services/
│   ├── assets/               Map tiles, PMTiles, sprites, fonts, logos
│   └── spa-dist/             Built SPA bundle (served by the backend; committed)
│
├── tests/                    pytest (backend) + jest (frontend helpers)
├── docker-compose.yml        Backend service (host :8080)
└── backend/Dockerfile        Multi-stage build (SPA + backend)
```

---

## Getting started

### Run with Docker (simplest)

```bash
docker compose up --build      # app on http://localhost:8080
```

The multi-stage build compiles the Vue SPA and packages the backend. The SQLite database is created and seeded on first run and persisted in the `sentinel_db` volume. You only need `--build` again when dependencies change.

### Local development (hot reload)

Two terminals. The Vite dev server proxies `/api`, `/ws`, and `/assets` to the backend on port **8080**, so run the backend there:

```bash
# Terminal 1 — backend on :8080 (Docker, code volume-mounted with --reload)
docker compose up
#   …or without Docker, from the repo root:
#   cd backend && uv sync
#   uv run --project backend uvicorn backend.main:app --reload --port 8080

# Terminal 2 — Vite dev server with hot module reload
cd frontend/vue
npm install
npm run dev                    # open http://localhost:5173
```

Backend edits hot-reload via `uvicorn --reload`; Vue edits via Vite HMR.

### Building the SPA for deployment

```bash
cd frontend/vue
npm run build                  # outputs to ../../frontend/spa-dist (committed, served by the backend)
```

> Outside the Vite dev server, the backend serves the **pre-built** bundle from `frontend/spa-dist/`. Rebuild (and commit) it when shipping a frontend change — a hard browser refresh then picks it up; no backend restart needed.

Once running, open **Settings** (gear icon, bottom-right) and set *My Location* to your latitude/longitude.

---

## Testing

Run from the repo **root**. Pass `--project backend` so `uv` uses the backend virtualenv (the Python project's `pyproject.toml` lives in `backend/`):

```bash
uv run --project backend pytest                 # backend tests
uv run --project backend pytest tests/backend/test_routers_air.py::test_name   # single test
uv run --project backend ruff check backend     # lint
npm test                                         # frontend helper unit tests (jest)
cd frontend/vue && npm run typecheck             # SPA type-check (vue-tsc)
```

---

## Configuration

Backend settings live in `backend/config.py` (Pydantic Settings) and can be overridden via environment variables or a `.env` file in the repo root.

| Variable | Default | Description |
|---|---|---|
| `DB_PATH` | `backend/sentinel.db` | SQLite database file path |
| `ADSB_TTL_MS` | `10000` | ADS-B cache fresh window (ms) |
| `ADSB_STALE_MS` | `60000` | ADS-B stale window — serve old data if upstream fails (ms) |
| `ADSB_UPSTREAM_BASE` | `https://api.airplanes.live/v2` | ADS-B upstream base URL |
| `TLE_TTL_MS` | `21600000` (6 h) | TLE cache fresh window |
| `TLE_STALE_MS` | `43200000` (12 h) | TLE stale window |
| `TLE_MANUAL_TTL_MS` | `2592000000` (30 d) | TTL for manually-uploaded TLE data |
| `CELESTRAK_ISS_URL` | Celestrak active-satellites TLE feed | Default TLE feed URL |

In Docker, set these under `environment:` in `docker-compose.yml`.

---

## API reference

Interactive docs are available at `/api/docs` (Swagger) and `/api/redoc` when the app is running. `GET /health` is a liveness probe.

### AIR — `/api/air`
| Method | Path | Description |
|---|---|---|
| GET | `/adsb/point/{lat}/{lon}/{radius}` | Aircraft within *radius* nm of a point (cached) |
| GET · POST · DELETE | `/messages` · `/messages/{id}` | List / create / dismiss notification messages |
| GET · POST · DELETE | `/tracking` · `/tracking/{hex}` | List / add / remove tracked aircraft |
| GET | `/recordings/available-dates` | Dates with recorded flight snapshots |
| GET | `/snapshots` | Aircraft snapshots for replay |
| GET · DELETE | `/flights` · `/flights/{registration}[/{flight_id}]` | Recorded flight history |

### SPACE — `/api/space`
| Method | Path | Description |
|---|---|---|
| GET | `/iss` | ISS position, ground track, footprint |
| GET | `/satellite/{norad_id}` | Position, ground track, footprint for any satellite |
| GET | `/iss/passes` · `/satellite/{norad_id}/passes` · `/passes` | Pass predictions over an observer location |
| GET | `/daynight` | Day/night terminator as GeoJSON |
| GET | `/tle/status` · `/tle/list` · `/tle/uncategorised` | TLE database summaries |
| POST | `/tle/fetch` · `/tle/manual` | Import TLEs from a URL or raw text |
| PATCH | `/tle/category` · `/tle/satellite` | Categorise / edit satellites |
| DELETE | `/tle` | Clear TLE data (`?confirm=true`) |
| GET · POST | `/radio/file` | Satellite-radio frequency data |

### SDR — `/api/sdr`
| Method | Path | Description |
|---|---|---|
| GET · POST · PUT · DELETE | `/radios[/{id}]` | Manage configured radios |
| GET · POST · PUT · DELETE | `/groups[/{id}]` · `/frequencies[/{id}]` · `/search-ranges[/{id}]` | Manage frequency groups, stored frequencies, search ranges |
| GET · POST | `/data/frequencies` · `/data/bandplan` | Bulk import/export of SDR data |
| GET · POST · PATCH · DELETE | `/recordings[...]` | Manage recordings; `/recordings/{id}/file` (WAV) and `/{id}/iq` (raw IQ) download |
| POST | `/connect` · `/disconnect` | Open/close a radio's `rtl_tcp` connection |
| GET | `/status/{radio_id}` | Connection state |
| WS | `/ws/sdr/{radio_id}` · `/ws/sdr/{radio_id}/iq` | Spectrum frames / raw IQ stream |

### Settings — `/api/settings`
| Method | Path | Description |
|---|---|---|
| GET | `/` · `/{namespace}` | All settings, or one namespace as `{key: value}` |
| PUT · DELETE | `/{namespace}/{key}` | Upsert / delete a setting |
| GET | `/config/preview` | Current settings as a downloadable config JSON |
| POST | `/config/upload` | Replace settings from an uploaded config JSON |

---

## Offline maps

Sentinel renders offline from [PMTiles](https://protomaps.com) vector archives placed in `frontend/assets/tiles/`:

| File | Coverage |
|---|---|
| `surroundings.pmtiles` | Global overview (zoom 0–6) |
| `uk.pmtiles` | Regional detail (e.g. UK, zoom 0–14) |

Install the `pmtiles` CLI (`brew install protomaps/homebrew-tap/pmtiles`) and extract a region from a Protomaps planet build:

```bash
mkdir -p frontend/assets/tiles
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles \
  frontend/assets/tiles/surroundings.pmtiles --maxzoom=6
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles \
  frontend/assets/tiles/uk.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=14
```

`--bbox` is `west,south,east,north` in decimal degrees. With the files in place, switch via **Settings → Connectivity Mode → Offline**, or let Sentinel fail over automatically when it loses connectivity.

---

## Database

SQLite tables are created automatically from the ORM models on startup:

`adsb_cache` · `tle_cache` · `satellite_catalogue` · `air_messages` · `air_tracking` · `air_aircraft` · `air_flights` · `air_snapshots` · `sdr_radios` · `sdr_frequency_groups` · `sdr_stored_frequencies` · `sdr_frequency_group_links` · `sdr_search_ranges` · `sdr_recordings` · `user_settings`
