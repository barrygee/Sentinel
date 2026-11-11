# Plan: running Sentinel without Docker

**Status:** parked, exploration only, nothing built · **Date:** 2026-11-05 · **Cut against:** `main` @ `b0a4e82d`
**Scope:** what it would take to run Sentinel with no container runtime. Based on reading the code and compose files;
none of it has been tried outside Docker. Related: [container consolidation](container-consolidation.md),
[ADR 0006](../adr/0006-section-containers.md).

## 0. Summary

**Does NATS need Docker?** No. NATS is TCP between processes, and `nats-server` is a single binary. The bus doesn't need
NATS either: `backend/platform/bus.py` delivers to local handlers first, and only forwards to NATS when `NATS_URL` is
set.

**Is Docker required today?** Yes, but because of how Sentinel is packaged and secured, not because of NATS. `CLAUDE.md`
says there is "no in-process hosting and no non-Docker dev loop". The one exception is SDR Manager on a Mac, which runs
natively because Docker Desktop can't reach USB.

**Can it be converted?** Yes. Option A below is the recommended route, on Linux. The largest risk is the request guard,
which relies on Docker's network addresses.

## 1. Options

| | A: native processes | B: single process |
|---|---|---|
| What runs | The same services, plus `nats-server`, Redis and Caddy, under a supervisor (systemd, launchd or process-compose) | One FastAPI app holding every section, plus the decoders |
| NATS | Stays | Not needed |
| Multi-host radio setup | Should still work, needs retesting | Lost, or kept as a separate mode |
| Architecture change | Small: mostly config and packaging | Large: reverses owner decisions (below) |
| Head start | Services already run as `uvicorn sentinel_<id>.service:app` | `tests/in_process_app.py` composes almost every service, for tests only |

**Option A** keeps the architecture and the NATS permission model. The work is config, packaging and the guard.

**Option B** goes back on the same decisions as Stage 3 of the [consolidation plan](container-consolidation.md): one
container per section (ADR 0006), separate services as the only deployment mode, and the `services/dev-all/` composer
that was dropped without being built. It also breaks the rule that core never imports a section. The test app is a
weaker head start than it looks: it skips lifespan and turns the guard off, so no deployment exercises that path.

## 2. What Docker provides today

Each of these needs a replacement, in order of risk.

### 2.1 The request guard's address model

The guard has no user logins, so it goes by where a request comes from. The `internal` access class means "an address
on Sentinel's Docker network", and compose fixes that network (`172.28.0.0/24`) and the gateway's address
(`172.28.0.2`) so the policy can rely on them. See [security-guard.md](../security-guard.md).

On one host, every caller is `127.0.0.1`, so those classes collapse. Any local process could count as internal, and the
gateway could no longer be told apart from a service. This needs a redesign, for example per-service loopback addresses
or Unix sockets, not just new values in the `GUARD_*` lists.

### 2.2 Credentials and privileges

Each service mounts only its own `credentials/<user>/` folder, and runs with `no-new-privileges`, most with
`cap_drop: ALL`. Natively that needs one OS user per service plus file permissions. Without it, every process can read
every other service's NATS credentials, which defeats the per-service subject limits in
`backend/platform/nats_permissions.py`.

### 2.3 Addresses and ports

Services find each other by compose names (`app`, `nats`, `redis`, and so on; `core_internal_url` defaults to
`http://app:8000`), and most listen on port 8000. Each needs its own port and URL. `host.docker.internal` also goes, and
`SERVICE_INTERNAL_URL` and the gateway's upstreams change with it.

### 2.4 Decoders

This is the main build work. Most are compiled from pinned sources on Debian:

| Decoder | Native parts |
|---|---|
| `voice-decoder` | `dsd-fme` and `mbelib`, compiled, pinned by commit |
| `ais-decoder` | `direwolf` 1.8.1, compiled, tarball pinned by SHA-256 |
| `adsb-decoder` | `readsb`, compiled, pinned by commit, plus `socat` |
| `aprs-decoder` | `direwolf` from Debian's packages, plus `aprslib` in a venv |

This should carry over easily to native Linux. macOS is untested. The pins would need a home outside the Dockerfiles.

### 2.5 Setup and lifecycle

These all need scripting:

- the frontend build and the `pmtiles` binary, both done in `backend/Dockerfile`
- the one-shot `service-credentials` step
- volumes, which become directories, with data paths set for each service
- start order and health checks, including restart on failure

## 3. Recommendation

Choose **A on Linux**. Choose B only for a simple single-user install where losing multi-host and the isolation between
services is acceptable.

Suggested order if this goes ahead:

1. Decide the guard design (2.1). If no acceptable design exists, stop here.
2. Get one section and core running natively beside `nats-server`, Redis and Caddy.
3. Add the remaining services under the supervisor, with an OS user each (2.2).
4. Build the decoders natively (2.4).
5. Add an ADR, and update `CLAUDE.md`, the README and `docs/install.md`.

## 4. Open questions

1. **Why drop Docker?** A Raspberry Pi or other small box, easier installs, or USB access on a Mac? This decides between
   A and B, and how much of the decoder work is needed.
2. Would native replace Docker, or sit beside it? Two supported ways to run doubles the test surface, and today
   `docker compose up` is both the dev loop and the deploy path.
3. Does the [consolidation plan](container-consolidation.md) go first? Fewer services would mean less to port, but its
   Stage 3 is undecided.
