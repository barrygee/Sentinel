# Event bus and security

Sections never import each other: they talk over the event bus (`backend/platform/bus.py`, carried by NATS) and HTTP. Every service proves who it is with its own credential.

## Event bus

- `publish(subject, payload)`: every local handler runs and is awaited, then it goes to NATS.
- `subscribe(pattern, handler)`: `*` matches one part, `>` the rest.
- `request(subject, payload)`: a local responder answers, else it crosses NATS and replies on `_INBOX.<user>`.

*Figure: A publish runs local handlers first, then reaches other processes through NATS.*

```mermaid
flowchart TB
    pub["radio: publish<br/>decode.aprs.3"] --> local["local handlers"]
    pub --> nats(("NATS"))
    nats --> land["land: decode.aprs.*"]
    req["sea: request<br/>hub.decode.ais.start"] --> nats
    nats --> resp["radio: responder"]
    resp -- "reply on _INBOX.sea" --> nats
```

Rules:

- **Low-rate control events only.** Never FFT, IQ or PCM.
- Payloads are JSON; the `db` session is stripped and re-injected, so handlers keep their signature.
- A remote exception arrives as `RemoteHandlerError`.
- `no_echo` is on: local handlers already ran. Removing it handles every event twice.
- A missing broker never blocks start-up or a publish.

| Subject | From | Means |
|---|---|---|
| `settings.changed.<ns>` | core | A setting changed |
| `registry.changed` | core | A service came, went, or changed availability |
| `notifications.raise` | a section | Store and push an alert |
| `decode.<kind>.<radioId>` | radio hub | A decoder heard something |
| `hub.decode.<kind>.{start,stop,status}` | a section | Control a decoder |
| `sdr-manager.remote.…` | air, radio hub | Reserve an SDR host's dongle, receiver location (air); host snapshot (radio hub) |
| `sdr-manager.claims.{granted,released}` | sdr-manager-remote | A dongle was claimed (a request: the radio hub acknowledges before the claim's retune) or given back; the hub leaves a claimed dongle alone |
| `hub.iq-capture.{locate,list,discard}` | sdr | IQ capture hand-over |
| `air.squawk.changed` | air | A squawk changed |

**Adding a subject:** add it to the user's row in `backend/platform/nats_permissions.py`, `docker compose up -d`, then `docker compose restart nats`. Otherwise the broker refuses it (`permissions violation`).

## Security

No user logins: anyone who reaches :8080 can use Sentinel, so keep it on a trusted network.

| Crossing | Protected by |
|---|---|
| Browser → gateway | Your network; `/internal/…` refused; the request guard (below) |
| Service → core internal routes | Its own token, `Authorization: Bearer` |
| Decoder → radio hub | Its own token, `X-Decode-Secret` |
| Anything → NATS | TLS with the install's own CA, one NATS user each |
| Radio host → core | TLS on :8443 and :4222, plus its own credentials |

- `service-credentials` creates, on every `up` and only what is missing: a CA, TLS certs, per-caller tokens and NATS logins, and `accepted-callers.json` for core and the hub holding only **SHA-256 hashes**.
- Each container mounts only `credentials/<caller>/`. To replace one, delete its folder and `docker compose up -d`.
- `backend/platform/service_access.py` says what each caller may do: register itself; `sea` reads the AISStream key; `sdr` fetches IQ captures; decoders act as their own kind only.
- Guards (`backend/core/internal_auth.py`): 503 no caller list, 401 unknown token, 403 not allowed.
- **A new service or decoder kind** needs a row in both tables and a credentials mount.

### Request guard

Every FastAPI process runs [fastapi-guard](https://github.com/Guard-Core/fastapi-guard) plus an access layer of Sentinel's own ([ADR 0008](../adr/0008-request-guard.md), operator guide [Request guard](../security-guard.md)). The code is in `backend/platform/security/` and the policy in `backend/security/guard-policy.json`.

*Figure: A request passes fastapi-guard, then the access layer, then the route's own credential check.*

```mermaid
flowchart LR
    client["client"] --> gw["gateway<br/>(fixed address, X-Forwarded-For)"]
    gw --> guard["fastapi-guard<br/>bans · limits · detection · headers"]
    guard --> access["access layer<br/>route rule → caller class, else 404"]
    access --> route["route<br/>require_caller / require_decoder"]
    guard <--> redis[("redis<br/>shared state")]
```

- `install_request_guard(app, service_name=…)` is the one call, made by `create_core_app()` and `create_service()`. At startup it checks every route (mounts included) against `route_rules`, applies each group's fastapi-guard decorators, then warms fastapi-guard before the app's own lifecycles.
- **Order matters.** The access layer sits inside fastapi-guard, so it uses fastapi-guard's resolved client address and its 404s feed the `status:404` ban rule. It runs before routing, so a refused caller never sees a route's 401.
- **Caller classes** (`access.py`): `page`, `browser` (LAN + `Sec-Fetch-Site`, or a same-host `Origin`), `internal`, `service` (+ `Authorization`), `decoder` (+ `X-Decode-Secret`), `peer`, `operator`. Presence of a credential header is all it checks; the route still verifies the credential.
- **WebSockets** skip fastapi-guard's HTTP middleware, so the access layer also runs fastapi-guard's WebSocket checks before `accept()`.
- **Fail-open:** fastapi-guard's behaviour tracker raises when Redis is down; `fail_open.py` makes it count nothing instead, matching `redis_fail_open`.
- **A new route** needs a rule (`route_rules`), then `python -m backend.scripts.guard_policy_artifacts` to regenerate the [access matrix](../reference/api-access-matrix.md). A process with an unclassified route won't start.

In the browser:

- Core sets the CSP on `index.html` (`backend/core/spa_csp.py`), allowing its inline boot scripts by hash. It keeps `blob:` and `'unsafe-eval'` for SDR audio.
- Remotes load only from same-origin `/remotes/<id>/`.
- Docs render with markdown-it (`html: false`) then DOMPurify; Mermaid runs `securityLevel: strict`.

Every route validates input at the edge (Pydantic, bounds, allow-lists); queries go through SQLAlchemy. Add a test proving bad input is refused.
