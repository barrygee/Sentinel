# Troubleshooting

Start here when something isn't working. The first part covers Sentinel as a whole: starting it, sections, logins and log messages. The second part lists the problems on each section's page, by what you see.

First, check what is running:

```bash
docker compose ps -a
```

Every Sentinel service should say **(healthy)**. What healthy logs look like is in [Check logs, health and backups](operations.md#a-healthy-start).

## Sentinel won't start

| What you see | What to do |
|---|---|
| `docker: command not found`, or `Cannot connect to the Docker daemon` | Docker isn't installed or isn't running. Start Docker Desktop (or the Docker service on Linux). |
| `port is already allocated` for 8080 | Something else on this computer uses port 8080. Stop it: Sentinel's browser port can't be changed in `.env`. |
| `gateway` or `nats` exited, with an error about port 8443 or 4222 | Something else uses that port. Stop it, or move the port: see [Ports and services](reference/ports-and-services.md#ports-on-your-computer). |
| The first build fails while downloading | A download from GitHub or a package mirror failed. Run `docker compose up --build -d` again. |
| `http://localhost:8080` doesn't load, but `docker compose ps` looks healthy | Wait a minute after start-up and reload. If it still fails, check `docker compose logs gateway app`. |
| Sections stay at **(health: starting)** | They wait for core. Check `docker compose logs app` for an error. Each section logs `waiting for core to answer` until core is up. |
| On Linux: `Permission denied` writing `sentinel_config.json`, or recordings owned by another user | Set `SENTINEL_RUNTIME_USER_ID` and `SENTINEL_RUNTIME_GROUP_ID` to your own ids. See [Environment variables](configuration.md#choose-where-files-go). |

## A section is missing or greyed out

| What you see | Meaning | What to do |
|---|---|---|
| The section isn't in the menu at all | Its service isn't running, or was never started (for example, left out with `--scale`) | `docker compose ps -a`, then `docker compose up -d <section>` |
| **LAND** isn't in the menu, but `land` is running | Land is switched off until you switch it on | [Switch Land on](use/land.md#switch-land-on) |
| The section is greyed out, and opening it shows **section unavailable** | Its service started, then stopped answering. Core notices within about 30 seconds. | `docker compose logs <section>`, then `docker compose restart <section>` |
| SDR's waterfall and audio stop, but saved frequencies and recordings still show | The radio hub (`radio`) is down. Frequencies and recordings belong to the `sdr` service. | `docker compose logs radio` |
| A section's data looks old after going back to an older version | Data made while it ran as its own service is only in its own volume | See [Upgrade Sentinel](upgrading.md) |

## Logins between services

Sentinel's services sign in to each other with logins Sentinel creates for itself. When one fails, the log or response says which part:

| Response | Message | Cause |
|---|---|---|
| 503 | `Internal service access is disabled on this deployment` | The service has no list of logins: `service-credentials` didn't run. Run `docker compose up -d`. |
| 401 | `Invalid service credential` or `invalid decode secret` | The login isn't one Sentinel knows. Logins were recreated but the service wasn't restarted, or a radio host has an old credentials file. Restart the service; for a radio host, export and import again ([Run the radios on a second machine](radio-host.md#changing-things-later)). |
| 403 | `This service may not do that` or `not a <kind> decoder` | A known service tried something it isn't allowed to. This is a fault in Sentinel; report it. |

A `404` from `http://localhost:8080/internal/…` is on purpose: those routes are only for Sentinel's own services.

## Log messages

| Message | Meaning |
|---|---|
| `<id> service startup: waiting for core to answer (…)` | The service started before core. It carries on once core answers. Normal at start-up. |
| `waiting for the radio hub through …; retrying quietly` | A decoder started before the radio hub. Normal at start-up. |
| `legacy import: copied N rows into …` | Normal, once, after an upgrade: see [Upgrade Sentinel](upgrading.md#every-section-runs-as-its-own-service-october-2026). |
| NATS `permissions violation` | A service used an event-bus subject it isn't allowed. A fault in Sentinel (developers: see [Event bus](architecture/event-bus.md#adding-a-subject)). |
| `ConnectError` tracebacks from several sections for a few seconds | Core restarted, for example after `--build` without `--no-deps`. They stop once it is back. |
| `IQ captures: radio hub unreachable, …`, `Radio hub no longer holds the IQ of recording N`, `Recording N was never stopped …`, `IQ capture N reached the … recording limit` | About recordings: see [Record what you hear](use/sdr/record.md#troubleshooting). |
| Radio hub: `GET …/api/status 401`, then a login, then `200` | The normal first sign-in to a Sentry host. A `401` on the login itself means its console password is wrong. |

## Problems in a section

Each section's page has a **Troubleshooting** part. By what you see:

**Air**
- The map is empty off grid, or says "No data source configured": [Air troubleshooting](use/air.md#troubleshooting)
- No emergency alerts when the map is closed: [Air troubleshooting](use/air.md#troubleshooting)

**Space**
- "No satellite data available", positions look wrong, or a pass didn't tune: [Space troubleshooting](use/space.md#troubleshooting)

**Sea**
- "No AISStream API key configured" or "AISStream rejected the API key": [Sea troubleshooting](use/sea.md#troubleshooting)
- No ships off grid, or a notice about the AIS receiver or decoder: [Sea troubleshooting](use/sea.md#troubleshooting)

**Land**
- LAND isn't in the menu, or APRS hears nothing: [Land troubleshooting](use/land.md#troubleshooting)

**SDR**
- The radio says **DISCONNECTED**, reads **RESERVED**, or a Sentry host won't connect: [Add a radio](use/sdr/add-a-radio.md#troubleshooting)
- No sound, distorted sound, or only noise: [Listen to a frequency](use/sdr/listen.md#troubleshooting)
- Record is greyed out, **COPYING IQ…** doesn't finish, or a recording is missing or failed: [Record what you hear](use/sdr/record.md#troubleshooting)
- A decoder container doesn't start or can't reach the radio hub: [Install and run decoders](decoders.md#troubleshooting)

**Everything off grid**
- A blank map, an empty Air map, or old satellite positions: [Run Sentinel with no internet](tasks/no-internet.md#troubleshooting)

**Radio host**
- The radio hub on a second computer can't reach the main one: [Run the radios on a second machine](radio-host.md#troubleshooting)

## Still stuck

Collect the last few minutes of logs and report the problem on [GitHub](https://github.com/barrygee/Sentinel/issues):

```bash
docker compose logs --since 15m > sentinel-logs.txt
```

Check the file before you share it: it can include your addresses and the names of your radios.
