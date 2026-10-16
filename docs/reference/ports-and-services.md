# Ports and services

Every container Sentinel runs: what it does, the ports it uses and where its data is kept. Container names are `sentinel-<service>`, so `docker logs sentinel-sea` shows Sea's log.

## Always running

A plain `docker compose up -d` starts these.

| Service | What it does | Data |
|---|---|---|
| `service-credentials` | Runs once and exits. Creates this installation's certificate authority, TLS certificates and a separate login for every service and decoder. | `service_credentials` |
| `nats` | The event bus: short messages between services. TLS only, one login per service. | — |
| `app` | Core: the shell UI, settings and the config file, alerts, offline maps, the list of running services. | `sentinel_db` (`sentinel.db`, downloaded map tiles) |
| `gateway` | Caddy, the one address a browser uses. Passes each request to the service that answers it. | — |
| `air` | The **AIR** section. | `air_data` (`air.db`) |
| `space` | The **SPACE** section. | `space_data` (`space.db`) |
| `sea` | The **SEA** section, and the one AISStream connection. | `sea_data` (`sea.db`) |
| `land` | The **LAND** section. | `land_data` (`land.db`) |
| `sdr` | The **SDR** section: saved frequencies, groups, scanning ranges, recordings. | `sdr_data` (`sdr.db`, older recordings); recordings in `sdr_recordings` or your own folder |
| `radio` | The radio hub: every connection to a radio, the spectrum and audio streams, decoding, raw IQ capture. | `radio_data` (`radio.db`: Sentry hosts) |

To leave one out, see [Quick start](../install.md#start-some-sections). What the browser shows when one is missing or stopped is in [Troubleshooting](../troubleshooting.md#a-section-is-missing-or-greyed-out).

## Optional: decoders

Each decoder is a [compose profile](glossary.md#developer-terms), started with `--profile <name>`, and needs its own dongle. `--profile all` starts the first four.

| Profile | Service | What it decodes | Built from |
|---|---|---|---|
| `voice-decoder` | `voice-decoder` | Digital voice (dsd-fme) | `decoder/` |
| `aprs` | `aprs-decoder` | APRS (Direwolf) | `decoder/aprs/` |
| `ais` | `ais-decoder` | AIS (Direwolf 1.8, built from source) | `decoder/ais/` |
| `adsb` | `adsb-decoder` | ADS-B (readsb) | `decoder/adsb/` |
| `decoder-stub` | `stub-decoder` | Nothing: a test double for developers | `decoder/stub/` |

Decoders keep no data of their own.

## Ports on your computer

| Port | Service | Used by | Open to your network? |
|---|---|---|---|
| `8080` | gateway | Your browser | Yes |
| `8443` | gateway (TLS service entrypoint) | Sentinel services on a second computer | No: `127.0.0.1` unless `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` is set |
| `4222` | nats | Sentinel services on a second computer | No: `127.0.0.1` unless `NATS_PUBLISHED_ADDRESS` is set |
| `8090` | adsb-decoder, when running | Reading the decoded aircraft directly | No: `127.0.0.1` unless `SENTINEL_ADSB_DECODER_ADDRESS` is set |

The variables are in [Environment variables](../configuration.md#a-second-computer). If one of these ports is already in use, that container won't start; `docker compose ps -a` shows it as exited.

## Ports inside Docker only

These are on the `sentinel` Docker network and can't be reached from your computer.

| Port | Where | What |
|---|---|---|
| `8000` | `app`, every section, `radio` | Each service's HTTP API |
| `2019` | `gateway` | Caddy's admin API, which core updates with each service's routes |
| `7355` | `radio` | Audio for the voice decoder |
| `7356` (UDP) | `radio` | Decoded voice coming back from the voice decoder |
| `7357` | `radio` | Audio for the APRS decoder |
| `7358` | `radio` | Two-channel audio for the AIS decoder |
| `7370` | `radio` | Audio for the stub decoder |

## On a radio host

`compose.radio-host.yaml` runs these on [a second computer](../radio-host.md):

| Service | What it does | Port |
|---|---|---|
| `credentials-import` | Runs once: unpacks the credentials exported from the main computer. | — |
| `radio` | The radio hub. | — |
| `radio-host-gateway` | Caddy: the main computer reaches the hub through it, over TLS. | `8443` (`SENTINEL_RADIO_HOST_GATEWAY_ADDRESS`) |
| `voice-decoder`, `aprs-decoder`, `ais-decoder`, `stub-decoder` | The decoders, as above. | — |

How the containers start and talk to each other is in [How Sentinel runs in Docker](../architecture/docker.md).
