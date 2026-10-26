# sdr-manager-local

SDR Manager for the RTL-SDR dongles plugged into **this** computer (ADR [0007](../../docs/adr/0007-sdr-manager.md); it was the Sentry program). It finds dongles over USB, runs `rtl_tcp` behind a fan-out relay for each one, and serves the SDR Manager API on `:8000`: to this Sentinel through the gateway (`/api/sdr-manager/local/…`) and to other Sentinels directly (`/api/…`). Its UI is the **THIS MACHINE** group of Settings › SDR Manager.

User guides: [SDR Manager](../../docs/use/sdr-manager.md), [Mac](../../docs/sdr-manager-mac.md), [Linux and Pi](../../docs/sdr-manager-linux.md), [SDR Manager only](../../docs/sdr-manager-local-only.md).

| Folder | Holds |
|---|---|
| `backend/sentinel_sdr_manager_local/` | The service: routers → services → Protocols ← adapters, composed in `container.py`; `contract_app.py` (the API, mounted twice); `cli.py`, `native.py`, `launch_agent.py`, `adapters/macos/` (Mac); `relay/rtl_tcp_relay.py` (vendored unchanged, not linted) |
| `backend/tests/` | Its tests, every file prefixed `test_sdr_manager_local_` |
| `frontend/` | `@sentinel/sdr-manager-local`, its Module Federation remote (THIS MACHINE) |
| `Dockerfile` | Its own image: librtlsdr built from a pinned commit, plus the UI remote |
| `config.example.json` | The shape of an exported configuration file |

## Run

**Docker (Linux, with dongles).** From the repo root, with `COMPOSE_PROFILES=sdr-manager-local` in `.env`:

```bash
docker compose up --build -d                     # the whole app plus sdr-manager-local
docker compose restart sdr-manager-local         # after a code edit (no --reload: it would restart every stream)
docker compose logs -f sdr-manager-local
```

**Docker, no dongles (any computer).** Two simulated dongles, bridged and unprivileged:

```bash
docker compose -f docker-compose.yml -f compose.sdr-manager-local-mock.yaml --profile sdr-manager-local up -d --build
```

**Without Docker (a Mac, or development).** The rest of Sentinel still runs in Docker; this runs as a native process from the repo root, with `SDR_MANAGER_LOCAL_NATIVE=1` in `.env` and `docker compose up -d` done (it writes the credentials to `./sdr-manager-local-credentials/`):

```bash
uv run --project backend sdr-manager-local start       # in this window
uv run --project backend sdr-manager-local install     # as a LaunchAgent: now, at login, restarted on a crash
uv run --project backend sdr-manager-local status      # what's wrong, with a fix for each problem
uv run --project backend sdr-manager-local doctor      # status plus port, Homebrew, credentials, core, librtlsdr version
uv run --project backend sdr-manager-local uninstall
```

A Mac needs `brew install librtlsdr uv`. Data: `~/Library/Application Support/Sentinel/sdr-manager-local/`; log: `~/Library/Logs/Sentinel/sdr-manager-local.log`. `start` works on Linux too, for development (`SDR_MANAGER_LOCAL_HARDWARE=fake` without dongles).

## Build

```bash
docker buildx bake sdr-manager-local --load       # this computer's platform
docker buildx bake sdr-manager-local              # linux/amd64 + linux/arm64 (CI builds it, never pushes)
cd frontend && npm run build                      # just the UI remote, into the repo's frontend/spa-dist/remotes/sdr-manager-local/
```

## Test

```bash
uv run --project backend pytest services/sdr-manager-local/backend/tests   # from the repo root
uv run --project backend pytest tests/contract/sdr_manager_api             # the API contract, against fake hardware
cd services/sdr-manager-local/frontend && npm run test:coverage            # 100% coverage gate
cd services/sdr-manager-local/frontend && npm run lint && npm run typecheck
```

The tests point the engine at a temp file (`conftest.py`), pin the platform to Linux, and build the real app with `sdr_manager_local_app_factory`; set dependency overrides on `app.state.contract_app`, not the outer app.

## Database

SQLite at `DB_PATH` (`/data/sdr-manager-local.db` on the `sdr_manager_local_data` volume; on a Mac, in Application Support). No migrations: tables are created from the models at start (`create_section_tables`), and `database.py` seeds `console_auth` and `host_control_settings`. To start again, stop the service and delete the file (under Docker, remove the `sdr_manager_local_data` volume: `docker volume ls` shows it with your project's prefix).

Forgotten console password:

```bash
docker compose exec sdr-manager-local python -m sentinel_sdr_manager_local.reset_password
```

## Configuration

Every `SDR_MANAGER_LOCAL_*` variable (`config.py`) is listed in `.env.example` with its default; compose passes them with `env_file`, and the native command reads them from `.env`. The platform variables (`DB_PATH`, `SENTINEL_CORE_URL`, `SERVICE_INTERNAL_URL`, the credential files) are set by `docker-compose.yml`, or by `native.py` on a Mac. It reaches core at `https://localhost:8443` (the gateway's TLS entrypoint), has no NATS, and keeps serving while core is down.
