# Code map

Where things are, and the rules about who may import whom.

## Where to change…

| To change | Go to |
|---|---|
| A section in the browser | `services/sections/<id>/frontend/src/` |
| A map feature | `…/frontend/src/controls/<feature>/`, or `platform/web/map-kit/src/controls/` if shared |
| A section's API or background work | `services/sections/<id>/backend/sentinel_<id>/` |
| Anything touching a radio | `services/radio/backend/sentinel_radio/` |
| Settings storage, config file, alerts, offline maps | `backend/core/`, `backend/routers/`, `backend/services/` |
| The page frame, Settings, Docs | `frontend/vue/src/` |
| A shared button, field or panel | `platform/web/ui/src/` |
| A setting's default | `backend/default_config.json` |
| Containers, ports, volumes | `docker-compose.yml` |
| A decoder | `decoder/<kind>/` |
| These docs | `docs/`, menu in `docs/nav.json` |

## Backend

| Package | Holds |
|---|---|
| `backend.core` | Core only: app factory, registry, gateway sync, alerts, internal auth, SPA serving |
| `backend.platform` | Shared: event bus, lifecycles, service SDK (`create_service()`), settings client, credentials |
| `backend.routers`, `backend.services` | Core's settings and offline-map routes and work |
| `sentinel_<id>` | A section: `router`, `services/`, `models`, `database`, `module` (lifecycle + manifest), `service`, `tests/` |
| `sentinel_radio` | The radio hub, same layout |

- **Nothing in `backend` imports a section**; core never even loads their code (`tests/backend/test_core_entry_point.py`). No section imports another. import-linter gates both.
- Only `tests/in_process_app.py` imports everything, for the backend tests.
- Core's entry is `backend/main.py` → `create_core_app()`. Every browser file must sit under one of its mounts (`/assets`, `/spa-assets`, `/fonts`, `/remotes`); anything else falls through to `index.html`.
- **Lifecycles:** every `prepare` runs before any `start`; `stop` in reverse; `wake` on SIGTERM first. Don't remove the wake chain: long-lived sockets deadlock `--reload` without it.

## Frontend

| Package | Holds |
|---|---|
| shell (`frontend/vue/`) | App, router, menu, sidebar, footer, Settings, Docs, section loading |
| `@sentinel/ui` | `Base*` components, icon rail, overlays. Depends only on Vue |
| `@sentinel/shell-api` | Registries, capabilities, shared stores, the settings kit |
| `@sentinel/map-kit` | `MapLibreMap.vue`, `SentinelControlBase`, shared controls |
| `@sentinel/web-config` | Shared TS, ESLint, Prettier, Vitest config |
| `@sentinel/section-<id>` | One section's UI and `src/section.ts` |

- Direction: `ui` ← `shell-api` ← `map-kit` ← sections ← shell. A section never imports another or the shell (`noSectionImports`). Only `frontend/vue/src/shell/sections.ts` imports sections.
- Packages use relative imports, never `@/`.
- **Boot:** fetch settings and `/api/app/sections`, load each remote (`/remotes/<id>/remoteEntry.js`), call each `register()`, apply settings, start the SDR engine, mount. A failed remote gets a stand-in; the rest carry on.
- **Dev and tests** import sections directly (no federation); the production build swaps in `sections.federated.ts`.
- A section plugs in through `sectionRegistry`, `settingsRegistry`, `settingsHydration`, `sidebarRegistry`, `footerRegistry`, `notificationRegistry`, `backgroundServices`, and capabilities (`radio`, `radioSites`).
- State that must survive a remount (open pane, tab) belongs in a store.
- Every map feature is a `SentinelControlBase` control, and every map has a **FILTER** list as its accessible equivalent.

## Top level

`backend/`, `services/`, `frontend/vue/`, `frontend/spa-dist/` (built, **committed**), `frontend/assets/` (tiles, sprites, fonts), `platform/web/`, `decoder/`, `gateway/`, `tests/` (backend and full-stack e2e), `scripts/`, `docs/` (`docs/plans/` isn't shown in the app), `.github/workflows/`, `docker-compose.yml`, `compose.radio-host.yaml`, `docker-bake.hcl`. `CHANGELOG.md` is generated: don't edit it.
