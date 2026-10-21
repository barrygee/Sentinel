# Testing

CI runs everything here on each pull request and push to `main`; all of it must pass. Run from the repo root unless the line starts with `cd`.

## Backend

```bash
uv run --project backend ruff check backend services/sections services/radio
uv run --project backend ruff format --check backend services/sections services/radio
PYTHONPATH=. uv run --project backend lint-imports --config backend/pyproject.toml
uv run --project backend pytest
uv run --project backend pytest tests/backend/test_routers_air.py::test_name
uv run --project backend pytest services/sections/air --cov=sentinel_air --cov-report=term-missing
```

- Tests need no Docker: one all-in-one app (`tests/in_process_app.py`), an in-memory database, and your `.env` ignored.
- Format one file with `--config backend/pyproject.toml`, or it uses a different line length.
- Coverage is measured on request, not gated. `.coveragerc` sets `concurrency = greenlet,thread`; without it, route bodies run through the TestClient show as uncovered.
- mypy is informational, not a gate.

## Frontend

```bash
cd frontend/vue && npm run lint && npm run typecheck && npm run test:coverage
npm run web-packages -- lint          # also: typecheck, test:coverage (every package)
npm run lint && npm run typecheck && npm run check:doc-links   # root tooling
```

- **100% coverage** everywhere, or CI fails. Cover edge cases, give every component a `jest-axe` test, and check each test fails when the code is wrong.
- Truly unreachable branch: `/* v8 ignore start */ … /* v8 ignore stop */` with a reason (the `next` form doesn't work here).

## Browser tests

| Suite | Where | Run |
|---|---|---|
| App e2e + axe | `frontend/vue/e2e/` | `cd frontend/vue && npm run build && npm run test:e2e` |
| Full-stack smoke | `tests/e2e/` | `docker compose up -d --wait && npm run test:e2e:gateway` |

- **Vitest passing isn't enough.** UI restructuring breaks e2e while unit tests pass. Run it before pushing UI changes.
- e2e tests the **built** `frontend/spa-dist/`: build first.
- The smoke suite writes to the stack's databases: use a throwaway stack. CI runs it three ways (all sections, only SDR, all but SDR).

## Traps

- **Strict mode:** a locator matching two elements fails. Use `.first()` for "at least one".
- **Stale preview server:** `lsof -ti :4173 | xargs kill`, rebuild, rerun.
- **No Playwright browser:** `PLAYWRIGHT_CHANNEL=chrome`.
- **Wrong Node:** `nvm use` in each terminal.
- **CI `504` downloading go-pmtiles:** GitHub, not you. `gh run rerun <run-id> --failed`.
