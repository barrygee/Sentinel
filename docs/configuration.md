# Environment variables (.env)

`.env` holds how Sentinel runs on this computer: what starts, where files go, and a second computer. Everything else is in [Settings](use/settings.md). You don't need one: every variable has a default.

- `cp .env.example .env` gives you every variable set to its default, with a comment on each; change only what differs. The three radio-host URLs stay commented out.
- After a change: `docker compose up -d` (restarts only what the change affects).
- Never commit it.

## Choose your setup

The top of `.env.example` lists five recipes for SDR Manager. Set one, then `docker compose up -d`:

| # | Setup | `.env` |
|---|---|---|
| 1 | Sentinel, managing dongles on other computers only | nothing |
| 2 | Linux: Sentinel + this computer's dongles | `COMPOSE_PROFILES=sdr-manager-local` |
| 3 | Linux or Pi: SDR Manager only | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml`, `COMPOSE_PROFILES=sdr-manager-local` |
| 4 | Mac: Sentinel + this Mac's dongles | `SDR_MANAGER_LOCAL_NATIVE=1`, then `uv run --project backend sdr-manager-local install` once |
| 5 | Mac: SDR Manager only | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml`, `SDR_MANAGER_LOCAL_NATIVE=1`, then `install` once |

Guides: [Mac](sdr-manager-mac.md), [Linux and Pi](sdr-manager-linux.md), [SDR Manager only](sdr-manager-local-only.md). After changing `COMPOSE_FILE`, run `docker compose up -d --remove-orphans`.

## What starts

| Variable | Default | Set it to |
|---|---|---|
| `COMPOSE_FILE` | `docker-compose.yml` | `compose.sdr-manager-local-only.yaml` for [SDR Manager only](sdr-manager-local-only.md) |
| `COMPOSE_PROFILES` | none | Decoders to start every time: `all`, or a list such as `aprs,ais`; add `sdr-manager-local` for this computer's dongles (Linux) |
| `SDR_MANAGER_LOCAL_NATIVE` | `0` | `1` on a Mac, to manage its dongles with the `sdr-manager-local` command |
| `SENTINEL_RADIO_REPLICAS` | `1` | `0` when the radio hub runs on [a second computer](radio-host.md) |
| `SENTINEL_DOCS_REPLICAS` | `1` | `0` to run without the in-app docs |

## Where files go

| Variable | Default | Set it to |
|---|---|---|
| `SENTINEL_RECORDINGS_DIRECTORY` | `sdr_recordings` volume | A folder for recordings, such as `~/SentinelRecordings` |
| `SENTINEL_RUNTIME_USER_ID` / `_GROUP_ID` | `1000` / `1000` | Your ids on Linux (`id -u`, `id -g`) if they aren't 1000 |

## Data sources

| Variable | Default | Set it to |
|---|---|---|
| `AISSTREAM_API_KEY` | empty | Your AISStream key, instead of typing it in Settings (Settings wins) |
| `ADSB_OFFGRID_URL` | the `adsb-decoder` container | An ADS-B decoder elsewhere: `http://<host>:8090/data/aircraft.json` |
| `OFFLINE_BASEMAP_SOURCE_URL` | newest Protomaps build | A fixed or self-hosted basemap archive |
| `OFFLINE_TERRAIN_SOURCE_URL` | Mapterhorn | Another Terrarium-format terrain archive |

## ADS-B decoder

| Variable | Default | Set it to |
|---|---|---|
| `SENTINEL_ADSB_SDR_MANAGER_API` | empty (no check) | Your SDR host, `http://<sdr-manager-host>:8000`, to log what the dongle is tuned to |
| `SENTINEL_ADSB_DECODER_ADDRESS` | `127.0.0.1:8090` | `0.0.0.0:8090` to let another computer read it (no password) |
| `SENTINEL_ADSB_RTL_TCP_HOST` / `_PORT` | empty / `2345` | A fixed dongle, before one is picked in Settings |
| `SENTINEL_GATEWAY_URL` | `http://gateway:8080` | `http://<sentinel-host>:8080` for a decoder outside this Docker |

## SDR Manager

`SDR_MANAGER_LOCAL_*` set how this computer's SDR Manager runs; every one is in `.env.example` with its default and a comment. The ones you might change:

| Variable | Default | Set it to |
|---|---|---|
| `SDR_MANAGER_LOCAL_HTTP_PORT` | `8000` | Another port, if 8000 is taken (other Sentinels then add this computer on it) |
| `SDR_MANAGER_LOCAL_ADVERTISED_HOST` | the address it was asked on | A fixed name or IP for other programs to stream from |
| `SDR_MANAGER_LOCAL_MAX_DEVICES` | `8` | The most dongles it runs, up to 64 |
| `SDR_MANAGER_LOCAL_RESERVED_PORTS` | none | Ports never given to a dongle, such as `5000,5002` |
| `SDR_MANAGER_LOCAL_LIBRTLSDR_PATH` | Homebrew's | Another librtlsdr on a Mac |
| `SDR_MANAGER_LOCAL_HOTSPOT_*` | hotspot off | Linux hotspot details (network, interface, confirm time) |

`SDR_MANAGER_REMOTE_*` tune how often SDR hosts are checked and how long a call may take; the defaults suit a home network. After a change: `docker compose up -d` (on a Mac, also `uv run --project backend sdr-manager-local install`).

## A second computer

`SENTINEL_CORE_HOSTNAMES`, `SENTINEL_RADIO_HOST_HOSTNAMES`, `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS`, `NATS_PUBLISHED_ADDRESS`, and on the radio host `SENTINEL_CORE_ENTRYPOINT_URL`, `SENTINEL_CORE_NATS_URL`, `SENTINEL_RADIO_HOST_URL`, `SENTINEL_RADIO_HOST_GATEWAY_ADDRESS`. Values and where each goes: [Radio host](radio-host.md).

## Request guard

What each check does, and how to switch on the optional ones: [Request guard](security-guard.md).

| Variable | Default | Set it to |
|---|---|---|
| `GUARD_ENABLED` | `true` | `false` to accept every request (not advised) |
| `GUARD_PASSIVE_MODE` | `false` | `true` to log what would be refused without refusing |
| `GUARD_ACCESS_ENFORCEMENT` | `enforce` | `log` to log, not refuse, callers outside a route's caller classes |
| `GUARD_CLIENT_NETWORKS` | private ranges | Where browsers may use Sentinel from |
| `GUARD_SERVICE_HOSTS` | empty | A radio host's IP (core host), or the core host's (radio host) |
| `GUARD_DECODER_HOSTS` | empty | Decoders on other machines, by IP |
| `GUARD_PEER_NETWORKS` | client networks | Other machines' SDR Managers |
| `GUARD_OPERATOR_IPS` | this machine | Who may open `/api/docs` (Docker Desktop: add `192.168.65.1`) |
| `GUARD_EXEMPT_IPS` | Sentinel's containers | Addresses that skip rate limits |
| `GUARD_IP_ALLOWLIST` / `_BLOCKLIST` | empty | Addresses always let in / always refused |
| `GUARD_ALLOWED_REFERRER_DOMAINS` | empty | The names you open Sentinel by, to require them on settings changes |
| `GUARD_ENFORCE_HTTPS`, `GUARD_TRUST_FORWARDED_PROTO` | `false` | `true` only behind your own TLS front end |
| `GUARD_CORS_ALLOW_ORIGINS` | empty | Origins allowed to call the API from another site |
| `GUARD_IPINFO_TOKEN`, `GUARD_BLOCKED_COUNTRIES`, `GUARD_ALLOWED_COUNTRIES` | empty | Country rules (token from ipinfo.io) |
| `GUARD_BLOCK_CLOUD_PROVIDERS` | empty | `AWS,GCP,Azure,DigitalOcean,Linode,Vultr` (any of) |
| `GUARD_EMERGENCY_MODE`, `GUARD_EMERGENCY_ALLOWLIST` | `false`, empty | Lockdown to the allowlist |
| `GUARD_LOG_FORMAT` | `text` | `json` |
| `GUARD_AGENT_API_KEY`, `GUARD_AGENT_PROJECT_ID`, `GUARD_AGENT_ENDPOINT`, `GUARD_ENABLE_DYNAMIC_RULES` | empty / `false` | The hosted Guard Core dashboard (sends events off this machine) |
| `GUARD_ENABLE_OTEL`, `GUARD_OTEL_ENDPOINT`, `GUARD_ENABLE_LOGFIRE` | `false` / empty | Telemetry |
| `SENTINEL_NETWORK_SUBNET`, `SENTINEL_NETWORK_HOST_ADDRESS`, `SENTINEL_GATEWAY_ADDRESS`, `SENTINEL_NETWORK_DYNAMIC_RANGE` | `172.28.0.0/24`, `.1`, `.2`, `.128/25` | Another range, only if this one clashes with a network of yours |

On a radio host, `GUARD_EXTRA_TRUSTED_PROXIES` and `GUARD_TRUSTED_PROXY_DEPTH=2` let the hub see real browser addresses ([Radio hosts](security-guard.md#radio-hosts)).

## Leave alone

`NATS_URL` connects Sentinel's own containers. The gateway's admin API address is fixed in `docker-compose.yml` (`GATEWAY_ADMIN_URL` in `.env` is ignored).

## Anything else

Other backend settings (cache times, timeouts, ports; see `backend/config.py`) do nothing in `.env`. Set them on the service in `docker-compose.override.yml` (Compose reads it automatically; Git ignores it):

```yaml
services:
  air:
    environment:
      ADSB_TTL_MS: "5000"
```

Then `docker compose up -d`. Check with `docker compose config air`.

## Example

```bash
COMPOSE_PROFILES=all
SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings
SENTINEL_ADSB_SDR_MANAGER_API=http://192.168.1.20:8000
```
