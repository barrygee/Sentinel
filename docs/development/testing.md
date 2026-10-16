# Run tests and quality checks

CI runs every check on this page on each pull request and on every push to `main`, and all of them must pass. Run them yourself before you push, so the pull request goes green first time. The pre-commit hook formats and lints the files you stage, but it doesn't run tests or type checks.

Run each command from the repo root unless it starts with `cd`.

## Backend

```bash
uv run --project backend ruff check backend services/sections services/radio           # lint
uv run --project backend ruff format --check backend services/sections services/radio  # formatting
PYTHONPATH=. uv run --project backend lint-imports --config backend/pyproject.toml     # import boundaries
uv run --project backend pytest                                                        # tests
uv run --project backend pytest tests/backend/test_routers_air.py::test_name           # one test
```

- **Fix formatting** with `uv run --project backend ruff format backend services/sections services/radio`. ruff is the only Python formatter; its lint rules are deliberately few (`E,F,I,UP,B`).
- **Import boundaries** keep the sections apart: no part of `backend` may import a section, and no section may import another. Sections talk over the [event bus](../architecture/event-bus.md) instead.
- **The tests need no Docker.** They run one all-in-one app, `tests/in_process_app.py`: core given every section's and the radio hub's routes, lifecycles and manifests, in a fixed order that the parity tests check. No deployment runs it. A new section must be added there, or its routes go untested.
- **Tests ignore your `.env`.** The root `conftest.py` loads settings without it, so a live `.env` can't change the results. Each test gets an in-memory database.
- **Format a single file**, such as a new test, with `uv run --project backend ruff format --config backend/pyproject.toml <file>`. A bare `ruff format` from the root uses a different line length.
- **mypy is informational**, not a gate: `uv run --project backend mypy backend` shows about 90 known errors.

## The app (`frontend/vue/`)

```bash
cd frontend/vue
npm run lint             # ESLint and Prettier
npm run typecheck        # vue-tsc
npm run test:coverage    # Vitest, 100% coverage
npm run build            # production build (writes frontend/spa-dist/)
npm run test:e2e         # browser tests over the built app
```

`npm run lint:fix` and `npm run format` fix what they can.

## Shared and section packages

```bash
npm run web-packages -- lint            # every package in platform/web/ and services/sections/*/frontend/
npm run web-packages -- typecheck
npm run web-packages -- test:coverage   # 100% coverage, per package
cd services/sections/sdr/frontend && npm run test:coverage   # one package
```

A section package may import only `@sentinel/ui`, `@sentinel/shell-api`, `@sentinel/map-kit` and itself. The `noSectionImports` lint rule fails the build otherwise. Only `frontend/vue/src/shell/sections.ts` and app specs may import a section.

## Repo tooling

```bash
npm run lint               # ESLint and Prettier over root config files and tests/e2e/
npm run typecheck          # tsc over the same files
npm run check:doc-links    # every link and #heading in docs/ resolves
```

## 100% coverage

Every frontend package, and the app, fails CI if line, function, branch or statement coverage drops below 100%. So new frontend code ships with tests that cover it:

- Cover edge cases on purpose (empty, missing, too big, invalid, error branches), not only the happy path.
- Give every component an accessibility test with `jest-axe`: `expect(await axe(wrapper.html())).toHaveNoViolations()`.
- For a branch that genuinely can't be reached, wrap it in `/* v8 ignore start */ … /* v8 ignore stop */` with a one-line reason. The single-line `/* v8 ignore next */` form doesn't work in this set-up.
- Before you rely on a test, check that it fails when the code is wrong.

The backend has no coverage number, but new code still gets tests, including tests that prove a security check refuses what it should.

## The two browser test suites

There are two, in different folders, run by different tools. Check both.

### App e2e (`frontend/vue/e2e/`)

Playwright with axe-core, against the built app and a mocked API. It covers the UI's structure (menu tabs, `aria-controls` targets, live regions), behaviour across pages (SDR audio surviving navigation), the docs page, and a real accessibility audit of every view, which catches what `jest-axe` can't (colour contrast, target size).

```bash
cd frontend/vue && npm run build && npm run test:e2e    # build first: it tests frontend/spa-dist/
cd frontend/vue && npx playwright test e2e/sdr.spec.ts  # one file
cd frontend/vue && npm run test:e2e:report              # open the last report
```

**Vitest passing isn't enough.** Restructuring UI (renaming a tab, moving a section between panels, adding a live region) can break e2e while every unit test passes. Run it before pushing any UI change.

### Full-stack smoke (`tests/e2e/`)

Drives a real running stack through the gateway. CI runs it three times, with different sections running: all of them, only SDR, and all but SDR.

```bash
docker compose up -d --wait
npm run test:e2e:gateway
```

It writes to the stack's databases, so use a throwaway stack, not the one with your data. `SENTINEL_E2E_BASE_URL` points it at a gateway (default `http://localhost:8080`). `SENTINEL_E2E_SECTIONS` says which sections the stack runs, for example `space:service,sdr:absent`; an unlisted section counts as running.

## Traps

- **Strict mode.** A Playwright locator that matches more than one element fails. Adding a second `[role="status"]` region can break an unrelated spec; use `.first()` when you mean "at least one".
- **A stale preview server.** e2e reuses a preview server already on port 4173. If results make no sense, stop it (`lsof -ti :4173 | xargs kill`), rebuild, and run again.
- **No Playwright browser.** If Playwright can't download its browser, add `PLAYWRIGHT_CHANNEL=chrome` to use your installed Chrome. Both suites accept it.
- **Wrong Node version.** Run `nvm use` in each new terminal.
- **A flaky CI download.** An image build that fails with a `504` while downloading go-pmtiles is GitHub, not your change. Re-run the failed jobs: `gh run rerun <run-id> --failed`.

## Docs screenshots

The images in `docs/images/` are taken by a script against the mocked API, never by hand. How to retake them is in [Frontend](../architecture/frontend.md#screenshots-in-these-docs).

## What runs where

| Check | Pre-commit hook (staged files) | CI |
|---|---|---|
| Prettier | fixes | checks |
| ESLint | fixes | checks |
| ruff lint and format | fixes | checks |
| Import boundaries | — | checks |
| vue-tsc and tsc | — | checks |
| Vitest at 100%, with jest-axe | — | checks |
| App e2e with axe-core | — | checks |
| pytest | — | checks |
| Full-stack smoke, three section set-ups | — | checks |
| Backend image for amd64 and arm64 | — | builds, doesn't push |
| Docs links and headings | — | checks |
| Changelog | — | rewritten after each merge to `main` |
