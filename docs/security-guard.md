# Request guard

Every Sentinel service checks each request before it reaches the app. The check decides who may call which route, limits how fast a client can call, bans clients that keep misbehaving, catches common attacks, and adds security headers to every response. It uses [fastapi-guard](https://github.com/Guard-Core/fastapi-guard), configured by one policy file. It is on by default. The decision record is [ADR 0008](adr/0008-request-guard.md).

Sentinel has no user logins, so the guard can't tell people apart. It goes by **where a request comes from** and **what it is**: a browser running the app, another Sentinel service, a decoder, another machine's SDR Manager, or a script. Keep Sentinel on a trusted network anyway.

## What it does

| Feature | Default | What it means |
|---|---|---|
| Who may call what | On | Each route is for some callers only (below). Anyone else gets `404`, the same as for a route that doesn't exist. A route the policy doesn't mention can't be called by anyone, and a service with one won't start. |
| Rate limits | On | 1200 requests a minute per client address, and tighter limits on costly routes. Over the limit: `429` with `Retry-After`. Map tiles, decoder events and the app shell aren't limited. |
| Automatic bans | On | 10 attacks in an hour gets an address banned for an hour. SQL, command or code injection gets 3 strikes and a day. Also banned: 20 rate-limit refusals, or bursts of `404`, `401` or `403` on one route (probing, guessing passwords). Sentinel's own containers are never banned, and restarting a service bans nobody. |
| Attack detection | On | Requests that send data — changes, radio control, offline-map jobs, SDR Manager sign-in — are checked for 18 kinds of attack (XSS, SQL injection, path traversal…). Plain reads and polls aren't: they carry no input worth checking, and checking every one cost about 40 ms each. Not SSRF: Sentinel is meant to reach addresses on your network, and your browser's own address would look like one. Settings writes and config uploads aren't checked either: they are your own settings, and checking a large one held Sentinel up for over a second. Text received over the air is never checked, so a hostile radio message can't get a decoder banned. |
| Scanner blocking | On | Known attack tools (sqlmap, nikto, nmap, nuclei…) are refused by user agent. |
| Security headers | On | `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` (location allowed for the map, no camera or microphone). The app shell's own CSP is unchanged. |
| Request checks | On | Content type, size limits, and a honeypot field on settings writes. |
| Shared state | On | Bans and counters are kept in Redis, so a ban on one service holds on all of them. |
| Referrer check | Off | Settings writes must come from your Sentinel's address. Set `GUARD_ALLOWED_REFERRER_DOMAINS`. |
| HTTPS + HSTS | Off | Only behind your own TLS front end: `GUARD_ENFORCE_HTTPS`. |
| CORS | Off | Not needed: the app is same-origin. `GUARD_CORS_ALLOW_ORIGINS` for a separate frontend. |
| Country rules | Off | Needs an IPInfo token: `GUARD_IPINFO_TOKEN`, `GUARD_BLOCKED_COUNTRIES` / `GUARD_ALLOWED_COUNTRIES`. |
| Cloud blocking | Off | Refuse AWS, GCP, Azure, DigitalOcean, Linode or Vultr addresses: `GUARD_BLOCK_CLOUD_PROVIDERS`. Needs internet access. |
| Emergency mode | Off | Refuse everyone except an allowlist: `GUARD_EMERGENCY_MODE`. |
| Guard Core dashboard | Off | Sends security events off this machine: `GUARD_AGENT_API_KEY`. |
| OpenTelemetry / Logfire | Off | `GUARD_ENABLE_OTEL` + `GUARD_OTEL_ENDPOINT`, `GUARD_ENABLE_LOGFIRE`. |

Nothing reaches the internet unless you switch on a feature marked "needs internet" or "sends off this machine".

## Who may call what

| Caller | Who | Recognised by |
|---|---|---|
| `page` | Anyone on your network opening Sentinel | A private (LAN) address |
| `browser` | The app's own API calls | A LAN address, and a browser saying the request came from this site (`Sec-Fetch-Site`). Another website, or a script, doesn't count. |
| `internal` | Sentinel's own containers | An address on Sentinel's Docker network, or a [service host](#radio-hosts) |
| `service` | A Sentinel service with its credential | As `internal`, plus `Authorization: Bearer`, which the route then checks |
| `decoder` | A decoder with its credential | As `internal` or a decoder host, plus `X-Decode-Secret`, which the route then checks |
| `peer` | Another machine's SDR Manager | A LAN address. This machine's SDR Manager only. |
| `operator` | You, on this machine | `GUARD_OPERATOR_IPS`: API docs (`/api/docs`) and schema |

The full list, route by route: [API access matrix](reference/api-access-matrix.md).

## Settings

All in `.env`, all optional; see [Environment variables](configuration.md#request-guard). After a change: `docker compose up -d`.

## The policy file

`backend/security/guard-policy.json` says how the guard behaves. Edits apply when the services reload (straight away with `docker compose up`, which runs them with `--reload`).

| Part | What it holds |
|---|---|
| `defaults` | Limits, bans, detection, headers, behaviour rules, logging |
| `profiles` | What differs per service (`core`, `section`, `radio_hub`, `docs`, `sdr_manager_local`, `sdr_manager_remote`); compose sets `GUARD_PROFILE` |
| `access_classes` | How each caller above is recognised. `$client_networks` and friends are the `GUARD_*` address lists. |
| `route_groups` | Per-route protections: limits, sizes, content types, detection exceptions, monitors, country and cloud rules |
| `route_rules` | Paths and methods → callers + group. First match wins. |

- A mistyped key stops the services from starting and names the key.
- Editors check the file against `guard-policy.schema.json` beside it.
- Check it: `docker compose exec app python -m backend.platform.security.cli check-policy`.
- See how a service's routes are classified: `… cli routes sentinel_air.service:app --profile section`.
- After changing rules, regenerate the matrix and schema, which CI checks: `uv run --project backend python -m backend.scripts.guard_policy_artifacts`.

**Adding an endpoint?** Give it a rule, or its service refuses to start and CI fails. Choose the narrowest caller.

## Bans

```bash
docker compose exec app python -m backend.platform.security.cli bans
docker compose exec app python -m backend.platform.security.cli unban 192.168.1.50
docker compose exec app python -m backend.platform.security.cli ban 192.168.1.50 --seconds 86400
```

Bans are shared, so lifting one from `app` lifts it on every service at its next request. The guard never bans the gateway, the machine itself or Sentinel's own containers: their addresses change when they restart, and their credentials hold them anyway.

Restarting a service bans nobody. While core restarts, the gateway takes a few seconds to learn every service's routes again; a request that reaches the wrong service in that time gets `503` (try again), not `404`, so it doesn't count towards a ban. To always let an address in, add it to `GUARD_IP_ALLOWLIST`; to always refuse one, use `GUARD_IP_BLOCKLIST`.

## Something is refused that shouldn't be

Each refusal is logged with the client's address and the reason:

```bash
docker compose logs app air sea | grep guard
```

- `guard access refused … (route is for …)`: the caller isn't one the route is for. Check the address is in the right `GUARD_*` list.
- `guard blocked … (user_agent | rate_limit | penetration | …)`: one of the checks above.

To see what would be refused without refusing it:

| Setting | Effect |
|---|---|
| `GUARD_PASSIVE_MODE=true` | Logs everything the guard would refuse, refuses nothing |
| `GUARD_ACCESS_ENFORCEMENT=log` | Logs only the who-may-call refusals; everything else still applies |

For a false positive in attack detection, add an exception to the route's group in the policy (`detection.excluded_body_fields`, `excluded_params`, `excluded_categories`, or `scan_body: false`) rather than turning detection off.

## Optional features

- **Referrer check:** `GUARD_ALLOWED_REFERRER_DOMAINS=sentinel.lan,192.168.1.20` (the names you open Sentinel by). Settings writes without one are refused.
- **HTTPS:** only if Sentinel is behind your own TLS front end. Set `GUARD_ENFORCE_HTTPS=true` and `GUARD_TRUST_FORWARDED_PROTO=true`, and make sure the front end sends `X-Forwarded-Proto`. HSTS is sent only then.
- **Countries:** get a free token at ipinfo.io, then set `GUARD_IPINFO_TOKEN` and either `GUARD_BLOCKED_COUNTRIES=RU,CN` or `GUARD_ALLOWED_COUNTRIES=GB`. The database is downloaded beside the database file and refreshed daily. Per-route country rules go in a group's `geo`.
- **Cloud providers:** `GUARD_BLOCK_CLOUD_PROVIDERS=AWS,GCP,Azure`. Their ranges are fetched hourly.
- **Emergency mode:** `GUARD_EMERGENCY_MODE=true` and `GUARD_EMERGENCY_ALLOWLIST=192.168.1.20`. Everyone else is refused.
- **Guard Core dashboard:** `GUARD_AGENT_API_KEY` and `GUARD_AGENT_PROJECT_ID`. `GUARD_ENABLE_DYNAMIC_RULES=true` lets the dashboard push rules.
- **Telemetry:** `GUARD_ENABLE_OTEL=true` and `GUARD_OTEL_ENDPOINT=http://collector:4317`, or `GUARD_ENABLE_LOGFIRE=true`.

Never commit a token or key: they belong in `.env`, which Git ignores.

## Radio hosts

A [radio host](radio-host.md)'s hub runs its own guard, keeping its state in memory. On the radio host, set `GUARD_SERVICE_HOSTS` to the core host's address. Core's health checks and the SDR section's recording copies come from there with a service credential, and are refused without it.

Browser traffic reaches the hub through core's gateway, so the hub sees the core host as the client. To see real browser addresses, set `GUARD_TRUSTED_PROXY_DEPTH=2` and `GUARD_EXTRA_TRUSTED_PROXIES=<core host address>`.

On the core host, a hub or section on another machine reaches core through the service entrypoint (:8443). Add that machine's address to `GUARD_SERVICE_HOSTS` on the core host too. The entrypoint only passes `/internal/…`, `/api/settings…` and `/health`.

## Limits

- **Docker Desktop (Mac, Windows):** every client appears to come from one address, Docker's own (`192.168.65.1` on a Mac). Per-client limits and bans then cover everyone at once, so a ban locks out every browser until you lift it. The API docs are refused even on this machine until you set `GUARD_OPERATOR_IPS=127.0.0.1/32,192.168.65.1/32`, which then lets every client in. On Linux, addresses are real.
- **Redis down:** requests are let through. Bans and limits are kept per service until Redis is back, and the log says so once a minute.
- **Sentinel's own network is trusted.** A container on it (a decoder included) counts as `internal`. That is the same trust it already had, since it could call the services directly.
- **No logins.** `browser` stops other websites and scripts from using the API. Anyone with a browser on your network is still a `browser`.
- **Turning it off:** `GUARD_ENABLED=false`. The services then accept every request from anyone who can reach them, as before.
