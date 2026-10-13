# 0006. Sections as separate services behind a gateway

Date: 2026-10-13
Status: accepted

## Context

Until September 2026 Sentinel was one FastAPI process serving one Vue bundle.
Every section (Air, Space, Sea, Land, SDR) shared one SQLite file, one
settings router, one Pinia instance and one build, and sections imported each
other freely. That made a section impossible to leave out, upgrade or move on
its own. It also meant the radio code (rtl_tcp, Sentry, decode bridges) had to
run on the machine serving the browser, not the one next to the dongles.

The owner asked for an app/shell core plus one container per section: add or
remove a section by starting or stopping its container, run services on more
than one host, change nothing the user can see, and keep SDR audio playing while
the user moves between sections.

The full design, its review and the as-built notes for every phase are in
[`docs/plans/section-containers.md`](../plans/section-containers.md). This
record keeps the decisions and why they were made.

## Decision

**Core plus self-registering services.** Core is the `app` (shell UI, settings
and the live config file, notifications, offline maps, the service registry),
`gateway` (Caddy, the only origin browsers use) and `nats` (the event bus).
Space, Land, Air, Sea, SDR and the **radio hub** each run as their own service
from the same backend image (`uvicorn backend.standalone.<id>:app`, built by
`create_service()` in `backend/platform/sdk/`). A service registers its
manifest with core. Core pushes the service's path prefixes into the gateway,
and the shell loads its UI. No gateway or shell edit is needed to add a section.

- **Paths unchanged.** Every public API path, WebSocket protocol, settings key
  and the `sentinel_config.json` shape stayed byte-identical. The gateway routes
  by longest prefix (`/api/sdr/radios` → hub, `/api/sdr/adsb/` → Air, the rest
  of `/api/sdr/` → SDR), and parity goldens pin the route inventory and OpenAPI.
- **Runtime Module Federation for the UI.** Each section is a remote served
  under `/remotes/<id>/`, listed by `GET /api/app/sections`. A remote that fails
  to load gets a "section unavailable" page instead of breaking the shell. The
  SDR remote exposes an eager engine entry that the shell mounts outside the
  router view and never unloads, so audio survives navigation.
- **A database per service, settings in core.** Each service owns its tables
  in its own SQLite file and copies them out of the old `sentinel.db` on first
  boot (`legacy_import.py`). Settings stay central: services read and write them
  over core's settings API (`backend/platform/settings_client.py`).
- **Sections talk over the bus, never by import.** They use NATS core subjects
  (no JetStream) such as `settings.changed.<ns>`, `decode.<kind>.<radioId>` and
  `hub.*` request/reply. Publishing awaits local handlers first, then forwards
  to NATS. Import-linter contracts make "core imports no section" and "no
  section imports another" gating. FFT, IQ and PCM never go on the bus.
- **One radio hub owns every radio.** rtl_tcp and the Sentry fleet, the FFT
  broadcasters, tuning ownership, IQ capture and all decode bridges live in the
  hub. Decoder containers are thin wrappers that register a manifest. A new
  decoder kind needs no hub code, only an entry in the access table.
- **Secured by default, no configuration.** A one-shot `service-credentials`
  service generates a deployment CA, TLS-only NATS with a user per service and
  per-subject permissions (`nats_permissions.py`), and an HTTP credential per
  service and decoder. Core and the hub hold only hashes of those credentials.
  A checked-in table (`service_access.py`) says what each caller may do.
- **Multi-host.** The hub and decoders can run on a second machine
  (`compose.radio-host.yaml`, [`docs/radio-host.md`](../radio-host.md)). They
  reach core over TLS through a service entrypoint (:8443) and NATS, and PCM
  never crosses the LAN. `docker buildx bake` builds the image for amd64 and
  arm64. Decoder upstreams are pinned to commit SHAs.
- **Separate services are the only deployment mode** (2026-10-13, revising the
  plan's "keep `dev-all`"). Under compose, a bare `docker compose up` starts all
  six services. The app's `SENTINEL_EXTERNAL_SERVICES` is fixed to all six, so
  it never hosts a section itself. A section is left out with `--scale
  <service>=0`. A radio-host core sets `SENTINEL_RADIO_HUB_REPLICAS=0`.
  In-process hosting (`create_core_app()` in `backend/composition_root.py`
  including the sections `SENTINEL_EXTERNAL_SERVICES` doesn't list) survives
  only as the backend test suite's app and the non-Docker
  `uvicorn backend.main:app` dev loop.

## Consequences

- **Sections are optional and independent.** Stopping one greys its nav entry
  and its paths answer a JSON 503 (`<id> is unavailable`), while the rest keep
  working. Each can be upgraded, restarted or moved on its own, and the radio
  stack can sit next to the antennas.
- **More processes and more memory.** That's about 60–90 MB per Python service,
  roughly 1 GB with everything and all decoders on. The all-in-one mode is no
  longer offered for low-RAM hosts. Leaving sections out is the lever.
- **Core is a single point of failure for the UI** (accepted). Sections keep
  ingesting headless while it restarts.
- **Contracts to maintain.** A new bus subject must be added to the NATS
  permission table, and a new service or decoder to the access table plus its
  compose credential mount, or it is refused. The route-order and OpenAPI
  goldens fail on any accidental path change.
- **Two composition roots for now.** `create_core_app()` still carries "host it
  here unless it runs elsewhere" branches, and code is kept out of the app
  process by not importing it (sections subscribe to the bus at import). Moving
  each section's backend into `services/sections/<id>/backend`, and with it the
  per-service tests, is the follow-up that lets in-process hosting be deleted.
- **Not done from the plan:** `frontend/spa-dist/` is still committed. Images
  build the SPA themselves, but the volume-mounted dev/live flow and the SPA e2e
  suite serve the committed bundle.
