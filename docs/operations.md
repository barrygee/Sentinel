# Run and maintain

Everyday commands, health, logs and backups. Every container: [Ports and services](reference/ports-and-services.md).

## Commands

```bash
docker compose up -d                          # start, or apply a change
docker compose up -d --build                  # after an upgrade
docker compose up -d --scale land=0           # without a section (repeat on every up)
docker compose up -d --scale docs=0           # without the in-app docs
docker compose ps                             # what runs, and whether it is healthy
docker compose logs -f app sea                # follow logs
docker compose logs --since 10m radio         # recent logs
docker compose restart sea                    # restart one service
docker compose down                           # stop; data is kept
docker compose down -v                        # stop and DELETE every volume
```

Decoders are in profiles: `docker compose --profile all logs aprs-decoder`.

## Health

- `docker compose ps`: every Sentinel service says **(healthy)**. **(health: starting)** means it is waiting for core.
- Decoders say **Up**. `service-credentials` runs once and says **Exited (0)** (`ps -a`).
- `curl -s http://localhost:8080/health` answers `{"status":"ok", …}`.
- In the browser, a stopped section is greyed out; the rest keep working.

A healthy start, per section:

```text
sea service startup: waiting for core to answer (…)          # only if it started first
sea service startup: connected to core at http://app:8000 after 4.2 s
event bus connected to NATS at tls://nats:4222
registration: sea registered with core at http://app:8000
```

## What to back up

Volumes are named `<folder>_<volume>`, such as `sentinel_sdr_data`. List them with `docker volume ls`.

| Volume | Holds | Back up |
|---|---|---|
| `sentinel_db` | Settings, alerts, offline maps | Yes |
| `sdr_data` | Frequencies, groups, ranges, recording details | Yes |
| `sdr_recordings` | Recording files | If you want them |
| `radio_data` | Sentry hosts and passwords | Yes (store safely) |
| `air_data`, `sea_data`, `land_data`, `space_data` | Caches | Only for off grid |
| `service_credentials` | Certificates and logins | No: recreated |

For settings alone: **Settings › App Settings › Export All Configuration**.

## Back up or restore a volume

Stop Sentinel first. The commands use `alpine` (`docker pull alpine` now if you may be offline later).

```bash
docker compose down
docker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine tar czf /backup/sdr_data.tgz -C /data .   # back up
docker run --rm -v sentinel_sdr_data:/data -v "$PWD":/backup alpine tar xzf /backup/sdr_data.tgz -C /data     # restore into an empty volume
docker compose up -d
```

## Developer commands

```bash
docker compose up -d --build --no-deps sea    # rebuild one without restarting core
docker compose exec sea sh                    # a shell inside a service
docker compose config sea                     # what a service will receive
```
