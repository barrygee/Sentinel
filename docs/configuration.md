# Environment variables (.env)

`.env` holds the settings about **how Sentinel runs on this computer**: which optional containers start, where files are saved, and how a second computer connects. Everything you change while using Sentinel (your location, radios, map look) is in Settings and the [config file](use/config-file.md) instead.

You don't need a `.env` at all: every variable has a working default.

## How it works

- `.env` sits in the folder you installed Sentinel in, next to `docker-compose.yml`. `cp .env.example .env` gives you one with every variable listed and commented out.
- Docker Compose reads it when you run a `docker compose` command, and passes the variables below to the containers that need them.
- After changing it, run `docker compose up -d`. Compose restarts only the containers the change affects.
- **Never commit it.** It can hold keys, so it is listed in `.gitignore`.

[`.env.example`](../.env.example) is the full list, with a comment on each variable. This page groups them by what you'd want to do.

## Choose what starts

| Variable | Default | Set it when |
|---|---|---|
| `COMPOSE_PROFILES` | none | You want decoders to start with a plain `docker compose up`. `all` for every decoder, or a list such as `aprs,ais`. It applies to every compose command, including `down` and `logs`. See [Install and run decoders](decoders.md). |
| `SENTINEL_RADIO_REPLICAS` | `1` | The radio hub runs on [a second computer](radio-host.md). Set it to `0` so this one doesn't start its own. |

To leave out a section instead, see [Quick start](install.md#start-some-sections).

## Choose where files go

| Variable | Default | Set it when |
|---|---|---|
| `SENTINEL_RECORDINGS_DIRECTORY` | the `sdr_recordings` Docker volume | You want SDR recordings in a folder on this computer, such as `~/SentinelRecordings`, to open them in other software or back them up. Then run `docker compose up -d sdr`. See [Record what you hear](use/sdr/record.md#where-recordings-are-saved). |
| `SENTINEL_RUNTIME_USER_ID` / `SENTINEL_RUNTIME_GROUP_ID` | `1000` / `1000` | You're on Linux and your user isn't 1000 (check with `id -u` and `id -g`). Sentinel's containers run as this user, so set them to your own ids, or Sentinel can't save the config file and your recordings belong to someone else. |

## Data sources

| Variable | Default | Set it when |
|---|---|---|
| `AISSTREAM_API_KEY` | empty | You'd rather install the AISStream key than type it into **Settings › SEA › AIS Data API Key**. A key saved in Settings wins. See [Sea](use/sea.md#add-your-aisstream-key). |
| `ADSB_OFFGRID_URL` | the `adsb-decoder` container | The ADS-B decoder runs somewhere other than this computer's Docker, for example `http://<decoder-host>:8090/data/aircraft.json`. |

## The ADS-B decoder

These only matter when the `adsb` profile runs.

| Variable | Default | Set it when |
|---|---|---|
| `SENTINEL_ADSB_DECODER_ADDRESS` | `127.0.0.1:8090` | Another computer reads the decoded aircraft. `0.0.0.0:8090` opens it to your network. It has no password, so only do this on a network you trust. |
| `SENTINEL_ADSB_RTL_TCP_HOST` / `SENTINEL_ADSB_RTL_TCP_PORT` | empty / `2345` | You run the decoder before choosing a dongle in **Settings › AIR › Off Grid ADS-B SDR**. Normally the decoder asks Sentinel which dongle to use. |
| `SENTINEL_ADSB_SENTRY_API` | a fixed example address | Set it to your Sentry host, such as `http://<sentry-host>:8000`. At start, the decoder asks it what the dongle is tuned to and logs the answer, so a dongle on the wrong frequency shows in the log instead of as an empty map. |

## Decoders outside Docker

| Variable | Default | Set it when |
|---|---|---|
| `SENTINEL_GATEWAY_URL` | `http://gateway:8080` | A decoder runs outside this computer's Docker network: set it to `http://<sentinel-host>:8080`. Decoders reach the radio hub through the gateway, so they find it wherever it runs. |

## A second computer

These are only for running the radio hub on [a second computer](radio-host.md). That page says which to set on which computer, with the values.

| Variable | What it does |
|---|---|
| `SENTINEL_CORE_HOSTNAMES` | The names or addresses the radio host reaches the main computer by. Sentinel's certificates cover them. |
| `SENTINEL_RADIO_HOST_HOSTNAMES` | The name the main computer reaches the radio host by. Sentinel issues the radio host's certificate for it. |
| `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` | Where the TLS service entrypoint is published. Default `127.0.0.1:8443`, this computer only. |
| `NATS_PUBLISHED_ADDRESS` | Where the event bus is published. Default `127.0.0.1:4222`, this computer only. |
| `SENTINEL_CORE_ENTRYPOINT_URL`, `SENTINEL_CORE_NATS_URL`, `SENTINEL_RADIO_HOST_URL`, `SENTINEL_RADIO_HOST_GATEWAY_ADDRESS` | Set on the radio host: where it reaches the main computer, and where the main computer reaches it. |

## Leave these alone

`NATS_URL` (the event bus) and `GATEWAY_ADMIN_URL` (the gateway's admin API) connect Sentinel's own containers. Compose sets them; changing them breaks the connection between services.

## Everything else

Sentinel has more settings with built-in defaults (developers: `backend/config.py`): cache times, the addresses of the online sources (adsb.lol, CelesTrak, ukrepeater.net, Protomaps), timeouts and decoder ports. You rarely need them.

Compose passes only the variables on this page from `.env` to the containers, so putting one of these in `.env` does nothing. To change one, put it in a **compose override file**: a file called `docker-compose.override.yml` next to `docker-compose.yml`, which Compose reads automatically. Set the variable on the service that uses it, in upper case. For example, to keep ADS-B data fresh for 5 seconds instead of 10:

```yaml
services:
  air:
    environment:
      ADSB_TTL_MS: "5000"
```

Then run `docker compose up -d`. Check what a service will receive with `docker compose config air`. The override file is yours, so keep it out of Git.

## Example .env files

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

**An AISStream key set when installing, rather than in Settings:**

```bash
AISSTREAM_API_KEY=<your-aisstream-key>
```
