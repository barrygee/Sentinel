# Ports and services

Every container, its job, ports and data. Containers are named `sentinel-<service>` (`docker logs sentinel-sea`).

## Always running

| Service | Job | Data |
|---|---|---|
| `service-credentials` | Runs once: certificates and a login per service and decoder | `service_credentials` |
| `nats` | Event bus, TLS only | — |
| `app` | Core: the UI, settings, alerts, offline maps, service list | `sentinel_db` |
| `gateway` | Caddy: the one address a browser uses | — |
| `air`, `space`, `sea`, `land` | Each section | `<id>_data` |
| `sdr` | Frequencies, groups, ranges, recordings | `sdr_data`, `sdr_recordings` |
| `radio` | Radio hub: radios, spectrum, audio, decoding, IQ capture | `radio_data` |
| `sdr-manager-remote` | SDR Manager: SDR hosts on other computers | `sdr_manager_remote_data` |
| `docs` | The in-app docs (optional) | — |

## Decoders (profiles)

| Profile | Service | Decodes |
|---|---|---|
| `voice-decoder` | `voice-decoder` | Digital voice (dsd-fme) |
| `aprs` | `aprs-decoder` | APRS (Direwolf) |
| `ais` | `ais-decoder` | AIS (Direwolf 1.8) |
| `adsb` | `adsb-decoder` | ADS-B (readsb) |
| `decoder-stub` | `stub-decoder` | Nothing: a test double |

`--profile all` starts the first four.

## SDR Manager for this computer

| Profile | Service | Job | Data |
|---|---|---|---|
| `sdr-manager-local` | `sdr-manager-local` | This computer's dongles (Linux). Its own image; root, privileged, host network | `sdr_manager_local_data` |

On a Mac it is the `sdr-manager-local` command instead, not a container ([Mac](../sdr-manager-mac.md)). `compose.sdr-manager-local-only.yaml` ([SDR Manager only](../sdr-manager-local-only.md)) runs just `service-credentials`, `app`, `gateway` and `sdr-manager-local`.

## Ports on your computer

| Port | Service | Open to your network |
|---|---|---|
| `8080` | gateway (browsers) | Yes |
| `8443` | gateway TLS entrypoint (radio host) | Only with `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` |
| `4222` | nats (radio host) | Only with `NATS_PUBLISHED_ADDRESS` |
| `8090` | adsb-decoder | Only with `SENTINEL_ADSB_DECODER_ADDRESS` |
| `8000` | sdr-manager-local (SDR Manager API, for this and other Sentinels) | Yes (`SDR_MANAGER_LOCAL_HTTP_PORT`) |
| Each dongle's output port and the one two above it (such as `1234`, `1236`) | sdr-manager-local (`rtl_tcp`, tuning) | Yes |
| `14000`–`14007` | sdr-manager-local's internal `rtl_tcp` | No (`127.0.0.1`) |

## Inside Docker only

| Port | Where | What |
|---|---|---|
| `8000` | app, sections, radio, docs | HTTP API |
| `2019` | gateway | Caddy admin API (core pushes routes); only on the internal `gateway_admin` network |
| `7355`, `7356` UDP | radio | Voice decoder audio out, decoded voice back |
| `7357` | radio | APRS decoder audio |
| `7358` | radio | AIS decoder stereo audio |
| `7370` | radio | Stub decoder audio |

## On a radio host

`compose.radio-host.yaml`: `credentials-import` (runs once), `radio`, `radio-host-gateway` (:8443), and the voice, APRS, AIS and stub decoders.
