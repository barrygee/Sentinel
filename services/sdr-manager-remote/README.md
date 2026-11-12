# sdr-manager-remote

SDR Manager for SDR hosts on **other** computers (ADR [0007](../../docs/adr/0007-sdr-manager.md)). It keeps the list of hosts and their console passwords, polls each host's status over the SDR Manager API, and links this computer's `sdr-manager-local` as **This machine** (with a service bearer token, never the password). It adds no settings page of its own: it provides the `radioSites` capability the SDR section, Air and the maps read, including the host title rows and add form Settings › SDR's **SENTINEL HOSTS** shows.

User guide: [SDR Manager](../../docs/use/sdr-manager.md#sentinel-hosts).

| Folder | Holds |
|---|---|
| `backend/sentinel_sdr_manager_remote/` | `routers/hosts.py` (`/api/sdr-manager/remote/hosts`), `services/sdr_manager_client.py`, `host_certificates.py` (trust on first use: fetch, fingerprint and pin a host's certificate authority), `host_poller.py`, `local_link.py`, `reservations.py` (bus responders and claim events), `models.py` |
| `backend/tests/` | Its tests, every file prefixed `test_sdr_manager_remote_` |
| `frontend/` | `@sentinel/sdr-manager-remote`, its Module Federation remote (the `radioSites` capability, `RemoteHostHeader`, `RemoteHostAddForm`) |

On the bus it answers `sdr-manager.remote.{reservation.acquire,reservation.release,device.address,host.location,hosts.snapshot}` and sends `sdr-manager.claims.granted` (a request the radio hub acknowledges before the claim's retune; 2 s timeout) and `sdr-manager.claims.released`.

## Run

It is always on in the full app, built from the shared backend image.

**Docker:**

```bash
docker compose up -d sdr-manager-remote          # with compose.dev.yaml layered, code is mounted and reloads by itself
docker compose logs -f sdr-manager-remote
```

**Without Docker:** Sentinel runs only under Docker; there is no native mode for this service. Its tests need no Docker (below).

## Build

```bash
docker buildx bake backend --load                # the shared backend image it runs in
cd frontend && npm run build                     # just the UI remote, into the repo's frontend/spa-dist/remotes/sdr-manager-remote/
```

## Test

```bash
uv run --project backend pytest services/sdr-manager-remote/backend/tests   # from the repo root
cd services/sdr-manager-remote/frontend && npm run test:coverage            # 100% coverage gate
cd services/sdr-manager-remote/frontend && npm run lint && npm run typecheck
```

## Database

SQLite at `/app/data/sdr-manager-remote.db` on the `sdr_manager_remote_data` volume: one table, `remote_sdr_hosts` (with a partial unique index on the local row). No migrations: tables are created from the models at start, and later columns are idempotent ALTERs (`database.py`). It holds console passwords, so back the volume up somewhere safe.

## HTTPS to SDR hosts

Each Sentinel deployment has its own certificate authority, and hosts are trusted on first use (`services/host_certificates.py`):

1. `POST /api/sdr-manager/remote/hosts/certificate` reads the authority the host publishes at `GET /api/tls/certificate-authority`, over a connection that checks nothing yet, then proves the host's certificate chains to it with a second, verified request. It stores nothing.
2. The operator compares the fingerprint with the host's own. Adding the host (or `PUT …/hosts/{id}/certificate`) sends that fingerprint. The server reads the authority again and pins it on the row only if it still matches (409 `certificate_changed` otherwise).
3. Every request then verifies against that one authority, with no host name check. A host with no pin gets no request, and a host whose certificate doesn't chain to its pin is refused before anything is sent (`certificate_rejected`, shown as **CERTIFICATE CHANGED**).

The authority is pinned rather than the server certificate because the host's certificate gets a new key at every renewal. This machine's row is verified with the deployment's own authority instead. A changed address, port or transport forgets the pin, as it forgets the password. Plain HTTP (`transport: "http"`) is the operator's explicit choice for a host that doesn't offer HTTPS, and is what every host added before HTTPS reads.

## Configuration

Every `SDR_MANAGER_REMOTE_*` variable (`config.py`: poll interval and backoff, location refresh, timeouts, local-link interval) is in `.env.example`, commented out at its default; compose passes them with `env_file`. After a change: `docker compose up -d sdr-manager-remote`.
