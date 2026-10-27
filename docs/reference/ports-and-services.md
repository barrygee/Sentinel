# Ports and services

Every container, its job, ports and data. Containers are named `sentinel-<service>` (`docker logs sentinel-sea`).

## Always running

| Service | Job | Data |
|---|---|---|
| `service-credentials` | Runs once: certificates and a login per service and decoder | `service_credentials` |
| `nats` | Event bus, TLS only | — |
| `redis` | The [request guard](../security-guard.md)'s shared bans and rate limits; nothing kept on restart | — |
| `app` | Core: the UI, settings, alerts, offline maps, service list | `sentinel_db` |
| `gateway` | Caddy: the one address a browser uses | — |
| `air`, `space`, `sea`, `land` | Each section | `<id>_data` |
| `sdr` | Frequencies, groups, ranges, recordings | `sdr_data`, `sdr_recordings` |
| `radio` | Radio hub: radios, spectrum, audio, decoding, IQ capture | `radio_data` |
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

## Ports on your computer

| Port | Service | Open to your network |
|---|---|---|
| `8080` | gateway (browsers) | Yes |
| `8443` | gateway TLS entrypoint (radio host) | Only with `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` |
| `4222` | nats (radio host) | Only with `NATS_PUBLISHED_ADDRESS` |
| `8090` | adsb-decoder | Only with `SENTINEL_ADSB_DECODER_ADDRESS` |

## Inside Docker only

| Port | Where | What |
|---|---|---|
| `8000` | app, sections, radio, docs | HTTP API |
| `2019` | gateway | Caddy admin API (core pushes routes); only on the internal `gateway_admin` network |
| `6379` | redis | Request guard state; only on the internal `guard_state` network, which decoders don't join |
| `7355`, `7356` UDP | radio | Voice decoder audio out, decoded voice back |
| `7357` | radio | APRS decoder audio |
| `7358` | radio | AIS decoder stereo audio |
| `7370` | radio | Stub decoder audio |

Sentinel's Docker network is pinned to `172.28.0.0/24` (`SENTINEL_NETWORK_SUBNET`). The gateway is always `172.28.0.2` (`SENTINEL_GATEWAY_ADDRESS`), the one address the [request guard](../security-guard.md) believes about who a client is. Containers get addresses from `172.28.0.128/25`. If the range clashes with a network of yours, change all three together, plus `SENTINEL_NETWORK_HOST_ADDRESS`.

## On a radio host

`compose.radio-host.yaml`: `credentials-import` (runs once), `radio`, `radio-host-gateway` (:8443), and the voice, APRS, AIS and stub decoders.
