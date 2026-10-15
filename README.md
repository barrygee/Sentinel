<img width="1891" height="1063" alt="sentinel-contour-logo-background-large" src="https://github.com/user-attachments/assets/98d0566d-fde8-42ca-bb24-9cc06ce8f882" />

# Sentinel

Sentinel is a real-time, offline-capable surveillance dashboard that puts five sections on one interactive map:

- **Air** — aircraft (ADS-B)
- **Space** — satellites (SGP4), passes and the day/night terminator
- **Sea** — ships (AIS)
- **Land** — APRS stations and the UK repeater directory
- **SDR** — your RTL-SDR radios: spectrum, waterfall, audio and recording

Every section has an online and an off-grid data source (switch with **Online / Off Grid** in Settings), and bundled map tiles keep the map working without internet. What each section does in detail: [docs/sections.md](docs/sections.md).

## Architecture

Sentinel is a small **core** plus **one service per section**, all built from one backend image.

```
Browser ──► :8080 gateway (Caddy) ──┬──► app          core: shell UI, settings, notifications, offline maps
                                    ├──► space · land · air · sea · sdr     one service + database each
                                    └──► radio ──► your radios (rtl_tcp / Sentry)
            nats (event bus) connects them all; optional decoders attach to the radio hub
```

- **Core** is always on: `app` (the shell UI and settings), `gateway` (the only address browsers use) and `nats` (the event bus).
- **Each section** runs as its own service with its own database. It registers with core when it starts, and its menu entry, map and settings appear. A section that isn't running doesn't appear, and one that stops is greyed out while the others keep working.
- **The radio hub** owns every radio, so SDR audio keeps playing as you move between sections. It can run on a second machine next to the antennas ([docs/radio-host.md](docs/radio-host.md)).

The design and its trade-offs are in [ADR 0006](docs/adr/0006-section-containers.md).

## Start Sentinel

You need **Docker with Docker Compose**. Nothing else is required to run it.

```bash
cp .env.example .env              # optional: every setting has a working default
docker compose up --build -d      # the whole app: core + every section
```

Open **http://localhost:8080**, then **Settings** (gear icon, bottom-right) › **My Location**. The first build takes a few minutes. Afterwards `docker compose up -d` is enough, with `--build` only when dependencies change.

**Just one section.** Name it (plus `gateway`) and compose starts core with it:

```bash
docker compose up -d gateway sea                 # core + Sea only
docker compose up -d gateway sdr radio           # core + SDR (it needs the radio hub for live radios)
docker compose up -d --scale land=0              # everything except Land
```

**Radio decoders** (digital voice, APRS, off-grid AIS, off-grid ADS-B) are opt-in and each needs its own dongle: `docker compose --profile all up --build -d`, or one at a time. See [docs/decoders.md](docs/decoders.md).

**Stop:** `docker compose down`. Your data stays in Docker volumes.

## SDR recordings

The **Record** button (●) in the SDR radio panel saves what you're listening
to: a WAV of the audio and, with **Settings › SDR › Record Raw IQ with
Recordings** on, a raw IQ file of the whole band the radio was receiving. Play,
download and delete them from the panel's **RECORDINGS** tab.

By default they're kept inside Docker, in the `sdr_recordings` volume, where
you can only reach them through the app. To save them to a folder on this
computer instead (to open them in other software, keep them on a bigger disk,
or back them up), set the folder in `.env` and restart the SDR service:

```bash
SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings
docker compose up -d sdr
```

To sort recordings into subfolders such as `satellites/noaa`, set
**Settings › SDR › Recordings Folder**. Changing either setting affects only
new recordings, and nothing already saved is moved. The details are in
[docs/operations.md](docs/operations.md#where-recordings-are-saved).

## Documentation

| Topic | Where |
|---|---|
| Logs, health, troubleshooting, upgrades, other architectures | [docs/operations.md](docs/operations.md) |
| Where SDR recordings are saved | [docs/operations.md](docs/operations.md#where-recordings-are-saved) |
| Environment variables | [docs/configuration.md](docs/configuration.md) · [`.env.example`](.env.example) |
| Decoder sidecars | [docs/decoders.md](docs/decoders.md) |
| Offline maps (bundled tiles, in-app downloads) | [docs/offline-maps.md](docs/offline-maps.md) |
| Radio hub on a second machine | [docs/radio-host.md](docs/radio-host.md) |
| Development, tests and quality gates, commit/PR conventions | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Architecture decisions | [docs/adr/](docs/adr/) |
