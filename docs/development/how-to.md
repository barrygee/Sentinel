# How to…

Short recipes for the changes people make most often. Each one lists every file to touch and links to the page that explains why. The recipes don't cover tests; the standard every change must meet is in [Run tests and quality checks](testing.md).

## Add a setting

1. **Give it a default** in `backend/default_config.json`, under its section's namespace. That seeds the database on first start and fixes the key's place in the config file; without it the setting is missing from `sentinel_config.json` until someone first saves it.
2. **Add its row** to the section's `frontend/src/settings.ts` with `registerSettingItems`: a `label` exactly as the UI should show it, a `desc`, `searchTerms` for Settings search, and a `control`.
3. **Build the control** from the settings kit in `@sentinel/shell-api/settings/` (`BaseToggleSetting`, `BaseNumberSetting`, `useStagedSetting` and others). The control must **stage** its change and save only on **APPLY CHANGES**; a control that saves at once leaves APPLY CHANGES saying "NO CHANGES", which looks broken.
4. **Apply it to the section's state** when settings load: register a hydrator with `registerSettingsHydrator` (`@sentinel/shell-api/shell/settingsHydration`), as Air and Land do in their `section.ts`.
5. **Read it again on `sentinel:config-uploaded`** anywhere it is read once (on mount, at start). APPLY CHANGES and config-file edits refresh settings in place, with no page reload, so a value read once goes stale.
6. **On the backend**, read it through the settings client (`backend/platform/settings_client.py`), never from the `user_settings` table: settings belong to core. See [Data stores](../architecture/data-stores.md#settings-belong-to-core).
7. **If it is a secret** (a key or password), add it to `SECRET_SETTING_KEYS` in `backend/services/app_config.py`, so it is never shown, exported or written to the config file, and give the service that needs it access in `backend/platform/service_access.py`. See [Security](../architecture/security.md#secrets).
8. **Document it** in that section's page under **Settings**, in `docs/use/`.

## Add an API route to a section

Add it to the section's `router.py`. If it starts with a path prefix the section doesn't serve yet, add the prefix to the manifest's `routes` in `module.py`; the gateway picks it up when the service next registers. See [Backend code](../architecture/backend.md#adding-to-the-backend) and [Gateway and routing](../architecture/gateway.md#longest-prefix-wins).

## Add a map control

Map features are controls, not code inside a view. Make a folder `services/sections/<id>/frontend/src/controls/<feature>/` with a class that extends `SentinelControlBase` from `@sentinel/map-kit`, and add the control in the section's map component. If several sections' maps need it, put it in `platform/web/map-kit/src/controls/` instead.

A map is opaque to screen readers, so give the control an accessible name and keyboard operation, and make sure what it shows can also be reached as text. Every font a map layer uses must have its glyphs bundled under `frontend/assets/fonts/`, because maps work offline.

## Add an event-bus subject

Publish or subscribe in code, then add the subject to `backend/platform/nats_permissions.py` and restart `nats`. Without the entry the broker refuses it. The steps are in [Event bus](../architecture/event-bus.md#adding-a-subject).

## Add a decoder kind

A new decoder needs no radio hub code: it registers a manifest and the hub runs a bridge for it. You do need a row in `service_access.py`, a compose service with its credentials mounted, and somewhere for its events to go. The steps are in [Decoding](../architecture/decoding.md#adding-a-new-decoder-kind); `decoder/stub/` is a working template.

## Add a section

A section touches many files, so copy the smallest existing one (Space) and change its names. Then wire it in at each of these places. `git grep -n sentinel_space` and `git grep -n section-space` find every one:

| Where | What to add |
|---|---|
| `services/sections/<id>/backend/` | The package `sentinel_<id>`: `router.py`, `services/`, `models.py`, `database.py`, `module.py` (lifecycle and manifest), `service.py`, and `tests/` |
| `services/sections/<id>/frontend/` | The package `@sentinel/section-<id>`, with `src/section.ts` registering it with the shell |
| `backend/pyproject.toml` | The package as a dependency and a path source; its name in import-linter's `root_packages` and in each contract |
| `backend/Dockerfile` | A `COPY` of its `pyproject.toml` (for the lockfile check) and of its folder |
| `docker-compose.yml` | Its service, on the shared section anchors, with its own data volume, a live-reload mount of its backend folder and a mount of `credentials/<id>/` |
| `backend/platform/service_access.py` | A row, so it can register |
| `backend/platform/nats_permissions.py` | A row for its NATS user, with the subjects it uses |
| `conftest.py` | An import of its models |
| `tests/in_process_app.py` | Its router, lifecycle and manifest, so the backend tests cover it |
| `frontend/vue/package.json` | The section package as a dependency |
| `frontend/vue/src/shell/sections.ts` | An entry, in menu order |
| `.github/workflows/ci.yml` | The service in the full-stack smoke job's list |
| `docs/use/<id>.md` and `docs/nav.json` | Its user page, in the standard layout |

Then run `uv lock --project backend` and `npm install` from the root, and rebuild the image. Why sections are built this way is in [ADR 0006](../adr/0006-section-containers.md).

## Ship a frontend change

What Sentinel serves is the committed `frontend/spa-dist/`, so a frontend change isn't live until it is rebuilt and committed:

1. `cd frontend/vue && npm run build`
2. Run the e2e suite, which tests that build: `npm run test:e2e`.
3. Commit `frontend/spa-dist/` in its own commit, after the change itself (for example `build(spa): rebuild the bundle with …`).

## Add or change a docs page

1. Write the page in `docs/`, in the style of the pages around it. A page about using a section follows the layout in [Air](../use/air.md): what it's for, start it, before you start, using it, off grid, settings, troubleshooting.
2. Add it to `docs/nav.json`, or it has no place in the menu.
3. Run `npm run check:doc-links`. It fails on a link to a missing page or heading.
4. Rebuild and commit `frontend/spa-dist/`, because the docs are bundled into the app. For the running stack to show it, run `docker compose up --build -d`.

Screenshots come from a script; see [Frontend](../architecture/frontend.md#screenshots-in-these-docs).
