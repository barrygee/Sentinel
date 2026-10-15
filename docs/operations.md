# Check logs, health and backups

Use this page to see whether Sentinel is healthy, read what it is doing, and keep a copy of your data. Every container and what it does is listed in [Ports and services](reference/ports-and-services.md). When something is wrong, go to [Troubleshooting](troubleshooting.md).

## Everyday commands

```bash
docker compose up -d                       # start, or apply a change (recreates only what changed)
docker compose up -d --build               # after an upgrade
docker compose up -d --scale land=0        # run without a section
docker compose ps                          # what is running, and whether it is healthy
docker compose logs -f app sea             # follow some services' logs
docker compose restart sea                 # restart one service; the others keep working
docker compose down                        # stop everything; data is kept
```

- **Leaving a section out every time.** Pass the same `--scale` on every later `up`, or compose starts the section again.
- **After changing `.env`.** Run `docker compose up -d`. Compose restarts only the containers the change affects.

## Check health

```bash
docker compose ps
```

Every Sentinel service (`app`, `gateway`, `nats`, each section and `radio`) should say **(healthy)**. A service that says **(health: starting)** is still starting: sections wait for core, so give it a minute. Decoders don't report health; they say **Up**. `docker compose ps -a` also lists `service-credentials`, which runs once at start and then says **Exited (0)**. That is normal.

To check core from a script:

```bash
curl -s http://localhost:8080/health
```

It answers `{"status":"ok", …}`.

In the browser, a section that stops shows greyed out in the menu, and opening it shows a **section unavailable** page. The other sections keep working.

## Read the logs

```bash
docker compose logs -f sea                 # follow one service
docker compose logs --since 10m radio      # the last ten minutes
docker compose logs --tail 100 app         # the last hundred lines
docker logs sentinel-sea                   # the same, by container name
```

Decoders are in profiles, so name the profile too: `docker compose --profile all logs aprs-decoder`.

### A healthy start

Sections start before core and wait for it. Each service logs, in order:

```text
sea service startup: waiting for core to answer (…)              # only if it started first
sea service startup: connected to core at http://app:8000 after 4.2 s
event bus connected to NATS at tls://nats:4222
registration: sea registered with core at http://app:8000
```

Core logs `registry: section sea registered from http://sea:8000` for each section, and `registry: radio radio registered from …` for the radio hub. Decoders log `[aprs] connected to the radio hub through http://gateway:8080`; if the hub isn't up yet, they first log one `waiting for the radio hub through …; retrying quietly`.

`service-credentials` prints `created …` lines the first time, and `… is up to date` after that.

A full `docker compose down` then `docker compose up -d` logs no errors. If you see one, look it up in [Troubleshooting](troubleshooting.md#log-messages).

## What to back up

All your data is on Docker volumes. Compose puts the project folder's name in front of each one, so `sdr_data` is usually `sentinel_sdr_data` and `sentinel_db` is `sentinel_sentinel_db`. `docker volume ls` lists them.

| Volume | Holds | Back it up? |
|---|---|---|
| `sentinel_db` | Every setting, your alerts, downloaded offline maps | Yes |
| `sdr_data` | Saved frequencies, groups, scanning ranges, recordings' details | Yes |
| `sdr_recordings` | Recording files, unless you [save them to a folder](use/sdr/record.md#where-recordings-are-saved) | If you want the recordings |
| `radio_data` | Sentry hosts and their passwords | Yes |
| `land_data`, `air_data`, `sea_data`, `space_data` | Caches and data downloaded again when online | Only for working off grid |
| `service_credentials` | Certificates and logins | No: Sentinel creates new ones. Back it up only if a radio host uses it. |

Backups of `radio_data` and `service_credentials` hold passwords and keys: store them as you would a password.

For **settings alone**, **Settings › App Settings › Export All Configuration** downloads them as one file, and the [config file](use/config-file.md) is a live copy.

## Back up a volume

The commands use the small `alpine` image, which Docker downloads the first time. If you may need to back up with no internet, download it now: `docker pull alpine`.

Stop Sentinel first, so every database is closed and complete, then archive the volume into the current folder:

```bash
docker compose down
docker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/sdr_data.tgz -C /data .
docker compose up -d
```

Repeat the middle command for each volume you want, changing both names.

## Restore a volume

With Sentinel stopped, extract the archive into the volume. The volume should be empty or new:

```bash
docker compose down
docker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine \
  tar xzf /backup/sdr_data.tgz -C /data
docker compose up -d
```
