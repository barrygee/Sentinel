# Configuration

Settings are Pydantic (`backend/config.py`), overridable via environment variables or a git-ignored `.env` in the repo root — copy `.env.example`. Everything has a working default; no secrets are required to run.

| Variable                                                   | Default                                  | Purpose                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DB_PATH`                                                  | `backend/sentinel.db`                    | SQLite file (Docker sets `/app/data/sentinel.db`)                                                                      |
| `ADSB_TTL_MS` / `ADSB_STALE_MS`                            | `10000` / `60000`                        | ADS-B cache fresh window / stale window                                                                                |
| `ADSB_UPSTREAM_BASE`                                       | `https://api.adsb.lol/v2`                | ADS-B upstream                                                                                                         |
| `TLE_TTL_MS` / `TLE_STALE_MS`                              | 6 h / 12 h                               | TLE cache windows                                                                                                      |
| `TLE_MANUAL_TTL_MS`                                        | 30 d                                     | TTL for manually uploaded TLEs                                                                                         |
| `CELESTRAK_ISS_URL`                                        | Celestrak active-satellites feed         | Default TLE source                                                                                                     |
| `AISSTREAM_API_KEY`                                        | _(empty)_                                | [AISStream.io](https://aisstream.io) key for SEA (Settings › SEA takes precedence)                                     |
| `AISSTREAM_WS_URL`                                         | `wss://stream.aisstream.io/v0/stream`    | AISStream endpoint                                                                                                     |
| `SEA_AIS_STALE_MS` / `SEA_AIS_CACHE_MAX`                   | 30 min / `50000`                         | Vessel retention / in-memory cap                                                                                       |
| `SEA_VESSEL_STATIC_RETENTION_MS` / `SEA_VESSEL_STATIC_MAX` | 90 d / `250000`                          | How long vessel names/callsigns/types are remembered after last heard (so position-only reports are still named) / cap |
| `REPEATERS_UPSTREAM_URL`                                   | `https://ukrepeater.net/csvcreate8.php`  | UK repeater register; refreshed daily, stale copy served for 30 d                                                      |
| `NATS_URL`                                                 | _(empty)_; Docker: `tls://nats:4222`     | Event-bus broker; required — every section talks over it (see below)                                                   |
| `GATEWAY_ADMIN_URL`                                        | _(empty)_; Docker: `http://gateway:2019` | Caddy admin API the service registry's routes are pushed into; empty = no gateway (see below)                          |

Decoder ports (`DECODER_*`, `APRS_DECODER_*`, `AIS_DECODER_*`), Sentry (`SENTRY_*`) and AIS watchdog tunables have working defaults and rarely need changing — see `backend/config.py`. Where SDR recordings are saved (`SENTINEL_RECORDINGS_DIRECTORY` plus **Settings › SDR › Recordings Folder**) is covered in [Record what you hear](use/sdr/record.md#where-recordings-are-saved). Deployment-shape settings (`SENTINEL_RADIO_REPLICAS`, the radio-host addresses, `SENTINEL_RUNTIME_USER_ID`/`_GROUP_ID` for Linux hosts) are documented in `.env.example`.

`docker compose up` also starts `nats`, the event-bus broker. It carries low-rate control events (settings changes, decode events, radio hub requests) between Sentinel's services, so it is required. If the broker is down, every service starts anyway and connects when it comes up.

It also starts `gateway` — [Caddy](https://caddyserver.com), the one address browsers use. **It is what publishes :8080**; the app itself is internal-only (`app:8000` on the compose network). The gateway's static config (`gateway/caddy.json`) refuses `/internal/`, sends everything else to the app, and turns an unreachable service into a JSON 503; the app pushes each registered service's path prefixes into it at runtime, so a section moved into its own container is routed there just by registering. The gateway also serves a TLS **service entrypoint** on :8443 for Sentinel processes on another host (a [radio host](radio-host.md)); it is published on 127.0.0.1 only unless `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` opens it.

## Example .env files

`.env` sits in the folder you installed Sentinel in, next to `docker-compose.yml`. Every line is optional: an empty `.env` (or none) runs Sentinel with working defaults. `.env.example` lists and explains every variable. After changing `.env`, run `docker compose up -d` so the affected containers restart with it.

**Everything on one computer, recordings in your home folder, decoders always on:**

```bash
# Start every decoder with a plain `docker compose up`.
COMPOSE_PROFILES=all

# Save SDR recordings to a folder on this computer instead of a Docker volume.
SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings

# Linux only: run as your own user so the recording files are yours (id -u / id -g).
SENTINEL_RUNTIME_USER_ID=1000
SENTINEL_RUNTIME_GROUP_ID=1000
```

**An AISStream key set by the installer rather than in Settings** (Settings takes precedence once a key is saved there):

```bash
AISSTREAM_API_KEY=<your-aisstream-key>
```

**The main computer, when the radios run on a second machine** ([Run the radios on a second machine](radio-host.md) has the full steps):

```bash
# Names and addresses the radio host will use to reach this computer.
SENTINEL_CORE_HOSTNAMES=sentinel.lan,192.168.1.10
# Issue a certificate for the radio host's own gateway.
SENTINEL_RADIO_HOST_HOSTNAMES=radio.lan
# Let the radio host reach the service entrypoint and the event bus over the LAN.
SENTINEL_SERVICE_ENTRYPOINT_ADDRESS=0.0.0.0:8443
NATS_PUBLISHED_ADDRESS=0.0.0.0:4222
# The radio hub runs on the radio host, so don't start one here.
SENTINEL_RADIO_REPLICAS=0
```

Never commit `.env`: it is listed in `.gitignore` because it can hold keys.
