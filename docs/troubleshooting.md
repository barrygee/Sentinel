# Troubleshooting

Start with `docker compose ps -a`: every Sentinel service should say **(healthy)**. Each section's page has its own **If it's not working**.

## Won't start

| You see | Do |
|---|---|
| `Cannot connect to the Docker daemon` | Start Docker |
| `port is already allocated` (8080) | Stop whatever else uses 8080 |
| `gateway` or `nats` exited (8443 / 4222) | Something else uses the port; see [Ports](reference/ports-and-services.md) |
| First build fails downloading | Run `docker compose up --build -d` again |
| Sections stuck at **(health: starting)** | `docker compose logs app`; sections wait for core |
| Linux: `Permission denied` on `sentinel_config.json` | Set `SENTINEL_RUNTIME_USER_ID` / `_GROUP_ID` ([how](configuration.md#where-files-go)) |

## A section is missing

| You see | Do |
|---|---|
| Not in the menu | `docker compose up -d <section>` |
| **LAND** not in the menu | [Switch Land on](use/land.md#switch-land-on) |
| Greyed out, **section unavailable** | `docker compose logs <section>`, then `docker compose restart <section>` |
| SDR has no waterfall or audio | The radio hub is down: `docker compose logs radio` |
| No **SDR Manager** in Settings | `docker compose up -d sdr-manager-remote` |
| No **THIS MACHINE** in Settings › SDR Manager | SDR Manager for this computer isn't running: [Linux](sdr-manager-linux.md) or [Mac](sdr-manager-mac.md#if-its-not-working) |

## Service logins

| Response | Cause |
|---|---|
| 503 `Internal service access is disabled` | `service-credentials` didn't run: `docker compose up -d` |
| 401 `Invalid service credential` / `invalid decode secret` | Logins were recreated; restart the service (radio host: export and import again) |
| 403 `This service may not do that` | A fault in Sentinel: report it |

A 404 from `/internal/…` on :8080 is on purpose.

## Refused requests

The [request guard](security-guard.md) logs every refusal: `docker compose logs app air sea radio | grep guard`.

| Response | Cause | Do |
|---|---|---|
| 404 on an API route that exists | The caller isn't one the route is for: a script without `Sec-Fetch-Site`, another site, an address outside the `GUARD_*` lists | Check the log line; [Who may call what](security-guard.md#who-may-call-what) |
| 403 `Forbidden` | Banned, a blocked user agent, or a blocked address | `… cli bans`, then `… cli unban <address>` ([Bans](security-guard.md#bans)) |
| 429 `Too many requests` | Over a rate limit | Wait for `Retry-After`; raise the limit in the policy if it's real use |
| 400 / 415 / 413 | Attack detection, wrong content type, body too large | The log names the check; add an exception in the policy if it's a false positive |
| Everything refused after an upgrade | Network or address settings | [Upgrade: Request guard](upgrading.md#request-guard-and-a-fixed-docker-network-october-2026) |

To watch without refusing: `GUARD_PASSIVE_MODE=true`, then `docker compose up -d`.

## Log messages

| Message | Means |
|---|---|
| `waiting for core to answer` / `waiting for the radio hub` | Normal at start-up |
| `legacy import: copied N rows into …` | Normal, once, after an upgrade |
| NATS `permissions violation` | A fault in Sentinel |
| `ConnectError` from several sections for a few seconds | Core restarted |
| sdr-manager-remote: `401`, a login, then `200` | Normal first sign-in to an SDR host; a `401` on the login itself is a wrong console password |
| sdr-manager-local: `location: core unreachable, keeping the last known position` | Normal while core restarts |
| sdr-manager-local: `port 8000 on 0.0.0.0 is already in use` | Something else has port 8000; see [SDR Manager on Linux and Pi](sdr-manager-linux.md#if-its-not-working) |

## Still stuck

```bash
docker compose logs --since 15m > sentinel-logs.txt
```

Check it for addresses and radio names, then report it on [GitHub](https://github.com/barrygee/Sentinel/issues).
