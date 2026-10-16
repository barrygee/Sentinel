# Find your way around the code

Every top-level folder, what is in it, and where to go to change something. How the parts work together is in [System overview](../architecture/overview.md).

## Where to go to change…

| To change | Go to |
|---|---|
| What a section shows or does in the browser | `services/sections/<id>/frontend/src/` |
| A map feature (a layer, a button on the map) | `services/sections/<id>/frontend/src/controls/<feature>/`, or `platform/web/map-kit/src/controls/` if several maps share it |
| A section's API or background work | `services/sections/<id>/backend/sentinel_<id>/` |
| Anything that talks to a radio: tuning, the waterfall, audio, decoding | `services/radio/backend/sentinel_radio/` |
| Settings storage, the config file, alerts, offline maps | `backend/core/`, `backend/routers/`, `backend/services/` |
| The page frame: menu, sidebar, Settings panel, alerts bell | `frontend/vue/src/` |
| A button, field or panel used in many places | `platform/web/ui/src/` |
| A setting's default value | `backend/default_config.json` |
| Which containers run, their ports and volumes | `docker-compose.yml` |
| A decoder | `decoder/<kind>/` |
| These docs | `docs/`, and `docs/nav.json` for the menu |

## Top level

| Folder or file | What it is |
|---|---|
| `backend/` | Core (the `app` service) and the shared Python platform every service is built on. Also the backend's `pyproject.toml`, its lockfile and the one `Dockerfile` every Python service runs from. |
| `services/sections/<id>/` | One folder per section (`air`, `space`, `sea`, `land`, `sdr`), each with a `backend/` and a `frontend/`. |
| `services/radio/backend/` | The radio hub. It has no frontend: the radio panels are the SDR section's. |
| `frontend/vue/` | The shell: the Vue app that loads in the browser and hosts every section. |
| `frontend/spa-dist/` | The built app, **committed**, because it is what Sentinel serves. Rebuild it with `cd frontend/vue && npm run build`. |
| `frontend/assets/` | Map tiles, sprites and fonts the maps use offline. |
| `frontend/scripts/` | The script that generates the light map style from the dark one. |
| `platform/web/` | Shared frontend packages (see below). |
| `decoder/` | The decoder containers: voice in `decoder/` itself, then `aprs/`, `ais/`, `adsb/` and `stub/`. |
| `gateway/` | Caddy's static config: `caddy.json` for the main computer, `radio-host-caddy.json` for a radio host. |
| `tests/` | Backend tests (`tests/backend/`), the full-stack browser tests (`tests/e2e/`) and the all-in-one app the backend tests run (`in_process_app.py`). Each section's own backend tests are in its `backend/tests/`. |
| `scripts/` | Repo tooling: the docs link check and the script that runs a command in every web package. |
| `docs/` | These docs. `docs/plans/` holds working design notes and isn't shown in the app. |
| `.github/workflows/` | CI (`ci.yml`) and the changelog job (`changelog.yml`). |
| `docker-compose.yml` | Every container on the main computer. |
| `compose.radio-host.yaml` | The containers on a [radio host](../radio-host.md). |
| `docker-bake.hcl` | Builds images for several kinds of computer at once. |
| `conftest.py`, `pytest.ini` | Backend test set-up. |
| `package.json` | The npm workspace root: one install for every frontend package, plus root tooling. |
| `CLAUDE.md` | Notes for the AI assistant; much of it is the same ground as these docs, in short form. |
| `CHANGELOG.md` | Written automatically from commit messages. Don't edit it. |

## Inside `backend/`

| Folder | What it is |
|---|---|
| `backend/core/` | What only core does: the service registry, gateway sync, alerts, serving the shell, internal sign-in checks. |
| `backend/platform/` | What every service shares: the event bus, settings client, lifecycles, credentials, TLS. `backend/platform/sdk/` builds a section service. |
| `backend/modules/` | Core's own lifecycles (`bus`, `core`). |
| `backend/routers/` | Core's HTTP routes: settings, offline maps. |
| `backend/services/` | Core's work: the config file, offline map downloads. |
| `backend/data/` | Starting data (band plan, satellite frequencies, UK repeaters) and, at run time, `sentinel_config.json`. |
| `backend/scripts/` | One-off and maintenance scripts, such as creating credentials and refreshing the repeater list. |
| `backend/main.py` | Core's entry point. |
| `backend/config.py` | Every backend setting with its default. |

## Inside a section

Each section follows the same layout. For `sea`:

| Path | What it is |
|---|---|
| `backend/sentinel_sea/router.py` | Its HTTP routes |
| `backend/sentinel_sea/services/` | Its work: feeds, stores, background loops |
| `backend/sentinel_sea/models.py`, `database.py` | Its tables, and how they are created and seeded |
| `backend/sentinel_sea/module.py` | Its lifecycle and its manifest (the paths it serves) |
| `backend/sentinel_sea/service.py` | The service's entry point |
| `backend/tests/` | Its backend tests |
| `frontend/src/section.ts` | How it registers with the shell: menu entry, route, settings, sidebar |
| `frontend/src/SeaView.vue` and the other components beside it | Its page and panels |
| `frontend/src/controls/`, `stores/`, `settings/`, `settings.ts` | Its map controls, state, and settings rows |

## Shared frontend packages

| Package | Folder | What it is |
|---|---|---|
| `@sentinel/ui` | `platform/web/ui/` | Buttons, fields, panels, icons. Depends on nothing but Vue. |
| `@sentinel/shell-api` | `platform/web/shell-api/` | What the shell offers sections: registries, capabilities, the shared stores and the settings kit. |
| `@sentinel/map-kit` | `platform/web/map-kit/` | The map component, shared map controls and map helpers. |
| `@sentinel/web-config` | `platform/web/config/` | Shared TypeScript, lint, format and test config. |

`ui`, `shell-api` and `map-kit` each depend only on the ones before them, and no package imports a section. A section imports only these packages and its own files. Lint enforces both. More in [Frontend](../architecture/frontend.md).
