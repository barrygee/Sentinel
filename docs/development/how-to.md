# How to…

Recipes for the usual changes. Tests and checks: [Testing](testing.md).

## Add a setting

1. Default in `backend/default_config.json`, under its namespace.
2. Row in the section's `frontend/src/settings.ts` (`registerSettingItems`: `label`, `desc`, `searchTerms`, `control`).
3. Control from `@sentinel/shell-api/settings/` that **stages** until **APPLY CHANGES**.
4. Apply it to state with `registerSettingsHydrator` in `section.ts`.
5. Re-read on `sentinel:config-uploaded` wherever it is read once.
6. Backend: read through the settings client, never `user_settings`.
7. A secret: add it to `SECRET_SETTING_KEYS` (`backend/services/app_config.py`) and give its service access in `service_access.py`.
8. Add it to the section's **Settings** table in `docs/use/`.

## Add an API route

Add it to the section's `router.py`. A new prefix also goes in the manifest's `routes` (`module.py`).

## Add a map control

A class extending `SentinelControlBase` in `services/sections/<id>/frontend/src/controls/<feature>/` (or `map-kit` if shared). Give it an accessible name and keyboard use, and make what it shows reachable as text. Bundle any font's glyphs under `frontend/assets/fonts/`.

## Add a bus subject or decoder kind

- Subject: [Event bus](../architecture/bus-and-security.md#event-bus).
- Decoder: [A new decoder kind](../architecture/radios.md#a-new-decoder-kind).

## Add a section

Copy Space and rename. `git grep -n sentinel_space` and `git grep -n section-space` find every place to wire in:

- `services/sections/<id>/backend/` and `frontend/`
- `backend/pyproject.toml` (dependency, path source, import-linter), `backend/Dockerfile` (two `COPY`s)
- `docker-compose.yml` (service, volume, code mount, credentials mount)
- `service_access.py`, `nats_permissions.py`, `conftest.py`, `tests/in_process_app.py`
- `frontend/vue/package.json`, `frontend/vue/src/shell/sections.ts`
- `.github/workflows/ci.yml` (smoke job), `docs/use/<id>.md`, `docs/nav.json`

Then `uv lock --project backend`, `npm install`, and rebuild the image.

## Ship a frontend change

1. `cd frontend/vue && npm run build`
2. `npm run test:e2e`
3. Commit `frontend/spa-dist/` separately: `build(spa): …`

## Add or change a docs page

1. Follow the [Air](../use/air.md) page: one-line summary, **Features**, short how-to, off grid, **Settings**, tips, **If it's not working**.
2. Add it to `docs/nav.json`.
3. `npm run check:doc-links`.
4. Rebuild and commit `frontend/spa-dist/`; `docker compose up --build -d` for the live stack.

Diagrams: put each mode's nodes in a subgraph titled `ONLINE` or `OFF GRID` and give it `class <id> online` or `offgrid`.

Screenshots come from a script, at twice screen resolution: `cd frontend/vue && npm run build && npm run docs:screenshots` (needs internet for map tiles; add `PLAYWRIGHT_CHANNEL=chrome` if Playwright's browser isn't installed).
