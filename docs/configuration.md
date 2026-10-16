# Environment variables (.env)

`.env` holds how Sentinel runs on this computer: what starts, where files go, and a second computer. Everything else is in [Settings](use/settings.md). You don't need one: every variable has a default.

- `cp .env.example .env` gives you every variable, commented out.
- After a change: `docker compose up -d` (restarts only what the change affects).
- Never commit it.

## What starts

| Variable | Default | Set it to |
|---|---|---|
| `COMPOSE_PROFILES` | none | Decoders to start every time: `all`, or a list such as `aprs,ais` |
| `SENTINEL_RADIO_REPLICAS` | `1` | `0` when the radio hub runs on [a second computer](radio-host.md) |

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
| `SENTINEL_ADSB_SENTRY_API` | empty (no check) | Your Sentry host, `http://<sentry-host>:8000`, to log what the dongle is tuned to |
| `SENTINEL_ADSB_DECODER_ADDRESS` | `127.0.0.1:8090` | `0.0.0.0:8090` to let another computer read it (no password) |
| `SENTINEL_ADSB_RTL_TCP_HOST` / `_PORT` | empty / `2345` | A fixed dongle, before one is picked in Settings |
| `SENTINEL_GATEWAY_URL` | `http://gateway:8080` | `http://<sentinel-host>:8080` for a decoder outside this Docker |

## A second computer

`SENTINEL_CORE_HOSTNAMES`, `SENTINEL_RADIO_HOST_HOSTNAMES`, `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS`, `NATS_PUBLISHED_ADDRESS`, and on the radio host `SENTINEL_CORE_ENTRYPOINT_URL`, `SENTINEL_CORE_NATS_URL`, `SENTINEL_RADIO_HOST_URL`, `SENTINEL_RADIO_HOST_GATEWAY_ADDRESS`. Values and where each goes: [Radio host](radio-host.md).

## Leave alone

`NATS_URL` and `GATEWAY_ADMIN_URL` connect Sentinel's own containers.

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
SENTINEL_ADSB_SENTRY_API=http://192.168.1.20:8000
```
