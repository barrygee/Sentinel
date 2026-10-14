# Operating Sentinel

How a Docker Compose deployment fits together, what a healthy start looks like
in the logs, and what to check when something is missing. For installing and
first run, see the [README](../README.md). For putting the radio hub on a
second machine, see [radio-host.md](radio-host.md). For why it's built this
way, see [ADR 0006](adr/0006-section-containers.md).

## What runs

A bare `docker compose up -d` starts all of these:

| Service | What it is | Its data |
|---|---|---|
| `service-credentials` | One-shot: the deployment CA, TLS certificates and every service's and decoder's credentials. Exits when done. | `service_credentials` volume |
| `nats` | Event bus (TLS only, one user per service) | — |
| `app` | Core: the shell UI, settings + `sentinel_config.json`, notifications, offline maps, the service registry | `sentinel_db` (`sentinel.db`, offline map regions) |
| `gateway` | Caddy: publishes **:8080** for browsers and the TLS service entrypoint on 127.0.0.1:8443 | — |
| `space` `land` `air` `sea` `sdr` | One service per section | `<id>_data` (`<id>.db`; SDR also `recordings/`) |
| `radio` | Everything that touches a radio: rtl_tcp/Sentry, the spectrum WebSockets, decode bridges, IQ capture | `radio_data` (Sentry hosts) |

The decoders (`voice-decoder`, `aprs-decoder`, `ais-decoder`, `adsb-decoder`)
are opt-in compose profiles. See [decoders.md](decoders.md).

Every section and the hub run as their own services. The app never hosts one
itself under compose.

## Everyday commands

```bash
docker compose up -d                       # start or apply changes (recreates only what changed)
docker compose up -d --build               # after a dependency change (pyproject.toml / package.json)
docker compose up -d --scale land=0        # run without a section; the shell just doesn't show it
docker compose ps                          # every backend container should say (healthy)
docker compose logs -f app sea             # follow some services
docker compose restart sea                 # restart one service; the others keep working
```

- **Leaving a section out persistently.** Pass the same `--scale` on later `up`
  commands too, or compose starts it again. To leave out the radio hub because
  it runs on a radio host, set `SENTINEL_RADIO_REPLICAS=0` in `.env`
  instead.
- **After `git pull`.** Backend code is volume-mounted and runs under
  `uvicorn --reload`, but a pull doesn't always trigger a reload, so run
  `docker compose restart` to be sure. A reload followed by a restart shows two
  startups in the log, which is expected. Frontend changes arrive through the
  committed `frontend/spa-dist/`; a hard browser refresh picks them up.
- **Rebuilding only the decoders.** Use `docker compose up -d --build --no-deps
  <decoder>…`. Without `--no-deps`, `--build` also rebuilds the app image
  through the decoders' dependency chain. That recreates the app, causing a few
  seconds of 500s and `ConnectError` tracebacks from sections that needed core
  at that moment.
- **Upgrading from a single-container install.** Nothing to do by hand. Each
  service copies its tables out of `sentinel.db` on its first boot (SDR also
  copies its recordings' WAV and IQ files). The originals stay in `sentinel_db`
  untouched. Data created afterwards lives only in the service's own volume.

## A healthy start

Sections start before core and wait for it. In order, each service logs:

```text
<id> service startup: waiting for core to answer (…)              # only if it started first
<id> service startup: connected to core at http://app:8000 after 4.2 s
legacy import: copied 812 rows into tle_cache                     # first boot only
legacy import: no monolith database at '…'; nothing to import     # …or this on a fresh install
event bus connected to NATS at tls://nats:4222
registration: <id> registered with core at http://app:8000
```

The app logs `registry: section <id> registered from http://<id>:8000` for each
section and `registry: radio radio registered from …` for the hub.
Decoders log `[<kind>] connected to the radio hub through http://gateway:8080`.
If the hub isn't up yet, they log one
`waiting for the radio hub through … ; retrying quietly` first.

`service-credentials` prints `created …` lines on the first run, and
`… is up to date` after that. A full `docker compose down && docker compose up
-d` should log no errors.

## When a section or the hub is missing

| What you see | Meaning | Check |
|---|---|---|
| Nav entry greyed, "section unavailable" page | The service registered but failed 3 health probes in a row (every 10 s) | `docker compose ps`, then that service's logs |
| Its API paths answer `503 {"detail": "<id> is unavailable"}` | Same: the gateway stops dialling an unavailable service | as above |
| No nav entry at all, and its API paths return the SPA's `index.html` (200, text/html) | The service never registered (not started, or scaled to 0) | `docker compose ps -a`; a JSON 503 would mean it registered and then stopped |
| SDR audio and waterfall stop, but frequencies and recordings still work | `radio` is down (frequencies and recordings belong to `sdr`) | `docker compose logs radio` |
| A section restarted but data looks old | Expected after a rollback: data made while it ran as a service is only in `<id>_data` | — |

## Internal credentials and the bus

Services authenticate to core's (and the hub's) `/internal/` routes with
their own credential. Decoders authenticate to the hub's decode endpoints with
theirs. The responses tell you which part failed:

| Status | Detail | Cause |
|---|---|---|
| 503 | `Internal service access is disabled on this deployment` | The process has no `accepted-callers.json`: not running under compose, or `service-credentials` didn't run |
| 401 | `Invalid service credential` / `invalid decode secret` | The token isn't one the verifier knows: credentials were regenerated but the caller wasn't restarted, or a radio host has a stale bundle |
| 403 | `This service may not do that` / `not a <kind> decoder` | A known caller outside its row in `backend/platform/service_access.py` |

`/internal/` is never routed by the gateway (JSON 404 on :8080). That is by
design, not a fault.

- **Adding a service or decoder kind.** Give it a row in
  `backend/platform/service_access.py` and a compose mount of its
  `credentials/<caller>/` folder on `service_credentials`, or it can't
  authenticate.
- **Adding a bus subject.** Add it to `backend/platform/nats_permissions.py`,
  then `docker compose up -d` (which rewrites `nats.conf`) and
  `docker compose restart nats`. The broker reads its config only at start.
  Until then the publisher logs a NATS **permissions violation**, and the event
  stays inside its own process.
- **Rotating a credential.** Delete its `credentials/<caller>/` folder on the
  volume and run `docker compose up -d`. If a radio host is involved,
  re-export its bundle ([radio-host.md](radio-host.md)).

## Building images for other architectures

`docker-bake.hcl` builds the backend image (core, every section service and the radio hub run from it) for `linux/amd64` and `linux/arm64` at once — e.g. for a Raspberry Pi radio host built from an x86 workstation. It needs `docker buildx` (bundled with Docker Desktop) and, on Linux, QEMU binfmt for the other architecture (`docker run --privileged --rm tonistiigi/binfmt --install all`).

```bash
docker buildx bake --print                                         # show the build plan
IMAGE_REPOSITORY=registry.lan:5000/sentinel docker buildx bake --push   # both platforms → a registry
docker buildx bake --set '*.platform=linux/arm64' --load           # one platform → the local image store
docker buildx bake decoders --set '*.platform=linux/arm64' --load  # decoder images, LOCAL ONLY
```

A two-platform build can't be loaded into the classic local image store, so either push it or pick one platform with `--load`. Variables: `IMAGE_REPOSITORY` (default `sentinel`), `IMAGE_TAG` (default `latest`), `IMAGE_PLATFORMS` (default `linux/amd64,linux/arm64`). The `decoders` group is opt-in and must **never be pushed to a public registry** — the voice decoder compiles `mbelib` (see [decoder/README.md](../decoder/README.md)). Decoder upstreams are pinned to commits in their Dockerfiles (`MBELIB_COMMIT`, `DSDFME_COMMIT`, `READSB_COMMIT`), and the Direwolf source tarball to its SHA-256; each Dockerfile says how to move its pin. CI builds the backend for both platforms on every PR (no push).

## Linux hosts

App and service containers drop root and run as `SENTINEL_RUNTIME_USER_ID` /
`SENTINEL_RUNTIME_GROUP_ID` (default 1000:1000). The entrypoint hands the data
volumes to that user on start. On a Linux host whose checkout isn't owned by
uid 1000, set both in `.env` to `id -u` / `id -g`. Otherwise the app can't write
`backend/data/sentinel_config.json` through the bind mount.

`docker compose exec` still enters as root, because only PID 1 drops. To see the
server's user, read `/proc/1/status`.

## Radios and decoders

- **IQ recordings.** The hub writes the raw IQ, and when a recording stops,
  the `sdr` service copies the file over in the background. The recording shows
  "COPYING IQ…" until the copy lands. If the hub is unreachable, `sdr` logs
  `IQ captures: radio hub unreachable, pending copies wait for it`, retries
  every 60 s, and logs `IQ captures: radio hub reachable again`. If the hub no
  longer has the file, you'll see
  `Radio hub no longer holds the IQ of recording N; it is lost`.
- **Recordings that are never stopped.** A recording ends only when the browser
  sends stop. If the tab is closed or reloaded mid-recording, nothing would end
  it. Once a recording is older than **Settings › SDR › Max Recording Length**
  (`sdr.recordingMaxDurationMinutes`, default 360 minutes), `sdr` marks it
  failed and deletes its raw IQ, logging
  `Recording N was never stopped (started …); marked it failed and dropped its IQ capture`.
  The hub also stops any IQ capture that reaches that limit
  (`IQ capture N reached the … s recording limit without a stop; stopped it`),
  so a lost stop can't fill the disk: raw IQ grows about 4 MB/s at 2.048 MS/s.
  Raise the limit if you record for longer.
- **Off Grid ADS-B: "no ADS-B source configured"** in the `adsb-decoder` log.
  Either no dongle is chosen in Settings › AIR › Off Grid ADS-B SDR, or the
  chosen device id no longer appears in the Sentry host's SDR list (unplugged,
  or its id changed). If it's streaming but 0 messages are accepted, the cause
  is RF (antenna, gain at 1090 MHz), not software.
- **Sentry hosts and the console password.** In the hub log, a
  `GET …/api/status 401` followed by a successful login and then 200s is the
  normal first poll. A 401 on the login itself means the console password for
  that Sentry host is wrong.
- **APRS hears nothing.** The radio is probably parked off the APRS channel
  (for example a satellite auto-tune moved it). `GET /api/sdr/aprs/status`
  shows `on_channel`.
- **Recurring "USB buffer" errors on the dongle host.** These come from the
  Linux USB memory limit. As root on that host:
  `echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb`.
- **AISStream allows one connection per key.** Only one Sentinel may use a key
  at a time, and the Sea service reconnects slowly on purpose, because a
  reconnect storm locks the key out.
