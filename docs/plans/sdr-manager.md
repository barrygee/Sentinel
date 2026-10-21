# Tech spec: SDR Manager, which absorbs Sentry into Sentinel as two containers

**Status:** approved, not started · **Date:** 2026-10-21 · **Cut against:** `main` @ `79081711` · decision record [ADR 0007](../adr/0007-sdr-manager.md)

## Context

Today a user needs two apps:
- **Sentry** (`~/code/Sentry`) manages RTL-SDR dongles plugged into a machine. It is a root, privileged, host-networked FastAPI app that discovers dongles, gives each a stable identity, and runs one `rtl_tcp` + relay pair per dongle. It also handles reservations, EEPROM serial flashing, config export/import and a Wi-Fi hotspot.
- **Sentinel** only manages Sentry hosts remotely. That code lives inside the radio hub (`services/radio/backend/sentinel_radio`): the `sentry_hosts` table, `SentryClient`, `SentryFleetPoller`, and the `hub.sentry.*` lease responders. Its UI sits in the SDR section's Settings, so it disappears whenever the SDR section is off.

**Goal:** one Settings section, **SDR Manager**, backed by two containers. Each container serves its own screens, and none of the screens are in core.

| Container | Role | Runs in |
|---|---|---|
| **`sdr-manager-local`** | Dongles plugged into this machine | Full mode (when this machine has dongles) and SDR Manager-only mode |
| **`sdr-manager-remote`** | SDR hosts on other machines, plus linking this machine's devices into Sentinel's radios | Full mode only |

**Decisions made:**
- **Naming:** every new name includes `sdr-manager`. The leftover "sentry" identifiers are renamed as well.
- **One Settings section, "SDR Manager".** `sdr-manager-local` adds the **THIS MACHINE** group and `sdr-manager-remote` adds the **REMOTE SDR HOSTS** group. Each group shows only while its container runs.
- **SDR Manager-only mode** manages local SDRs only. It serves them on the network so other Sentinels can use and manage them.
- **The Sentry repo** is absorbed, then archived.
- **No migration:** all users are new.
- **Features ported:** config export/import, EEPROM serial flash, Wi-Fi hotspot. Fixed location is **not** ported; Sentinel's own location setting is used instead.
- **macOS:** `sdr-manager-local` runs as a native Mac process. Everything else stays in Docker.
- **Setup:** each machine picks its setup once in `.env` and is always started with `docker compose up -d`. There is no launcher script, and `.env.example` is documented exhaustively.
- **Docs:** they cover the feature fully, including a plain-English, step-by-step Mac guide.
- **Out of scope:** renaming the app to RECON is a separate, later project. This spec keeps "Sentinel".

**Constraint:** `sdr-manager-remote` manages remote machines through the HTTP API on `:8000` that `sdr-manager-local` serves. That API, taken over from Sentry, is the **SDR Manager API**. Both ends are in this repo, so it can be renamed freely, but it is versioned and covered by a contract test.

## Architecture

```
FULL MODE (Linux host)
Browser ─:8080─▶ gateway (Caddy, bridge network "sentinel")
  /api/sdr-manager/local/*,  /remotes/sdr-manager-local/*  ─▶ host.docker.internal:8000  (sdr-manager-local)
  /api/sdr-manager/remote/*, /remotes/sdr-manager-remote/* ─▶ sdr-manager-remote:8000
  /api/sdr/radios etc. ─▶ radio hub (streams + decoding only)

sdr-manager-remote (bridge, unprivileged, shared backend image, NATS)
  remote_sdr_hosts table · SdrManagerClient · host poller · device-address following
  lease responders  sdr-manager.remote.reservation.* · host-location / device-address responders
  "This machine" link: finds sdr-manager-local in the core registry → host row is_local=1
  ── SDR Manager API ──▶ host.docker.internal:8000 (local, service bearer) and <pi>:8000 (remote, console password)
  ── bus ──▶ radio hub: sdr-manager.claims.* events (hub must not retune a claimed dongle)

sdr-manager-local (host network, privileged, /dev/bus/usb, dbus; native process on macOS)
  outer app = create_service(): /health, /remotes/sdr-manager-local/
  contract_app mounted at /api/sdr-manager/local (gateway) AND /api (SDR Manager API for remote managers)
  ported composition root: supervisor, registry, hotplug, identity, eeprom, hotspot, reservations, console_auth
  child processes: rtl_tcp (loopback 14000+) + relay (public P, control P+2)

SDR MANAGER-ONLY (e.g. a Pi): service-credentials + app (SENTINEL_MODE=sdr-manager-local-only, no NATS)
  + gateway + sdr-manager-local. Other Sentinels' sdr-manager-remote ─▶ <pi>:8000/api/*.
```

## Naming

| Thing | `sdr-manager-local` | `sdr-manager-remote` |
|---|---|---|
| Service id / manifest kind | `sdr-manager-local` | `sdr-manager-remote` |
| Folder | `services/sdr-manager-local/{backend,frontend}` | `services/sdr-manager-remote/{backend,frontend}` |
| Python package | `sentinel_sdr_manager_local` | `sentinel_sdr_manager_remote` |
| npm package | `@sentinel/sdr-manager-local` | `@sentinel/sdr-manager-remote` |
| Image / bake target | `sdr-manager-local` (own image) | shared backend image |
| Gateway API | `/api/sdr-manager/local/` | `/api/sdr-manager/remote/` |
| UI remote | `/remotes/sdr-manager-local/` | `/remotes/sdr-manager-remote/` |
| Env prefix | `SDR_MANAGER_LOCAL_*` | `SDR_MANAGER_REMOTE_*` |
| Volume / database | `sdr_manager_local_data` / `sdr-manager-local.db` | `sdr_manager_remote_data` / `sdr-manager-remote.db` |
| Compose profile | `sdr-manager-local` | none; always on in full mode |
| Bus subjects | none | `sdr-manager.remote.>` (requests), `sdr-manager.claims.>` (events) |

**Shared names:**
- Lightweight mode: `compose.sdr-manager-local-only.yaml` and `SENTINEL_MODE=sdr-manager-local-only`.
- Mock override: `compose.sdr-manager-local-mock.yaml`.
- Mac: the `sdr-manager-local` command, `SDR_MANAGER_LOCAL_NATIVE=1`, the LaunchAgent `uk.sentinel.sdr-manager-local`, and `./sdr-manager-local-credentials/`.
- Settings section: key `sdr-manager`, label "SDR Manager", route `/settings/sdr-manager`.
- SDR Manager API:
  - headers `X-Sdr-Manager-Api-Version` and `X-Sdr-Manager-Reservation-Holder`;
  - session cookie `sdr_manager_session`;
  - version 1.
- Remaining "sentry" identifiers are renamed in a dedicated PR:
  - `sdr.radios` fields `sentry_host_id` and `sentry_device_id` become `sdr_manager_host_id` and `sdr_manager_device_id`;
  - `app.rangeRingOrigin.sentryHostId` becomes `sdrManagerHostId`;
  - the `sentrySites` store becomes `sdrManagerSites`;
  - map-kit `SentrySitesControl` becomes `SdrManagerSitesControl`;
  - `SENTINEL_ADSB_SENTRY_API` becomes `SENTINEL_ADSB_SDR_MANAGER_API`;
  - the e2e spec, mocks and goldens follow.

## Key design decisions

### `sdr-manager-local`

1. **Package.** Sentry's composition root moves over unchanged into `sentinel_sdr_manager_local`: routers → services → Protocols ← adapters, wrapped in `create_service()`.
2. **Image.** `services/sdr-manager-local/Dockerfile`:
   - librtlsdr built from a **pinned commit SHA**;
   - a Node stage that builds this package's UI remote;
   - `python:3.12-slim` + uv, with libusb, tini, network-manager and dnsmasq-utils.
   - Built for amd64 and arm64.
   - Root and privileged mode apply to this image and profile only, as ADR-0007 justifies.
3. **Networking.**
   - `network_mode: host`, because each dongle gets its own ports.
   - It registers `SERVICE_INTERNAL_URL=http://host.docker.internal:8000`.
   - `extra_hosts: host-gateway` is added to `app`, `gateway`, `sdr-manager-remote` and the decoders.
   - It reaches core at `https://localhost:8443`, as in `compose.radio-host.yaml:55-80`.
   - It does not use NATS.
4. **One API, two mounts.**
   - The gateway doesn't strip prefixes (`backend/core/gateway_routes.py:89-106`). So `contract_app` is mounted at `/api/sdr-manager/local` and then at `/api` for remote managers.
   - `/api/location*` is removed.
5. **Auth.**
   - The console password is enforced on both paths.
   - Additionally, `Authorization: Bearer <service token>` is accepted, checked by hash against `ACCEPTED_CALLERS_FILE`. Only `sdr-manager-remote` may use it, through a new `CallerAccess.manages_local_sdrs` (`backend/platform/service_access.py:41-64`).
   - Other machines' managers use the console password.
6. **Serve before core.** A new opt-in `serve_before_core=True` and `core_independent_lifecycles` in `backend/platform/sdk/__init__.py`, because `wait_for_core` blocks forever (`backend/platform/settings_client.py:58-85`). Dongles keep streaming while core is down.
7. **Persistence.**
   - No Alembic. The models from Sentry's final migration (0007) are created with `create_section_tables(...)` plus an ALTER list.
   - Single-row tables are seeded in `prepare`.
   - `sentry_location` is dropped.
8. **Location.**
   - `/api/v1/sdrs` `source.location` and `/api/status` read core's `app.location`, cached for 60 s and keeping the last good value.
   - SDR Manager-only mode keeps the Sentinel Location setting.
   - While the location is blank, a "Location not set" notice links to that setting.
9. **macOS.** Native process. See its section below.
10. **Dev without dongles.** `SDR_MANAGER_LOCAL_HARDWARE=fake` uses the fake adapters, and `compose.sdr-manager-local-mock.yaml` runs the container bridged and unprivileged.

### `sdr-manager-remote`

11. **What moves out of the hub** into `sentinel_sdr_manager_remote`:

    | From the hub | New home |
    |---|---|
    | `models.py` `SentryHost` | `models.py` `RemoteSdrHost`, table `remote_sdr_hosts`, plus `is_local` and `auth_mode`, and a partial unique index on the local row |
    | `services/sentry_client.py` | `services/sdr_manager_client.py` (`SdrManagerClient`): cookie login or service bearer |
    | `services/sentry_fleet.py` | `services/host_poller.py` (status polling, device-address following, location refresh) |
    | `services/sentry_reservations.py` | `services/reservations.py`: responders for `sdr-manager.remote.reservation.acquire\|release`, `…device.address` and `…host.location` |
    | `routers/sentry.py` | `routers/hosts.py` under `/api/sdr-manager/remote/hosts` |
    | config `sentry_*` timings | `SDR_MANAGER_REMOTE_*` |

12. **"This machine" link.**
    - Core gets a token-gated `GET /internal/registry/services?kind=sdr-manager-local`.
    - `local_link.py` polls it every 10 s and upserts the `is_local=1` host row, with `auth_mode='service'` and the address taken from `internalUrl`. This covers both the container and the Mac process.
    - When `sdr-manager-local` is absent, the row is **disabled, never deleted**, because `sdr.radios` references it.
    - DELETE or readdress on that row returns 409 `local_host_managed`.
13. **Hub after the move.**
    - The hub keeps streams, decoding, radios (`/api/sdr/radios`) and `device_claims.py`.
    - It subscribes to `sdr-manager.claims.granted|released` and updates its claims, so it still yields to a claimed dongle (`sdr.py:1083`).
    - For greyed-out device availability (`radios.py:42-76`), it requests `sdr-manager.remote.hosts.snapshot`, caches the reply for 5 s, and fails open as "unknown".
    - Its manifest drops `/api/sdr/sentry-hosts`.
14. **Air.** `adsb_source.py` requests `sdr-manager.remote.reservation.*` instead of `hub.sentry.*`. In `nats_permissions.py:52`, Air's request permission changes to `sdr-manager.remote.>`.
15. **Container.**
    - Bridge network and the shared backend image: `command: uvicorn sentinel_sdr_manager_remote.service:app`.
    - Its own volume, `extra_hosts: host-gateway`, and NATS user entries in `nats_permissions.py`: replies on `sdr-manager.remote.>`, publishes `sdr-manager.claims.>`.
16. **Radio-host setups** (`compose.radio-host.yaml`). `sdr-manager-remote` stays on the main machine with core. A radio host may run `sdr-manager-local` for its own dongles.

### Shared

17. **Settings: one section, two contributors.**
    - `registerSettingsSection` (`platform/web/shell-api/src/shell/settingsRegistry.ts:33`) currently throws on a duplicate key. It changes to accept a re-registration that is identical: same label, order and domain flag. A conflicting re-registration still throws.
    - Both remotes register `{key:'sdr-manager', label:'SDR Manager', order:15, domain:false}`.
    - Each remote then registers its own items under its own group label.
18. **Federation listing.** `backend/core/app_sections.py:49-67` filters on `UI_REMOTE_KINDS = {"section","sdr-manager-local","sdr-manager-remote"}` and adds `kind` to `DeployedSection`. Each remote's `register()` adds settings only, never a map section.
19. **App mode.** Core serves `GET /api/app/mode` with `{mode, landingPath}` from `backend/config.py` `sentinel_mode`.
20. **Startup modes, using plain Docker Compose:**
    - **Full:** in `docker-compose.yml`, `sdr-manager-remote` always runs and `sdr-manager-local` is behind `profiles: ["sdr-manager-local"]`. A plain `docker compose up` gives today's behaviour, plus remote management in its new container.
    - **SDR Manager-only:** a standalone `compose.sdr-manager-local-only.yaml`, following the `compose.radio-host.yaml` precedent.
      - Services: `service-credentials`, `app` (with `SENTINEL_MODE=sdr-manager-local-only` and `NATS_URL=`), `gateway`, and `sdr-manager-local` (profiled).
      - No hub, no `sdr-manager-remote`, no NATS and no sections.
      - Shared definitions use `extends:`. Verify how `extends` handles `depends_on`.
21. **Decoder addresses.** Decoders must resolve `host.docker.internal`; set `SDR_MANAGER_LOCAL_ADVERTISED_HOST` if they can't. The hotspot is hidden when it reports `available:false`.

## Setup recipes (set once in `.env`, then `docker compose up -d`)

| # | Setup | `.env` | Plus |
|---|---|---|---|
| 1 | Sentinel, managing only remote SDR hosts | nothing | – |
| 2 | Linux: Sentinel + this machine's SDRs | `COMPOSE_PROFILES=sdr-manager-local` (add decoder profiles, comma-separated) | – |
| 3 | Linux/Pi: SDR Manager only | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml`, `COMPOSE_PROFILES=sdr-manager-local` | – |
| 4 | Mac: Sentinel + this Mac's SDRs | `SDR_MANAGER_LOCAL_NATIVE=1` | `sdr-manager-local install`, once |
| 5 | Mac: SDR Manager only | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml`, `SDR_MANAGER_LOCAL_NATIVE=1` | `sdr-manager-local install`, once |

`sdr-manager-local` exits with a clear message if port 8000 is taken, and core logs the mode it started in.

## macOS native mode (`sdr-manager-local`)

**Why:** Docker Desktop has no USB passthrough and no host networking. Its USB/IP option is experimental, attaches each device by hand, and is unproven at RTL-SDR data rates.

**Adapters** live in `sentinel_sdr_manager_local/adapters/macos/` and are picked when `sys.platform == "darwin"`:

| Protocol | Adapter | How |
|---|---|---|
| USB discovery | `IoregUsbDiscovery` | Parses `ioreg -p IOUSB -l -a` with `plistlib`. `locationID` is the tier-2 identity. |
| Hotplug | existing reconcile poll | Every `SDR_MANAGER_LOCAL_RECONCILE_INTERVAL_S` |
| Device index | `CtypesRtlSdrLibrary` | Searches `/opt/homebrew/lib` and `/usr/local/lib`; overridden by `SDR_MANAGER_LOCAL_LIBRTLSDR_PATH` |
| rtl_tcp and rtl_eeprom | Homebrew | Found on `PATH`, falling back to the Homebrew paths |
| Hotspot | `UnavailableWifiApController` | Reports `available:false` |

**Command:** a Python `[project.scripts]` entry, `sdr-manager-local`, with these subcommands:

| Subcommand | What it does |
|---|---|
| `start` | Runs in the foreground |
| `install` / `uninstall` | Adds or removes the LaunchAgent, which starts it at login and restarts it if it crashes |
| `status` | A plain-English check of each part, with a fix for each problem |
| `doctor` | `status`, plus port 8000, Homebrew, credentials, and the librtlsdr version |

- **Files:** data in `~/Library/Application Support/Sentinel/sdr-manager-local/`, log at `~/Library/Logs/Sentinel/sdr-manager-local.log`.
- **Credentials:** when `SDR_MANAGER_LOCAL_NATIVE=1`, `service-credentials` writes the token and CA to `./sdr-manager-local-credentials/` (gitignored, mode 0700).
- **Python:** uv provides it.

## Frontend

**`@sentinel/sdr-manager-local`** (`services/sdr-manager-local/frontend/src/`) provides group **THIS MACHINE**:
```
register.ts (section + items)       api/sdrManagerLocalApi.ts  (/api/sdr-manager/local, SdrManagerApiError)
composables/useLocalSdrEvents.ts (SSE, backoff, dispose)  useLocalSdrAuth.ts
stores/localSdrStore.ts
components/
  LocalAuthGate.vue → LocalSignInForm.vue
  LocalDeviceList.vue → LocalDeviceCard.vue
      ├ SdrDeviceIdentityField.vue, SdrDeviceStateBadge.vue   (@sentinel/ui, shared with remote)
      ├ LocalPortFields.vue, LocalTuningFields.vue, LocalVisibilityToggle.vue, LocalNotesField.vue
      └ LocalDeviceActions.vue
  SerialFlashPanel.vue + SerialFlashConfirmDialog.vue
  ConfigTransferPanel.vue (ConfigExportButton, ConfigImportForm)
  HotspotPanel.vue (HotspotStatusSummary, HotspotSettingsForm, HotspotClientsTable, HotspotRollbackBanner)
  ConsolePasswordPanel.vue      LocationMissingNotice.vue
```

**`@sentinel/sdr-manager-remote`** (`services/sdr-manager-remote/frontend/src/`) provides group **REMOTE SDR HOSTS**. Its components move here from `services/sections/sdr/frontend/src/settings/` and are renamed:
```
register.ts                          api/sdrManagerRemoteApi.ts (/api/sdr-manager/remote)
components/
  RemoteHostsControl.vue    (was SentryHostsControl; lists the local row as "This machine", no delete)
  RemoteHostForm.vue        (was SentryHostForm)
  RemoteHostDetails.vue     (was SentryHostDetails)
  RemoteHostSiteMap.vue     (was SentrySiteMap)
  RemoteHostDeviceRow.vue   (was SdrSentryDeviceRow), RemoteHostGroupHeader.vue (was SdrHostGroupHeader)
  LocalNotEnabledNotice.vue (full mode with no sdr-manager-local: how to enable, with a docs link)
```

**What changes elsewhere in the UI:**
- **Notice placement.** `LocalNotEnabledNotice` belongs to the remote package, because it must show exactly when the local container is absent.
- **SDR section.** It keeps radios: `SdrDevicesControl.vue`, `SdrRadioRow.vue` and manual radios. Host groups link to Settings › SDR Manager.
- **The `radioSites` capability** moves from the SDR section to `sdr-manager-remote`, because it owns host and site data.
  - `sdrManagerSites` and `SdrManagerSitesControl` read it through `getCapability`.
  - Air's `AdsbSdrSourceControl` reads it through `getCapability('radioSites')`, which is unchanged.
  - Device and host types go into `@sentinel/shell-api/types/sdrManager.ts`. This way no section imports another.
- **Settings store.** `openSentryHost` and `focusSentryHostId` become `openSdrManagerHost` and `focusSdrManagerHostId`, and route to `/settings/sdr-manager`.

**SDR Manager-only shell.**
- `frontend/vue/src/main.ts` fetches `/api/app/mode`.
- `SdrManagerOnlyShell.vue` shows a skip link, a header with a mode badge, and `SettingsPanel` pinned to `sdr-manager` plus a trimmed `app` section (Location, General). Settings items gain an optional `modes?: AppMode[]` for the trim.
- No map, rail or radio pane, and no MapLibre chunk.
- The router redirects to `/settings/sdr-manager`.

**Accessibility (WCAG 2.2 AA) and layout:**
- Labelled inputs, with `aria-describedby` errors and focus moved to the first invalid field.
- An `aria-live` region announces changes.
- Confirm dialogs trap focus.
- Single column, mobile-first.

## `.env.example`

- **Style:** the file's existing one, with banners and a plain-English comment above every variable.
- **Each comment covers:** what the variable does, each allowed value, the default, which recipe it applies to, and what to run after changing it.
- **No safe default:** the variable stays commented out, with an example value.
- **Top of file:** a new "Choose your setup" block lists recipes 1–5 as copy-paste lines.
- **Grouping:** `SDR_MANAGER_LOCAL_*` variables are grouped as Network, Devices, Paths, Wi-Fi hotspot (Linux only) and Mac. `SDR_MANAGER_REMOTE_*` variables (poll interval, backoff, timeouts) are mostly commented-out advanced options.
- **Parity test:** every field in both packages' `config.py` must appear in the file.

Draft:
```dotenv
# ── Choose your setup ─────────────────────────────────────────────────────────
# Pick ONE recipe, set its lines, then run `docker compose up -d`.
#  1. Sentinel — manage SDRs on other machines only ........ change nothing
#  2. Sentinel + SDRs plugged into this Linux computer ..... COMPOSE_PROFILES=sdr-manager-local
#  3. SDR Manager only, lightweight (Linux / Raspberry Pi) . COMPOSE_FILE=compose.sdr-manager-local-only.yaml
#                                                            COMPOSE_PROFILES=sdr-manager-local
#  4. Sentinel + SDRs plugged into this Mac ................ SDR_MANAGER_LOCAL_NATIVE=1
#  5. SDR Manager only, lightweight, on a Mac .............. COMPOSE_FILE=compose.sdr-manager-local-only.yaml
#                                                            SDR_MANAGER_LOCAL_NATIVE=1
# On a Mac (4, 5) also run `uv run sdr-manager-local install` once —
# docs/sdr-manager-mac.md walks you through it.

# Which compose file Docker Compose reads (read by Docker Compose itself).
# Leave commented out for the full app.
#   compose.sdr-manager-local-only.yaml   SDR Manager only: no map or sections
# COMPOSE_FILE=compose.sdr-manager-local-only.yaml

# (existing COMPOSE_PROFILES comment gains:)
#   sdr-manager-local   manage SDRs plugged into this computer, in a container —
#                       Linux only; combine with decoders, e.g. sdr-manager-local,adsb

# Mac only: manage this Mac's SDRs with a Mac app instead of a container.
#   0  off (default)
#   1  on — also writes its sign-in files to ./sdr-manager-local-credentials
SDR_MANAGER_LOCAL_NATIVE=0

# ── SDR Manager: this machine's SDRs (sdr-manager-local) ──────────────────────
# The port it listens on — for this Sentinel AND for other Sentinels using or
# managing this machine's SDRs. Change only if 8000 is taken.
SDR_MANAGER_LOCAL_HTTP_PORT=8000
# … every SDR_MANAGER_LOCAL_* variable in this pattern

# ── SDR Manager: SDRs on other machines (sdr-manager-remote) ──────────────────
# How often each remote SDR host is checked, in seconds.
# SDR_MANAGER_REMOTE_POLL_INTERVAL_S=5
# … every SDR_MANAGER_REMOTE_* variable in this pattern
```

## Documentation

These go in the repo and in the in-app Docs (`docs/nav.json`), with screenshots.

**New pages:**

| Page | Contents |
|---|---|
| `docs/use/sdr-manager.md` (new group "SDR Manager") | **This machine:** devices, ports, tuning, visibility, enable, forget, serial flash, config, hotspot, console password, location. **Remote SDR hosts:** add, edit, details, site map. Plus how devices become radios, and how to share this machine with other Sentinels. |
| `docs/sdr-manager-mac.md` | Beginner Mac guide (below) |
| `docs/sdr-manager-linux.md` | Linux and Pi: DVB driver blacklist, `usbfs_memory_mb`, powered hubs, recipes 2 and 3 |
| `docs/sdr-manager-local-only.md` | The lightweight mode |
| `docs/adr/0007-sdr-manager.md` | Two containers, hub split, Mac-native exception, privileged image, settings-section sharing |

**Updated pages:**
- `install.md`
- `configuration.md`
- `hardware.md`
- `radio-host.md`
- `reference/ports-and-services.md`
- `use/settings.md`
- the SDR use pages
- `troubleshooting.md`
- `architecture/{radios,bus-and-security}.md`
- `development/code-map.md`
- `README.md`, plus each new service's README, all with Docker and non-Docker commands

Every item gets a `docPath`. `check:doc-links` must pass.

## Beginner Mac guide (`docs/sdr-manager-mac.md`)

Written for someone who has never used Terminal:
- one action per step, with screenshots;
- copy-box commands;
- every step ends with "You should see…";
- a glossary.

A non-technical tester completes it on clean Apple-silicon and Intel Macs before release.

**Steps:**
1. Check the macOS version and chip.
2. Install Docker Desktop, and wait for "Engine running".
3. Open Terminal.
4. Install Homebrew. The password doesn't show while you type it; then run its "next steps".
5. `brew install librtlsdr uv git`
6. Plug in the dongle, then run `rtl_test -t`. You should see "Found 1 device(s)".
7. `git clone … ~/Sentinel`
8. `cp .env.example .env`, then `open -e .env`. Apply recipe 4 or 5.
9. `docker compose up -d`
10. `cd services/sdr-manager-local/backend && uv run sdr-manager-local install`
11. `uv run sdr-manager-local status`. Every line is ticked.
12. Open http://localhost:8080, then Settings › SDR Manager. The dongle is listed under THIS MACHINE.
13. Set a console password.
14. Name and enable the device. You should see "Streaming".
15. Set Sentinel Location.

**The guide also covers:** everyday use, updating, removing, and troubleshooting by symptom.

## Files

**New:**
- `services/sdr-manager-local/`:
  - `Dockerfile`, `README.md`
  - `backend/sentinel_sdr_manager_local/…`: `service.py`, `manifest.py`, `config.py`, `container.py`, `contract_app.py`, `models.py`, `database.py`, `location_source.py`, `service_auth.py`, `cli.py`, `launch_agent.py`, `adapters/macos/*`, the ported Sentry layers, and `relay/rtl_tcp_relay.py`
  - `frontend/…`
- `services/sdr-manager-remote/`:
  - `README.md`
  - `backend/sentinel_sdr_manager_remote/…`: `service.py`, `manifest.py`, `config.py`, `models.py`, `database.py`, `local_link.py`, and `services/{sdr_manager_client,host_poller,reservations}.py`, `routers/hosts.py`
  - `frontend/…`
- `platform/web/ui/src/sdr/*`, `platform/web/shell-api/src/types/sdrManager.ts`
- `frontend/vue/src/shell/{SdrManagerOnlyShell.vue,appMode.ts}`, `backend/core/app_mode.py`
- `compose.sdr-manager-local-only.yaml`, `compose.sdr-manager-local-mock.yaml`
- The docs pages listed above, plus `docs/plans/sdr-manager.md` (this spec)
- `tests/contract/sdr_manager_api/`

**Modified:**

| Area | Files |
|---|---|
| Platform | `service_manifest.py:100` (two new kinds), `sdk/__init__.py`, `service_access.py`, `nats_permissions.py` (new user; Air's request permissions; hub subscriptions), the credentials scripts |
| Core | `app.py`, `config.py`, `app_sections.py`, `registry_router.py` |
| Shared UI | `settingsRegistry.ts` (identical re-registration), `capabilities.ts`, `stores/sentrySites.ts` → `sdrManagerSites.ts`, `stores/settings.ts`, map-kit `controls/sentry-sites/*` → `controls/sdr-manager-sites/*` |
| Hub (`services/radio`) | Remove the Sentry model, client, poller, reservations and router. `module.py`/`service.py`/manifest; `device_claims.py` (claim events); `radios.py` (snapshot request); `database.py` |
| Air | `adsb_source.py`, `adsb_source_router.py` (subjects), tests |
| SDR section | `settings.ts`, moved components removed, `section.ts` (`radioSites` provided elsewhere), `services/sentryApi.ts` removed, `stores/sdr.ts` field renames |
| Settings | `backend/default_config.json` (renamed fields) |
| Build | `backend/pyproject.toml` (two path sources, import-linter isolation), `backend/Dockerfile:85-114`, `docker-bake.hcl`, root `package.json` workspaces |
| Compose | `docker-compose.yml`: `sdr-manager-remote`; profiled `sdr-manager-local`; both volumes; `extra_hosts`; credentials bind; drop `extra_hosts` from `radio` if nothing else needs it. Also `compose.radio-host.yaml` and `.gitignore`. |
| Decoder | `decoder/adsb/entrypoint.py` (env rename) |
| CI | `ci.yml`: gateway-smoke rows `local-only (mock)`, `full+local-mock` and `full, no local`; `sdr-manager-local` bake job |
| Tests | Hub Sentry tests move to `sdr-manager-remote`; parity goldens; `e2e/sentry-sites.spec.ts` → `sdr-manager-sites.spec.ts`, `mockApi.ts` |

## Configuration

| Owner | Variables |
|---|---|
| `sdr-manager-local` | `SDR_MANAGER_LOCAL_` + HTTP_HOST/PORT, ADVERTISED_HOST, MAX_DEVICES, INTERNAL_PORT_BASE, RESERVED_PORTS, SYSFS_ROOT, RECONCILE_INTERVAL_S, RTL_TCP_PATH, RTL_EEPROM_PATH, RELAY_PATH (must stay inside the package), HOTSPOT_*, NMCLI_*, NM_STATE_ROOT, CORS_ORIGINS, HARDWARE, LOCATION_REFRESH_S, LIBRTLSDR_PATH, NATIVE |
| `sdr-manager-remote` | `SDR_MANAGER_REMOTE_` + POLL_INTERVAL_S, POLL_BACKOFF_START_S, POLL_BACKOFF_MAX_S, LOCATION_REFRESH_S, CONNECT_TIMEOUT_S, READ_TIMEOUT_S, LOCAL_LINK_INTERVAL_S |
| Core | `SENTINEL_MODE`, set by the compose file, not by the user |
| Compose | `COMPOSE_FILE`, `COMPOSE_PROFILES` |

## Security

- **Privilege:** only `sdr-manager-local` is privileged, and only in its opt-in image and profile. `sdr-manager-remote` is unprivileged like the other sections.
- **Exposed ports:** `:8000` plus the per-dongle ports.
  - The UI warns until a console password is set.
  - The docs recommend a firewall.
  - `/api/v1/sdrs` is unauthenticated by design, and that's documented.
- **Service bearer:** only `sdr-manager-remote` may use it. It is checked by hash and never logged.
- **NATS:** each new user gets least-privilege subjects. The hub can no longer answer reservations.
- **Validation:** Sentry's existing validation of config import and EEPROM flash stays, plus confirmation in the UI. 422 errors stay redacted.

## Delivery (one feature branch and PR each, Conventional Commits)

| # | PR |
|---|---|
| 1 | `docs(adr): 0007 SDR Manager`: ADR + this spec |
| 2 | `feat(platform): sdr-manager kinds, serve-before-core, app mode, shared settings section`: manifest kinds, SDK opt-in, `/api/app/mode`, registry listing, `UI_REMOTE_KINDS`, settings-registry change, access and NATS entries, goldens |
| 3 | `feat(sdr-manager-local): port Sentry backend`: pure move, `create_all` instead of Alembic, location from core, two mounts, SDR Manager API rename (headers and cookie), image + bake, mock compose |
| 4 | `refactor(sdr-manager-remote): move remote host management out of the radio hub`: new service, hub trimmed, claim events, Air subjects, moved tests, contract suite against `sdr-manager-local` (mock) |
| 5 | `feat(sdr-manager-remote): link this machine`: local link, bearer, 409s |
| 6 | `refactor(ui): SDR Manager settings section`: remote-hosts screens moved into `@sentinel/sdr-manager-remote`, `radioSites` capability moved, shared components and types |
| 7 | `feat(sdr-manager-local): this-machine screens`: devices, serial flash, config, hotspot, console password, notices |
| 8 | `refactor: rename remaining sentry identifiers`: `sdr.radios` fields, range-ring origin, stores, map-kit control, decoder env, e2e |
| 9 | `feat(sdr-manager-local): macOS native mode` |
| 10 | `feat: SDR Manager-only mode`: compose file, shell, CI matrix |
| 11 | `docs: SDR Manager guides and .env recipes`, including the beginner tester pass |

**Follow-ups:**
- Fix Sentry's known gaps: `bias_tee` and `direct_sampling` to rtl_tcp, the `degraded` state, client counts, and identity/hotplug/registry tests.
- Optional: a hotspot UI for remote hosts.
- The RECON rename, as its own project.

**Retiring Sentry:** after PR 10 and a Pi soak, add a README notice to the Sentry repo and archive it.

## Test plan (written at commit/push time, after you confirm)

- **`sdr-manager-local`:**
  - Sentry's tests, ported.
  - The two mounts return identical responses.
  - Bearer: a valid token, the wrong caller, and a missing access flag.
  - Location: blank, cached, and core down.
  - Seeding is idempotent.
  - It still serves with core down.
  - 100% coverage gate.
- **`sdr-manager-remote`:**
  - The hub's Sentry tests, moved and renamed.
  - Local link: insert, idempotent, disable without deleting.
  - Bearer mode never calls login.
  - 409 on the local row; the unique local index holds.
  - Each reservation subject, including bad payloads.
  - Claim events are published.
  - Snapshot replies.
- **Hub:**
  - Claim events update `device_claims`, so the hub still yields to a claimed dongle.
  - Device availability with the snapshot reply, a timeout, and no remote service.
  - Its routes no longer include sentry-hosts.
- **Air:** the claim flow on the new subjects. Negative case: the hub user can no longer reply on reservation subjects.
- **Contract suite:** the real `SdrManagerClient` against `sdr-manager-local` in fake mode. It covers every method, error envelope, header and SSE frame.
- **Core:**
  - `/api/app/mode`.
  - The registry listing endpoint's auth.
  - `app/sections` returns both kinds and excludes the radio hub's kind.
  - Identical settings re-registration is accepted; a conflicting one throws.
  - Goldens.
- **Frontend:**
  - 100% vitest per package, with role queries and jest-axe per component.
  - Group visibility in every combination of the two containers.
  - SSE reconnect and dispose.
  - Moved components keep their behaviour.
  - The capability moved.
  - The map link goes to SDR Manager.
- **E2E:**
  - `local-only (mock)`: lands on `/settings/sdr-manager`, THIS MACHINE only, no map chunk.
  - `full+local-mock`: both groups; add a local device as a radio; an ADS-B claim works.
  - `full, no local`: REMOTE SDR HOSTS plus the not-enabled notice.
  - A keyboard-only pass.
- **macOS:**
  - ioreg against fixtures.
  - dylib lookup.
  - LaunchAgent install and remove (temporary HOME).
  - `status` and `doctor` failure output.
- **Other:** `.env.example` parity. amd64 and arm64 bakes, plus an `rtl_tcp -h` smoke test.

## Manual verification

1. **Linux, recipe 2, with a dongle.** It appears under THIS MACHINE. Enable it, then check SDR++ receives on port P.
2. **Remote hosts on the same box.** Add a Pi under REMOTE SDR HOSTS. Add devices from both as radios and tune them. Claim the local device for ADS-B; the decoder gets data, and the hub refuses to retune that device.
3. **Local-device features.** Serial flash, config export and import, and the hotspot rollback and confirm.
4. **Pi, recipe 3.**
   - Only `app`, `gateway` and `sdr-manager-local` run, and the UI shows THIS MACHINE only.
   - Another Sentinel adds `<pi>:8000` and can use and manage it.
   - The Pi's location shows on that Sentinel's map.
5. **Core down on the Pi.** Stop `app`; the API still answers and streaming continues.
6. **Recipe 1.** REMOTE SDR HOSTS shows with the not-enabled notice. Disabling the SDR section doesn't hide host management.
7. **Stop `sdr-manager-remote`.** The hub keeps streaming. Availability shows "unknown" and nothing crashes.
8. **Mac.** Follow `docs/sdr-manager-mac.md` word for word. A non-technical tester completes it unaided.

## Risks and open items

- **Hub split (PR 4).** It's the biggest change. Leases now span two services, and the order of claim events matters. Mitigations:
  - the claim TTL already bounds stale state;
  - the hub falls back to "unclaimed" only when a claim expires;
  - the e2e ADS-B claim test gates the PR.
- **SDK change.** Opt-in, off by default.
- **Firewalls** can block traffic from containers to `host-gateway`. Documented, with clear logging.
- **arm64 librtlsdr builds** are slow, so the build stage is cached.
- **macOS.**
  - Hotplug is poll-only, with a ~2 s delay.
  - `locationID` changes if a dongle moves USB port.
  - Homebrew's librtlsdr build differs from Linux's; `doctor` reports its version.
- **Verify during the build.**
  - Caddy SSE buffering on `/api/sdr-manager/local/events`.
  - The cookie path across the two mounts.
  - How `extends` handles `depends_on`.
