# Sentinel NestJS Rebuild — Architecture Plan

Date: 2026-09-12
Author: tech lead (architect agent)
Status: proposed — for product-owner sign-off before Phase 0 starts
Source of truth read for this plan: `/Users/barry/code/Sentinel` at `main` (7b6a456e).

Every claim below cites the existing file it maps from. Where a claim could not be
verified from code it is listed in §9 (Risks / open questions), never assumed.

---

## 1. Executive summary and key decisions

Sentinel today is a FastAPI/Python backend (`backend/`, 11,024 lines of Python across
`main.py`, 7 routers, 16 services, `database.py`, `models.py`, `config.py`) serving a
Vue 3 SPA (`frontend/vue/`, ~60.7k lines) plus three opt-in Python-supervised decoder
sidecars (`decoder/`, 945 lines). The rebuild replaces the Python backend with a
**NestJS (TypeScript) API** of identical external behaviour, keeps the Vue SPA
pixel-identical, and restructures both into a modular monorepo.

Counts verified from source (not the ~86 estimate in the brief):

| Surface | Count | Where counted |
| --- | --- | --- |
| REST routes (incl. `/health`, `/favicon.ico`, SPA catch-all) | **105** | Appendix A |
| WebSocket endpoints | **4** | `backend/routers/sdr.py` |
| SQLite tables | **17** (16 ORM models + `sdr_radios` legacy table still created) | Appendix B |
| `config.py` settings keys | **28** (+ `.env` file loading; Appendix C has 31 rows incl. env-only and one additive key) | Appendix C |
| Startup lifecycle steps | 11 (+ signal chaining) | `backend/main.py:51-109` |
| Vue source files (non-test) | 219 | Appendix D |
| Vitest spec files | 209 | `frontend/vue/src/**/*.spec.ts` |
| Playwright e2e specs | 11 (`frontend/vue/e2e/`) + 1 full-stack (`tests/e2e/`) | `.github/workflows/ci.yml` |
| Backend pytest files | 25 | `tests/backend/` |

### 1.1 Decisions (each with rationale and rejected alternatives)

| # | Decision | Rationale | Rejected |
| --- | --- | --- | --- |
| D1 | **Keep Vue 3 + Vite for the frontend.** | Hard constraint #2 is a pixel-identical, behaviour-identical UI with 209 vitest specs, 100% coverage gate and 11 Playwright/axe specs already asserting structure (`frontend/vue/e2e/*.spec.ts` hard-code rail `data-tab` ids, `aria-controls` targets, live regions). A framework swap throws all of that away and re-creates every one of the ~35 `components/shared/settings/*` controls, the MapLibre `IControl` classes (which are framework-free TS anyway), the AudioWorklet composable, and the teleport-based sidebar. There is no product benefit; the risk is pure. | **Angular** — the natural "matches Nest's DI/decorator style" pick, and Angular CDK would help the teleported menus. Rejected because every `.vue` SFC (≈130 files, ≈40k lines of template/scoped CSS) would be rewritten and the scoped-CSS cascade that produces today's exact look would have to be reproduced by hand under a different style-encapsulation model. **React** — same cost, less DI affinity. |
| D2 | **npm workspaces monorepo, no Nx/Turbo in v1.** | Repo already pins npm 11 / Node 24 with `engine-strict` (root `package.json`, `.nvmrc`); npm workspaces give hoisting, `npm run -w`, and TS project references without a second build graph. Turbo can be added later for remote cache; it is not needed to ship parity. | **Nx** — excellent Nest generators but forces its executors/graph onto Vite, Playwright and husky; large surface to learn while chasing parity. **pnpm** — would change the Node/npm pin the repo and CI already enforce. |
| D3 | **Drizzle ORM + `better-sqlite3`** for persistence. | Needs (from `backend/database.py`): raw pragmas on connect (`journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`), idempotent startup DDL + 24 `ALTER TABLE ADD COLUMN` try/ignore migrations + backfill `UPDATE`s + 5 indexes, an in-memory DB for tests (`conftest.py` StaticPool), raw SQL for the snapshot/available-dates queries (`routers/air.py:334-402`), and a `namespace/key/JSON-text` settings table. Drizzle: schema is plain TS (no codegen step), `db.run(sql\`PRAGMA ...\`)`/`sqlite.pragma()` are first-class, raw SQL is idiomatic, `new Database(':memory:')` is one line, and better-sqlite3 is the fastest Node driver and Drizzle's default SQLite driver. Synchronous API is acceptable: every query here is a sub-millisecond SQLite call (the Python side was already single-writer via a thread). | **Prisma** — schema DSL + generated client + query engine binary; runtime `ALTER TABLE` migrations against pre-existing field DBs with no `_prisma_migrations` table are awkward; WAL needs `$queryRaw` at boot; JSON columns on SQLite are strings anyway. **TypeORM** — decorator entities fit Nest, but TypeORM 1.0 dropped `sqlite3` and is mid-migration churn; `synchronize` is unsafe for field DBs; weaker typing on raw queries. **`node:sqlite`** (built into Node 24) — tempting, but drizzle-kit does not support it and it is still marked experimental; revisit when stable. |
| D4 | **Raw `ws` server attached to Nest's HTTP server (`noServer: true`), NOT `@nestjs/platform-ws` gateways and NOT socket.io.** | The SPA opens plain `new WebSocket(...)` on four dynamic paths (`useSdrControlSocket.ts:235`, `useSdrAudio.ts:341`, `useSdrDecode.ts:129,143`) and speaks raw JSON text / raw binary frames with no `{event,data}` envelope. Released NestJS `WsAdapter` supports only static gateway paths (dynamic `/ws/sdr/:id` params are PR nestjs/nest#15488, still open as of June 2026) and its message parser expects the `{event,data}` envelope. A thin `SdrWebSocketServer` provider that handles the `upgrade` event and dispatches on a path regex gives exact protocol parity with ~80 lines and zero adapter hacks. | `@nestjs/platform-ws` + custom `messageParser` + a forked adapter for path params — more code, and fragile across Nest minor versions. socket.io — would change the wire protocol (constraint #1). |
| D5 | **`@nestjs/config` + a zod schema** mirroring every `config.py` key with identical defaults, env names and `.env` loading. | pydantic-settings maps `db_path` → env `DB_PATH` (case-insensitive) and reads `.env` from CWD (`config.py:112-114`); compose already sets `DB_PATH`, `DECODER_INGEST_SECRET`, `DECODER_PCM_PORT`, `DECODER_AUDIO_UDP_PORT`, `APRS_DECODER_PCM_PORT` (`docker-compose.yml:28-40`). The zod schema is the single typed source; Appendix C is the parity table. | class-validator config classes — duplicate the zod choice below. |
| D6 | **zod for request validation (via a `ZodValidationPipe`) + a FastAPI-compatible error filter.** | Schemas live in `packages/contracts` and are consumed by both the Nest API and the Vue `services/*Api.ts` clients (class-validator classes cannot be shared with the SPA cleanly). Parity detail: FastAPI answers validation failures with `422 {"detail":[{"loc":[...],"msg":...,"type":...}]}` and `HTTPException` with `{"detail": ...}`; some handlers hand-roll `{"error": ...}` (`error_handlers.py`, `routers/space.py`). A `FastApiCompatExceptionFilter` reproduces those envelopes exactly (golden-master verified). | class-validator — Nest default, but no shared runtime types with the SPA and no way to express the many "coerce and skip malformed" semantics (`routers/settings.py:_reconcile_sdr_frequencies`) without hand code anyway. |
| D7 | **Vitest for the Nest app too** (with `unplugin-swc` for `emitDecoratorMetadata`). | One runner, one coverage tool (v8), one config style across `apps/*` and `packages/*`; matches the frontend's existing 100% gate (`frontend/vue/vitest.config.ts`). Nest's DI needs decorator metadata, which esbuild does not emit — `unplugin-swc` is the documented fix. | Jest — Nest's default and what `express-standards` names; rejected only for consistency and speed; no capability gap. |
| D8 | **FFT: `fft.js` (indutny), pure JS, in a `worker_threads` worker.** | Sizes are powers of two in [1024, 32768] (`services/sdr.py:38-43`), one frame per ~40 ms — trivial for a radix-4 JS FFT; pure JS avoids WASM copy overhead that benchmarks show can erase KissFFT's advantage at these sizes, and avoids a native build on the Pi. Numerical parity with `numpy.fft` is double precision either way. | `kissfft-wasm`/`webfft` — keep as a swap-in if profiling on the Pi shows the JS FFT starving the loop; interface is behind `packages/dsp/fft.ts`. `fftw` bindings — native build on ARM, no. |
| D9 | **SGP4 via `satellite.js`; everything downstream (ECI→geodetic, GMST, footprint, passes, look angles, terminator) ported verbatim from `services/satellite.py` / `daynight.py`, NOT taken from satellite.js helpers.** | `sgp4` (Python) and `satellite.js` are both ports of Vallado's reference SGP4, so propagation matches to floating-point noise. But `_eci_to_geodetic` uses a *spherical* Earth and a simplified GMST (`satellite.py:23-49`), whereas `satellite.js.eciToGeodetic` is WGS-72 geodetic — using it would move every satellite marker by up to ~0.2° latitude. Parity requires porting the app's own math. | Porting SGP4 itself to TS — unnecessary; `satellite.js` exposes `twoline2satrec`, `sgp4(satrec, minutes)`, `propagate`, `jday`, `gstime`, and `satrec.no`/`no_kozai`, `satrec.error` (verified against the project README). |
| D10 | **DSP demod chain ported to TS with typed arrays, run in a `worker_threads` worker per decode bridge.** | `sdr_decode.py` ran `demod_chunk` via `asyncio.to_thread` to keep the event loop free; Node has no GIL-free thread for JS except workers. Fixtures generated by the Python implementation gate parity (§4c). | Native addon / WASM SIMD — premature; the chain is a 65-tap FIR at ≤1.024 Msps. |
| D11 | **Sidecars (`decoder/`, `decoder/aprs`, `decoder/adsb`) keep their Python supervisors in v1**; a Node port is a separately-gated Phase 12b. | They are supervisors of C binaries (dsd-fme, direwolf, readsb) inside their own images, using only the stdlib (+`aprslib`), and their contract with the backend is HTTP + env vars (§4j). Porting them adds zero parity value and one real risk: `aprslib` has no exact Node equivalent. Constraint #4 ("wherever possible") is honoured by documenting the port path and gating it separately. **This is an open question for the owner (§9, Q1).** | Port in v1 — rejected for risk/benefit; kept as an explicit follow-up with the same env contract. |
| D12 | **Route ordering and fallbacks reproduced exactly**, including the surprising ones: unknown `/api/**` GETs fall through to the SPA `index.html` (FastAPI catch-all `main.py:166`), `/health`, `/favicon.ico`, `no-cache` on `index.html`, 503 JSON when the bundle is missing. | Golden-master replays would otherwise fail on these. | "Fix" them during the port — not allowed by constraint #1; log as candidates for a post-cutover ADR. |

### 1.2 Things that are *not* in scope of "zero functionality lost" but are recorded

- `mypy` is informational today (`CLAUDE.md`); in the new repo `tsc --noEmit` strict is gating (the user's global standard). This is a stricter gate, not a behaviour change.
- FastAPI's auto docs at `/api/docs`, `/api/redoc`, `/api/openapi.json` (`main.py:112-120`) are reproduced with `@nestjs/swagger` at the same paths; the OpenAPI document will not be byte-identical (different generator) and is excluded from golden-master.

---

## 2. Monorepo and package structure

```
sentinel/
├── package.json                  # npm workspaces root; scripts fan out with `npm run -ws`
├── package-lock.json
├── .nvmrc                        # 24 (unchanged)
├── tsconfig.base.json            # strict + noUncheckedIndexedAccess + noImplicitOverride + exactOptionalPropertyTypes
├── eslint.config.ts / prettier.config.ts   # from packages/config
├── .husky/pre-commit  .lintstagedrc.json
├── cliff.toml                    # git-cliff (unchanged)
├── docker-compose.yml            # same services/profiles/volumes/env names (§8.5)
├── Dockerfile                    # single multi-stage image: web build → api build → runtime
├── .env.example
├── apps/
│   ├── api/                      # @sentinel/api — NestJS
│   │   ├── src/
│   │   │   ├── main.ts           # bootstrap: adapter, shutdown hooks, ws server, static order
│   │   │   ├── app.module.ts
│   │   │   ├── common/           # exception filter (FastAPI-compat), zod pipe, clock, logger
│   │   │   ├── config/           # ConfigModule (zod schema)  ← backend/config.py
│   │   │   ├── persistence/      # PersistenceModule (drizzle, schema, startup DDL, seeders) ← database.py, models.py, db_helpers.py
│   │   │   ├── settings/         # SettingsModule ← routers/settings.py, utils.py(resolve_domain_urls)
│   │   │   ├── air/              # AirModule ← routers/air.py, services/adsb.py, flight_history.py, upstream_rate_limit.py
│   │   │   ├── space/            # SpaceModule ← routers/space.py, services/tle.py, sat_radio.py (+ packages/orbit)
│   │   │   ├── land/             # LandModule ← routers/land.py, services/aprs_store.py
│   │   │   ├── sentry/           # SentryModule ← routers/sentry.py, services/sentry_client.py, sentry_fleet.py
│   │   │   ├── adsb-source/      # AdsbSourceModule ← routers/adsb_source.py, services/adsb_source.py
│   │   │   ├── sdr/              # SdrModule (aggregator) ← routers/sdr.py + services/sdr*.py
│   │   │   │   ├── radios/       #   SdrRadiosModule
│   │   │   │   ├── frequencies/  #   SdrFrequenciesModule (groups + frequencies + bulk data editors)
│   │   │   │   ├── search-ranges/#   SdrSearchRangesModule
│   │   │   │   ├── recordings/   #   SdrRecordingsModule
│   │   │   │   ├── stream/       #   SdrStreamModule (rtl_tcp, relay control, broadcaster, ws server)
│   │   │   │   ├── decode/       #   SdrDecodeModule (PCM bridges, voice UDP, ingest/config)
│   │   │   │   └── aprs/         #   SdrAprsModule (APRS bridge control, ingest/config, resume)
│   │   │   ├── static-serving/   # StaticServingModule ← main.py mounts + catch-all + favicon + health
│   │   │   └── lifecycle/        # LifecycleModule ← main.py lifespan ordering, cleanup loop, signal chaining
│   │   ├── test/                 # vitest: unit + golden-master replay + ws conformance
│   │   └── vitest.config.ts
│   └── web/                      # @sentinel/web — the Vue SPA (moved from frontend/vue, unchanged behaviour)
│       ├── src/  e2e/  public/
│       └── vite.config.ts        # outDir → ../../dist/spa (was ../../frontend/spa-dist)
├── packages/
│   ├── contracts/                # @sentinel/contracts — zod schemas + TS types for every REST/WS payload, settings keys, config keys
│   ├── ui/                       # @sentinel/ui — the 17 base primitives + icons + design tokens/reset CSS
│   ├── map-controls/             # @sentinel/map-controls — SentinelControlBase, RangeRingsControlBase, cluster/label helpers, sprites
│   ├── dsp/                      # @sentinel/dsp — IQ→complex, Hann, FFT frame, demod chain, resamplers (pure, no Nest)
│   ├── orbit/                    # @sentinel/orbit — SGP4 wrapper, ECI→geodetic, ground track, passes, footprint, terminator
│   ├── testing/                  # @sentinel/testing — golden-master runner, ws conformance harness, fixture loaders, axe helpers
│   └── config/                   # @sentinel/config — shared eslint/prettier/tsconfig presets
├── assets/                       # 1.4 GB map assets (was frontend/assets) — PMTiles, sprites, fonts, fiord styles, template.css? (no: template.css moves to packages/ui, see §5.5)
├── data/                         # seed JSON (was backend/data) — default_config.json, sdr_*.json, satellite_radio*.json, amateur_radio_data.json
├── decoder/                      # unchanged sidecars (Python supervisors) — see D11
├── tools/                        # TS ports of backend/scripts/*.py (offline data regeneration)
├── parity/                       # Python-generated golden fixtures (checked in): api/, ws/, dsp/, orbit/, schema/, config/
├── docs/adr/                     # 0001–0004 carried over + new 0005–00xx from this plan
└── tests/e2e/                    # full-stack Playwright smoke (unchanged)
```

### 2.1 Dependency direction rules (enforced by ESLint `import/no-restricted-paths` + TS project references)

```
apps/web ──► packages/ui, packages/map-controls, packages/contracts
apps/api ──► packages/contracts, packages/dsp, packages/orbit
packages/map-controls ──► packages/ui (tokens only), maplibre-gl
packages/ui ──► vue only
packages/dsp, packages/orbit ──► nothing (pure TS; no Node built-ins except in worker entry files)
packages/contracts ──► zod only
packages/testing ──► contracts (dev-only; never imported by apps' runtime code)
```

- No package imports from `apps/*`.
- `packages/dsp` and `packages/orbit` must stay runnable in a `worker_threads` worker and in vitest with no DI.
- `packages/contracts` is the only place a payload shape is written down. Both the Nest controllers (response typing) and the Vue `services/*Api.ts` import from it.

---

## 3. Backend module design

Conventions used in every module below:

- **Controller** = one Nest controller per resource (user standard: modular routers). All paths carry the same prefix as today's `APIRouter(prefix=...)`.
- **Service** = the port of the Python service/module named in the "maps from" column.
- **Repository** = Drizzle queries for that module's tables (no ORM sessions leak into controllers).
- **Error envelope**: the `FastApiCompatExceptionFilter` (in `common/`) renders `HttpException(status, detail)` as `{"detail": detail}` (string or object exactly as passed), zod failures as `422 {"detail":[{"loc":["body",...],"msg":...,"type":...}]}`, and the two decorators in `error_handlers.py` become `withServiceErrors()` / `withUnexpectedErrors()` helpers producing `{"error": ...}` bodies with 503/500.
- **Clock**: an injectable `Clock` (`nowMs()`, `monotonicMs()`, `nowUtc()`) replaces `cache.now_ms` / `time.time()` so parity tests can freeze time.

### 3.1 ConfigModule ← `backend/config.py`

- `SentinelConfig` zod schema (Appendix C) with `.default()` values identical to `config.py`.
- Env mapping: UPPER_SNAKE of the key (pydantic-settings default); reads `.env` from process CWD via `@nestjs/config` `envFilePath: ['.env']`; env wins over `.env` (same as pydantic).
- Exposed as an injectable `SentinelConfig` object (frozen).

### 3.2 PersistenceModule ← `backend/database.py`, `backend/models.py`, `backend/db_helpers.py`

Providers:

| Provider | Maps from | Notes |
| --- | --- | --- |
| `SqliteConnection` | `database.py:16-36` | `new Database(config.dbPath, { timeout: 5000 })`; on open: `pragma('journal_mode = WAL')`, `pragma('busy_timeout = 5000')`, `pragma('synchronous = NORMAL')`. Test factory opens `:memory:`. |
| `drizzleDb` | `models.py` (all 16 models) | Drizzle `sqliteTable` definitions in `persistence/schema/*.ts`; column names/types/nullability/defaults/uniques exactly as Appendix B. |
| `SchemaMigrator.ensureSchema()` | `database.py:create_tables` | Runs `CREATE TABLE IF NOT EXISTS …` DDL captured from the live app's `.schema` (parity §6-iv), then the same 24 `ALTER TABLE ADD COLUMN` statements each wrapped in try/ignore on "duplicate column", the two `UPDATE … WHERE bandwidth IS NULL / sample_rate IS NULL` backfills, the slug backfill loop (`slugify(name) or 'group-{id}'`), the `INSERT OR IGNORE INTO sdr_frequency_group_links …`, and the 5 `CREATE INDEX IF NOT EXISTS`. Then `mkdir -p dirname(dbPath)/recordings`. **Order preserved exactly.** |
| `UserSettingsRepository` | `db_helpers.py` | `getSettingRow`, `getSetting(ns,key,default)` (JSON parse; default on parse failure), `upsertSetting(ns,key,value,{retries:3})` with the 200 ms·(attempt+1) backoff on `SQLITE_BUSY` (better-sqlite3 throws `SqliteError code SQLITE_BUSY`). |
| `SettingsSeeder` | `database.py:seed_default_settings` | The two air-key renames (`onlineUrl→onlineDataSourceURL`, `offgridSource→offgridDataSourceURL`), the 9 `_OBSOLETE_KEYS` deletes, then insert-if-absent for every `(ns,key)` in `data/default_config.json` with the two env overrides (`air.onlineDataSourceURL ← adsb_upstream_base`, `space.onlineUrl ← celestrak_iss_url`). Keys starting `_` skipped. |
| `SdrRadiosMigration` | `database.py:migrate_sdr_radios_to_settings` | Copies legacy `sdr_radios` rows into `sdr.radios` JSON only when the key is absent and the table has rows (table may not exist → swallow). |
| `RemovedSettingsPruner` | `database.py:prune_removed_settings` | Deletes `(sdr,trunkTrackingEnabled)`, `(sdr,channel_maps)`. |
| `SdrConfigMirror` | `database.py:sync_sdr_groups_to_config`, `sync_sdr_search_ranges_to_config` | Writes `sdr.frequencies` (flat list with `groups: [slug]`, ordered by `frequency_hz`), `sdr.groups` (`[{name,slug}]` ordered by `sort_order,id`), `sdr.searchRanges`. Colours deliberately omitted (comment in source). |
| `SdrDataSeeder` | `database.py:seed_sdr_data_from_files`, `seed_sdr_bandplan_from_file` | Seeds only when tables empty; then always mirrors + rewrites `data/sdr_frequencies.json`. Band plan: seed `sdr.bandPlan` only when unset. |
| `SatelliteRadioBackfill` | `database.py:backfill_satellite_radio_store` | `{...store, ...file}` merge; no write when equal. |
| `JsonFileStore` | `services/json_store.py` | `loadJsonFile(path, default)` fail-soft; `writeJsonFile(path, payload)` atomic via temp file + `fs.renameSync`, `JSON.stringify(payload, null, 2) + '\n'`, `ensure_ascii=False` ⇒ plain UTF-8 (JS default). Returns `false` on `EROFS`/`EACCES`. |

### 3.3 SettingsModule ← `backend/routers/settings.py`, `backend/utils.py`

Controller `SettingsController` (`/api/settings`). Route registration order matters: `""`, `config/preview`, `config/upload` **before** `:namespace`, `:namespace/:key` (FastAPI comment at `settings.py:277`; Nest/Express match in declaration order too).

| Method | Path | Request | Response | Errors | Maps from |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/settings` | — | `{ns: {key: value}}`; per-namespace keys ordered by `default_config.json` template order, unknown keys after in row order | — | `get_all_settings`, `_rows_to_namespace_dict`, `_canonical_key_order` (lru-cached read of the file) |
| GET | `/api/settings/config/preview` | — | `application/json` body = `JSON.stringify(config, null, 2)` after `_strip_data_keys` (drop `sdr.{groups,frequencies,searchRanges,bandPlan}`, `space.satelliteRadio`) | — | `config_preview` |
| POST | `/api/settings/config/upload` | multipart `file` | `200 {"status":"ok"}` | `400 {"detail":"Invalid JSON: …"}`, `400 "Config must be a JSON object"`, `400` from `_validated_location` | `config_upload`; assigns sequential ids to `sdr.radios[]` lacking int `id`; skips excluded data keys; upserts everything else with one `ts` |
| GET | `/api/settings/:namespace` | — | `{key: value}` ordered as above | — | `get_namespace_settings` |
| PUT | `/api/settings/:namespace/:key` | `{value: any}` | `{"status":"ok"}` | `400` location validation for `app/location` | `upsert_setting_endpoint` |
| DELETE | `/api/settings/:namespace/:key` | — | `{"status":"ok"}` (no-op if absent) | — | `delete_setting_endpoint` |

Services: `LocationValidator` (`_validated_location`: both-empty → `{latitude:"",longitude:""}`; one-empty → 400 "location requires both latitude and longitude, or neither"; non-numeric → 400; range checks), `SdrFrequencyReconciler` (`_reconcile_sdr_frequencies` — catalogue-authoritative slug rules, `_DEFAULT_BW_BY_MODE`, coercions, label `[:60]`, notes `[:500]`, prune unreferenced groups), `DomainUrlResolver` (`utils.resolve_domain_urls` — override precedence, `_valid_url` placeholder rejection of `"https://"`, `"http://localhost"`, `""`, rstrip `/`, air-specific key names, offgrid `{url}` object form), `TextSanitiser` (`slugify` — NFKC/NFKD + combining-mark strip + `[^\w]+`→`-` Unicode-aware + `_`→`-`; `clean_group_name` — control/zero-width/bidi strip, whitespace collapse, ≤60 chars).

Nest specifics: multipart via `FileInterceptor('file')` (memory storage). `ensure_ascii=False`/`indent=2` ⇒ `JSON.stringify(x, null, 2)` (note Python puts a space after `:` and `,` identically at indent=2; golden test compares parsed JSON, not bytes).

### 3.4 AirModule ← `backend/routers/air.py`, `services/adsb.py`, `services/flight_history.py`, `services/upstream_rate_limit.py`

Controller `AirController` (`/api/air`):

| Method | Path | Request | Response / headers | Errors | Maps from |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/air/adsb/point/:lat/:lon/:radius` | path floats/int (radius default 250 when omitted is unreachable — path param required) | upstream JSON; `X-Cache: HIT\|MISS\|BYPASS\|RATED\|THROTTLED\|STALE` | `503 {"detail":"ADS-B upstream unavailable"}` | `get_aircraft_near_point` — cache key `${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}` (Python `f"{lat:.4f}"` — JS `toFixed(4)` rounds the same way for these magnitudes; parity-tested) |
| GET | `/api/air/messages` | — | `[{msg_id,type,title,detail,ts}]` newest first, non-dismissed | — | `list_air_messages` |
| POST | `/api/air/messages` | `{msg_id,type,title,detail?="",ts}` | `201 {"status":"created"}` or `200 {"status":"exists"}` | 422 | `create_air_message` |
| DELETE | `/api/air/messages/:msg_id` | — | `200 {"status":"dismissed"}` / `{"status":"absent"}` | — | `dismiss_air_message` |
| DELETE | `/api/air/messages` | — | `200 {"status":"cleared"}` | — | `dismiss_all_air_messages` |
| GET | `/api/air/tracking` | — | `[{hex,callsign,follow,added_at}]` newest first | — | `list_tracked_aircraft` |
| POST | `/api/air/tracking` | `{hex,callsign?="",follow?=false}` | `201 created` / `200 updated` | 422 | `add_tracked_aircraft` |
| DELETE | `/api/air/tracking/:hex` | — | `200 {"status":"removed"}` (also when absent — docstring says 404 but code returns 200; **code wins**) | — | `remove_tracked_aircraft` |
| GET | `/api/air/recordings/available-dates` | — | `[{date,start_ms,end_ms,count}]` desc | — | raw SQL `date(ts/1000,'unixepoch')` — keep as raw SQL |
| GET | `/api/air/snapshots` | `start_ms,end_ms` (query ints) | `{start_ms,end_ms,aircraft:{reg:{registration,callsign,type_code,hex,snapshots:[…]}}}` | `400 "Window exceeds 24 hours"`, 422 missing | raw SQL join |
| GET | `/api/air/flights` | `limit=100, offset=0` | `[{registration,hex,type_code,callsign,flight_count,first_seen,last_seen}]` | — | `list_aircraft_history` |
| GET | `/api/air/flights/:registration` | — | `[{flight_id,callsign,started_at,last_active_at,snapshot_count}]` | — | |
| GET | `/api/air/flights/:registration/:flight_id` | — | `{registration,flight_id,callsign,started_at,snapshots:[…]}` | `404 {"detail":"Flight not found"}` | |
| DELETE | `/api/air/flights/:registration` | — | `{"status":"deleted"}` | — | |

Services:

- `AdsbUpstreamClient` ← `services/adsb.py`: `fetchAircraft(lat,lon,radius,baseUrl)`; readsb detection (`endsWith('.json') || endsWith('/data')`), `_readsb_url`, `_readsb_to_airplanes` (rename `aircraft→ac`, haversine radius filter with `earth_radius_nm = 3440.065`, `now` seconds→ms, `msg:"readsb"`), headers `User-Agent: SENTINEL/1.0`, `Accept: application/json`, 10 s timeout, 429 → `penalize(host, cooldownSeconds(retryAfter))`. Uses Node `fetch` (undici) with `AbortSignal.timeout(10_000)`.
- `MinimumIntervalRateLimiter` ← `upstream_rate_limit.py`: per-host next-slot map, reservation under a mutex (`async-mutex` or a promise chain), sleep outside the lock, `UpstreamThrottledError`, `penalize` only pushes later. Process-wide singleton (`_adsb_rate_limiter`).
- `FlightHistoryRecorder` ← `flight_history.py`: `recordAircraftBatch` (same gap/interval constants 10 min / 10 s, `alt_baro` string→NULL, one transaction) run **after the response** (`setImmediate` after `res.end`, matching `BackgroundTasks`), and `cleanupOldSnapshots(30 days)`.
- `AdsbCacheRepository`: HIT/STALE logic via injected `Clock`; on `SQLITE_BUSY` at commit → still serve fresh data with `X-Cache: BYPASS` (`air.py:158-164`).

### 3.5 SpaceModule ← `backend/routers/space.py`, `services/tle.py`, `services/sat_radio.py`, `packages/orbit`

Controller `SpaceController` (`/api/space`). Registration order: `iss`, `iss/passes`, `satellite/:norad_id`, `satellite/:norad_id/passes`, `passes`, `daynight`, `tle/status`, `tle/list`, `tle/uncategorised`, `tle/fetch`, `tle/manual`, `tle/category`, `tle/satellite`, `radio/file`, `tle` (DELETE).

| Method | Path | Request | Response | Errors | Maps from |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/space/iss` | `lat?,lon?` | `{position:{lat,lon,alt_km,velocity_kms,track_deg[,az,el]},ground_track:FeatureCollection,footprint:Polygon\|MultiPolygon}` | `503 {"error":"No TLE data in database","no_tle_data":true}` when `tle_cache` empty; `503 {"error":msg}` on RuntimeError; `500 {"error":"Unexpected error: …"}` | `get_iss` + `@handle_service_errors` |
| GET | `/api/space/satellite/:norad_id` | `lat?,lon?` | same | `503 no_tle_data`; `404 {"error":msg}` when msg contains "not found"/"no tle"; else `503`; `500` | `get_satellite` |
| GET | `/api/space/iss/passes` | `lat,lon` required; `hours` 1..48 default 24; `min_el` 0..90 default 0 | `{passes:[…],obs_lat,obs_lon,lookahead_hours,computed_at}` | 422 on bounds; 503/500 as above | `_compute_passes_response` |
| GET | `/api/space/satellite/:norad_id/passes` | same | same | same | |
| GET | `/api/space/passes` | `lat,lon,hours,min_el=10,categories?,limit=50 (1..200)` | `{passes:[…no sky_track, +norad_id,name,category,+10 radio fields],obs_lat,obs_lon,lookahead_hours,satellite_count,computed_at}` | `400 {"error":"Invalid categories: […]. Valid: […]"}` | `get_multi_satellite_passes` (first 500 sats, skip RuntimeError/ValueError, sort by `aos_unix_ms`, truncate `limit`) |
| GET | `/api/space/daynight` | — | GeoJSON Feature (`properties.sun_lat/sun_lon` rounded 3) | `500 {"error":"Terminator computation failed: …"}` | `daynight.compute_terminator` |
| GET | `/api/space/tle/status` | — | `{total,uncategorised,by_source:{src:count},by_category:{cat:{count,last_updated}}}` (`unknown` for NULL) | `500 {"error":…}` | `get_tle_status` |
| GET | `/api/space/tle/list` | — | `{satellites:[{norad_id,name,category,name_source,updated_at,+10 radio fields}]}` by name | 500 | |
| GET | `/api/space/tle/uncategorised` | — | `{satellites:[{norad_id,name}]}` | 500 | |
| POST | `/api/space/tle/fetch` | `{url, category?}` (untyped dict) | `{inserted,updated}` | `400 url required / Invalid URL / Invalid category`, `422 {"error":ValueError}`, `502 {"error":"Network error — could not reach {url}: {Type}"}` for timeout/connect, `502 {"error":"Fetch failed: {Type}: {e}"}` | `fetch_tle_from_url` (15 s timeout) |
| POST | `/api/space/tle/manual` | `{text, category?}` | `{inserted,updated,total}` | `400`, `422 {"error":…}`, `500 {"error":"Store failed: …"}` | `store_tle_manual` (source `manual`, cat_source `user` if category) |
| PATCH | `/api/space/tle/category` | `{assignments:[{norad_id,category}]}` | `{updated,skipped}` | `400 assignments array is required`, `400 Invalid category values: […]` | `_category_beats` with source `user`; `active` not user-assignable |
| PATCH | `/api/space/tle/satellite` | `{norad_id,name?,category?}` | `{norad_id,name,category}` | `400`, `404 {"error":"Satellite not found"}` | name sets `name_source='user'` |
| GET | `/api/space/radio/file` | — | `{norad_id:{radio fields}}` | 500 | `sat_radio.get_radio_map` |
| POST | `/api/space/radio/file` | JSON object | `{"status":"ok","count":n}` | `400 Body must be a JSON object` | `replace_radio_map` (normalise `str(int(nid))`, `clean_entry`, apply to catalogue rows, write file) |
| DELETE | `/api/space/tle` | `confirm=true` required; `category?` (`unknown` = NULL) | `{"cleared":true}` or `{"cleared":true,"category","count"}` | `400 Pass ?confirm=true…`, `400 Invalid category…` | `clear_tle_data` |

Services: `TleService` ← `tle.py` (`validate_tle_text` using `satellite.js twoline2satrec` + `satrec.error !== 0` as the SGP4 parse check; `parse_tle_lines`; `_norad_from_line1 = line1.slice(2,7).trim()`; `store_tle_bulk` with TTL `tle_manual_ttl_ms` unless source `online`; category/source priority tables; `apply_radio_to_rows` after; `fetch_tle` cache/stale/fallback ladder incl. `_single_satellite_url` GROUP→CATNR rewrite (URLSearchParams, `doseq` ⇒ repeat keys) and the ISS default URL special case; `fetch_tle_from_url`). `SatelliteRadioStore` ← `sat_radio.py` (`RADIO_FIELDS` tuple order, `_FILE_COMMENT` text, numeric-sorted file write). Orbit math from `packages/orbit` (§4e).

### 3.6 LandModule ← `backend/routers/land.py`, `services/aprs_store.py`

| Method | Path | Response | Maps from |
| --- | --- | --- | --- |
| GET | `/api/land/aprs/stations` | `{stations:[{callsign,latitude,longitude,symbol,comment,course,speed,altitude,path,raw,last_heard_ms}]}` most-recent first, cutoff = now − retention | `list_aprs_stations` |

`AprsStationStore` ← `aprs_store.py`: `retentionMs` reads `land/aprsRetentionMinutes` per call (non-positive/NaN → `aprs_station_ttl_ms`), `stationFromEvent` (`from ?? callsign`; lat/lon coerced floats; null when unplottable), `upsertStation`, `getStations`, `cleanupExpired` (returns rowcount). Exported for SdrAprsModule's ingest and LifecycleModule's sweep.

### 3.7 SentryModule ← `backend/routers/sentry.py`, `services/sentry_client.py`, `services/sentry_fleet.py`

Controller `SentryHostsController` (`/api/sdr/sentry-hosts`). `locations` registered before `:host_id` (source comment `sentry.py:471`).

| Method | Path | Request | Status / Response | Errors | Maps from |
| --- | --- | --- | --- | --- | --- |
| GET | `` | — | `200 [SentryHostOut]` by id | — | `list_hosts` |
| POST | `` | `SentryHostIn {name?,address,port=8000,auth_token="",enabled=true}` | `201 SentryHostOut` | `409 {"detail":{"code":"host_conflict","message":…}}`, 422 (address/port/name/token validators) | `create_host`; starts poller if enabled |
| GET | `/locations` | — | `200 [SentrySiteOut]` (enabled hosts with a cached export location) | — | reads poller snapshot only |
| GET | `/:host_id` | — | `200 SentryHostOut` | `404 {"detail":{"code":"unknown_host","message":"No such Sentry host."}}` | |
| PUT | `/:host_id` | `SentryHostPatch` (all optional, ≥1 field **sent**; `name:null` clears) | `200 SentryHostOut` | `409 host_conflict`, 404, 422 `"At least one field must be provided."` | restart/stop poller |
| DELETE | `/:host_id` | — | `204` | 404 | stop poller then delete |
| POST | `/:host_id/test` | — | `200 {reachable,detail,api_version?,health?}` — never errors on unreachable | 404 | `get_health` |
| GET | `/:host_id/info` | — | `200 SentryHostInfoOut` (SentryHostOut + `detail,last_polled_at,last_success_at,health,source,location,control_port_offset`) | 404 | live health + export |
| GET | `/:host_id/devices` | — | `200 {reachable,last_error,last_polled_at,last_success_at,api_version,status}` from cache | 404 | |
| GET | `/:host_id/devices/records` | — | Sentry `GET /api/devices` body verbatim | `502 {"detail":{"code":"sentry_unreachable",…}}`; Sentry's own status + `{code,message,…context}` | |
| PATCH | `/:host_id/devices/:device_id` | any JSON object (forwarded verbatim) | Sentry response body | as above; then `refresh_now` | |
| DELETE | `/:host_id/devices/:device_id` | — | `204` | as above | |
| POST | `/:host_id/devices/:device_id/serial` | `{serial:/^[A-Za-z0-9_-]{1,32}$/, confirm:true}` | `202` Sentry body | 422 on validators | |
| GET/PUT/DELETE | `/:host_id/wifi` | PUT `WifiConfigIn` (ssid 1..32 UTF-8 bytes, security `wpa2\|wpa3`, band `bg\|a`, channel 0..196, interface regex) | body / body / `204` | | hotspot proxy |
| POST | `/:host_id/wifi/enable`, `/disable` | `{confirm_uplink_loss=false}` | body | | |
| POST | `/:host_id/wifi/confirm` | — | body | | never auto-called |
| GET | `/:host_id/wifi/interfaces`, `/clients` | — | body | | |

`SentryHostOut` never includes `auth_token`; carries `auth_token_set`, `reachable`, `api_version` overlaid from the poller snapshot.

Services:

- `SentryClient` ← `sentry_client.py` (§4g).
- `SentryFleetPoller` ← `sentry_fleet.py`: one loop per enabled host, `poll_interval_s` on success, exponential backoff `start→max` on failure, `refresh_now` wakes via a resolvable promise (replaces `asyncio.Event`), `_refresh_export` at most every `sentry_location_refresh_s`, `_follow_device_addresses` rewrites `sdr.radios[].port` for mirrored radios when the `iq_port` moved (host is **not** followed), `_record_failure`/`_update_host_row` (`last_seen_at` only on success). `start_all` at bootstrap, `stop_all` on shutdown.

### 3.8 AdsbSourceModule ← `backend/routers/adsb_source.py`, `services/adsb_source.py`

Controller `AdsbSourceController` (`/api/sdr/adsb`):

| Method | Path | Request | Response | Errors | Maps from |
| --- | --- | --- | --- | --- | --- |
| GET | `/source` | — | `{configured:false,sentry_host_id:null,sentry_device_id:null}` or configured triple | — | `get_source` |
| PUT | `/source` | `{sentry_host_id:int, sentry_device_id: 1..256 chars}` | configured triple | 422 | no existence check by design |
| POST | `/claim` | `{force=false}` | `{source,reservation,tuned:{center_hz:1090000000,sample_rate:2400000},renew_within_seconds:30}` | `409` no_source/device_reserved/host_disabled, `404` unknown_host, `502` unauthenticated/host_unreachable/other — detail `{code,message,…context}` | `claim_and_tune` (reservation TTL 120 s, label "Sentinel — AIR (ADS-B)", gain 49.6 dB fixed) |
| DELETE | `/claim` | — | `204` always | — | best-effort release |
| GET | `/config` | — | `{configured:false,rtl_tcp:null}` or `{configured:true,rtl_tcp:{host,port},sentry_device_id}` | never errors | reads `/api/v1/sdrs` export |

`InstanceIdentity` (`app/instanceId` = `sentinel:<uuid4>` generated once).

### 3.9 SdrModule and sub-modules ← `backend/routers/sdr.py`, `services/sdr.py`, `services/sdr_decode.py`, `services/sdr_data.py`

`SdrModule` only aggregates. All REST paths are absolute (`/api/sdr/...`) as in the Python router (no prefix).

#### 3.9.1 SdrRadiosModule ← `sdr.py:377-448` (+ `_device_availability`)

| Method | Path | Request | Response | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/sdr/radios` | — | `sdr.radios[]` each annotated `device_available`, `unavailable_reason` ("Its Sentry host is not reachable." / "The dongle is unplugged." / "The device is disabled on its Sentry." / "Sentry has not assigned this device an output port." / "Device not found." / "") | — |
| POST | `/api/sdr/radios` | `RadioIn` (`sentry_device_id` ≤256, `notes`/`antenna` ≤2000, `visibility` public\|private) | `201` new radio `{id,created_at,…body}` (id = max+1) | 422 |
| PUT | `/api/sdr/radios/:radio_id` | `RadioIn` | `200` merged radio | `404 {"detail":"Radio not found"}` |
| DELETE | `/api/sdr/radios/:radio_id` | — | `204` | 404 |

Storage is the `sdr.radios` JSON setting (not the `sdr_radios` table) — `SdrRadiosStore.getRadios()/saveRadios()/getById()` shared by every other SDR sub-module.

#### 3.9.2 SdrFrequenciesModule ← `sdr.py:451-660, 707-759`

Groups: `GET /api/sdr/groups` (by `sort_order`), `POST` (201; slug = unique `slugify(name) || 'group'` with `-2,-3…` suffix), `PUT /:group_id`, `DELETE /:group_id` (204; ungroups frequencies, deletes links). Frequencies: `GET /api/sdr/frequencies` (order `group_id, frequency_hz`; each with `group_ids[]`), `POST` (201), `PUT /:freq_id` (full replace; `group_ids ?? [group_id] ?? []`), `PATCH /:freq_id` (`{favourite?}` only; explicit null = no-op returning 200 unchanged **without** sync), `DELETE /:freq_id` (204). Bulk editors: `GET/POST /api/sdr/data/frequencies` (`{groups,frequencies,searchRanges}`), `GET/POST /api/sdr/data/bandplan` (`{bandPlan:[]}`; `400 "Body must be a JSON object with a bandPlan array"`). Every mutation calls `SdrConfigMirror` then `SdrDataFiles.writeFrequenciesFile()` (`_sync_groups`). `GroupIn.name` → `clean_group_name` (422 on reject).

#### 3.9.3 SdrSearchRangesModule ← `sdr.py:663-704`, `sdr_data.reconcile_search_ranges`

`GET/POST/PUT/DELETE /api/sdr/search-ranges[/:range_id]`; `400 "low_hz must be less than high_hz"`, `400 "step_hz must be positive"`, 404. Mutations mirror `sdr.searchRanges` + rewrite the file.

#### 3.9.4 SdrRecordingsModule ← `sdr.py:762-925`

| Method | Path | Request | Response | Errors |
| --- | --- | --- | --- | --- |
| GET | `/api/sdr/recordings` | — | complete rows, newest first | |
| POST | `/api/sdr/recordings/start` | `RecordingStartIn` | `201 {"id"}`; name `Recording YYYY-MM-DD HH:MM`; if `sdr.recordRawIq === true` and a broadcaster exists → start `.u8` capture, `has_iq_file=true` | |
| POST | `/api/sdr/recordings/stop` | multipart: `recording_id`, `file` (WAV), `name?`, `ended_at?`, `duration_s?` | `200` row dict | 404 |
| PATCH | `/api/sdr/recordings/:rec_id` | `{name?,notes?}` (control chars stripped except `\t\n`, ≤250) | row | 404, 422 |
| DELETE | `/api/sdr/recordings/:rec_id` | — | `204`; unlinks `.wav`/`.u8` | 404 |
| GET | `/api/sdr/recordings/:rec_id/file` | — | `audio/wav` attachment `"{safe}.wav"` | `404 "WAV file not found on disk"` |
| GET | `/api/sdr/recordings/:rec_id/iq` | — | `application/octet-stream` `"{safe}.u8"` | `404 "IQ file not found"` |

§4i covers file I/O.

#### 3.9.5 SdrStreamModule ← `sdr.py:928-1385`, `services/sdr.py`

REST: `POST /api/sdr/connect` (`ConnectIn`; `404`; `503 "{name} is unavailable. {reason}"`; `503 str(ConnectionError)`; `{status:"connected",radio_id,is_owner,control_available,locked}`), `POST /api/sdr/disconnect` (`{status:"disconnected"}`), `GET /api/sdr/status/:radio_id` (`{radio_id,radio_name,…reachability}`). WS: `/ws/sdr/:radio_id` (spectrum + control), `/ws/sdr/:radio_id/iq` (binary). Design in §4a/§4b/§4d.

#### 3.9.6 SdrDecodeModule ← `sdr.py:1388-1441, 1557-1640`, `services/sdr_decode.py`

REST: `POST /api/sdr/decode/ingest` (`X-Decode-Secret` header; `503 "decode ingestion disabled"`, `401 "invalid decode secret"`, `409 "decode not active"`; event ≤4096 bytes serialised; publishes `{type:"decode_event",…event}`), `GET /api/sdr/decode/config` (`{active}`), `GET /api/sdr/decode/status/:radio_id` (`{radio_id,active,decoder_reachable}`). WS: `/ws/sdr/:radio_id/decode` (events), `/ws/sdr/:radio_id/decode/audio` (binary PCM). `IngestSecretResolver` ← `resolve_ingest_secret` (env > file > generate `token_urlsafe(32)` → `crypto.randomBytes(32).toString('base64url')`, chmod 0644, in-memory fallback on EROFS). Constant-time compare via `crypto.timingSafeEqual` on equal-length buffers (mismatched lengths → false).

#### 3.9.7 SdrAprsModule ← `sdr.py:1444-1554`

`POST /api/sdr/aprs/start` (`AprsControlIn`; 404; 503 unavailable; `502 "radio connect failed: …"`; persists `sdr.aprs_radio_id`), `POST /api/sdr/aprs/stop` (clears to `null`), `GET /api/sdr/aprs/status/:radio_id`, `POST /api/sdr/aprs/ingest` (secret; `409 "aprs decode not active"`; upserts station when positional; publishes `{type:"aprs",…}`), `GET /api/sdr/aprs/config`. `resumePersistedAprs()` runs at bootstrap (best-effort, logs and continues).

### 3.10 StaticServingModule ← `backend/main.py:132-182`

Registered **last**, in this order, using Express middleware on the Nest HTTP adapter:

1. `GET /health` → `{status:"ok",timestamp}`.
2. `GET /favicon.ico` → `assets/favicon.ico` as `image/x-icon`.
3. `express.static('assets')` mounted at `/assets` (must support **HTTP Range** — PMTiles depend on it; Starlette `StaticFiles` does; `express.static`/`send` do; golden test §6-i includes a Range request).
4. `/fonts` → `dist/spa/fonts` if it exists; `/spa-assets` → `dist/spa/spa-assets` if it exists (conditional mounts as in `main.py:155-160`).
5. Catch-all `GET *` → `dist/spa/index.html` with `Cache-Control: no-cache, no-store, must-revalidate`, else `503 {"detail":"SPA not built. Run: cd frontend/vue && npm run build"}` (message text updated to the new path — **a deliberate string change; flagged in §9**).

Because the catch-all is `GET` only, non-GET unknown routes yield Express's default 404 where FastAPI returned 405; golden-master records both and the filter normalises to FastAPI's `{"detail":"Method Not Allowed"}` / `{"detail":"Not Found"}` bodies.

### 3.11 LifecycleModule ← `backend/main.py:37-109`

`OnApplicationBootstrap` (runs after all modules' `onModuleInit`), in this exact order:

1. `SchemaMigrator.ensureSchema()` (create_tables)
2. `SdrRadiosMigration.run()`
3. `RemovedSettingsPruner.run()`
4. `SettingsSeeder.run()`
5. `SdrDataSeeder.seedFrequenciesFile()`
6. `SdrDataSeeder.seedBandplanFile()`
7. `SatelliteRadioBackfill.run()`
8. `IngestSecretResolver.resolve()`
9. `SdrAprsService.resumePersistedAprs()`
10. start `DailyCleanupLoop` (run `cleanupOldSnapshots` + `aprsStore.cleanupExpired` immediately, then every 24 h; each step try/catch-logged; timer `unref()`'d)
11. `SentryFleetPoller.startAll()`

Signal handling: `app.enableShutdownHooks()` plus a `process.on('SIGTERM'|'SIGINT')` listener registered **before** Nest's, which synchronously calls `SdrStreamService.wakeAllSubscribers()` and `SdrDecodeService.wakeAllDecoders()` (push the `null` sentinel into every subscriber queue so every pending `queue.take()` resolves and the WS send loops exit). Then Nest's hook runs `beforeApplicationShutdown` → `LifecycleService.shutdown()`: cancel cleanup loop → `fleetPoller.stopAll()` → `sdrDecode.shutdownAllDecoders()` → `sdrStream.shutdownAll()` → `wss.clients.forEach(terminate)` → HTTP server close. Same order as `main.py:99-109`.

### 3.12 Common (`apps/api/src/common`)

`FastApiCompatExceptionFilter`, `ZodValidationPipe`, `Clock`, `withServiceErrors`/`withUnexpectedErrors`, `BoundedQueue<T>` (asyncio.Queue port: `maxsize`, `putDropping` = drop-oldest, `take(): Promise<T|null>`, `wakeAll()`), `AsyncMutex`, `Logger` (Nest logger with `LEVEL name: message` format).

---

## 4. Hard-parity deep dives

### 4a. rtl_tcp client + RadioBroadcaster ← `backend/services/sdr.py`

**Node design (`apps/api/src/sdr/stream/`):**

```
RtlTcpConnection            ← RtlTcpConnection dataclass (sdr.py:289-680)
RelayControlClient          ← RelayControlClient (sdr.py:110-286)
RadioBroadcaster            ← RadioBroadcaster (sdr.py:686-905)
SdrConnectionRegistry       ← _connections/_broadcasters dicts + get_or_create_*, close_connection, connection_status, reachability_status, shutdown_all, wake_all_subscribers (sdr.py:940-1198)
FftWorkerPool               ← asyncio.to_thread(compute_fft_frame) (sdr.py:873)
SdrWebSocketServer          ← @router.websocket handlers (routers/sdr.py:1054-1385)
```

- **Socket**: `net.createConnection({host, port})` with a 5 s connect timeout (`socket.setTimeout` + destroy), then read and discard the 12-byte `RTL0` header (3 s timeout). Keepalive: `socket.setKeepAlive(true, 2000)`; Node cannot set `TCP_KEEPINTVL`/`TCP_KEEPCNT` portably — **parity gap**: Python set idle 2 s / interval 1 s / count 3 (≈5 s detection) on Linux; Node gets idle 2 s and the kernel defaults for interval/count (`net.ipv4.tcp_keepalive_intvl`=75 s, `probes`=9 by default) ⇒ dead-peer detection could take minutes instead of ~5 s. Mitigation: the broadcaster's own 10 s `readexactly` timeout already bounds detection to ≤10 s (`read_iq_chunk` `wait_for(..., timeout=10.0)`), so the observable behaviour (status dot red within ~10 s) is preserved; additionally set `sysctl` in the container (`net.ipv4.tcp_keepalive_intvl=1`, `tcp_keepalive_probes=3`) via compose `sysctls:` to restore the 5 s figure. Recorded in §9.
- **Command frames**: `Buffer.alloc(5)`; `buf[0]=cmd; buf.writeUInt32BE(value,1)`. Same command bytes `0x01,0x02,0x03,0x04,0x08`, gain tenths `max(0, Math.round(gain*10))` (Python `round` half-even vs JS `Math.round` half-up only differ at exact `.05` dB ties — accepted; gains are UI steps of 0.1 dB or rtl gain table values).
- **Time-sized reads**: `readIqChunk()` → `n = clamp(floor(sampleRate * 40 / 1000), max(4096, fftSize), 131072)` samples ⇒ `2n` bytes; implemented with an internal byte accumulator over `socket.on('data')` (chunks concatenated until `2n` available; leftover carried), 10 s timeout per read ⇒ `ConnectionError`. EOF (`'end'`/`'close'`) while waiting ⇒ reconnect path. **Backpressure**: `socket.pause()` when the accumulator exceeds 4 × chunk (rtl_tcp cannot be slowed anyway; it will buffer/drop on its side exactly as with Python's kernel buffer) — keeps memory bounded.
- **One broadcaster per radio**: `RadioBroadcaster.run()` loop mirrors `_run` exactly: `await setImmediate` each iteration (the `asyncio.sleep(0)` yield), idle grace 10 s with `close_control()+disconnect()` release, reconnect with backoff 1 s→10 s ×2 while subscribers exist and a `{type:"status",connected:false,reconnecting:true}` frame, FFT only when spectrum subscribers exist, IQ fan-out with the 8-byte LE header (`writeUInt32LE(sampleRate,0)`, `writeUInt32LE(centerHz,4)`).
- **Subscriber queues**: `BoundedQueue` maxsize 4 (spectrum), 4 (IQ), 8 (IQ recording), drop-oldest semantics identical to `_put_dropping`. `stop()` pushes `null` to all, clears lists, cancels the loop (an `AbortController` checked at each await).
- **wake-on-shutdown**: `wakeAllSubscribers()` is synchronous (iterates registries, `queue.putNowait(null)`), invoked from the signal listener (§3.11).
- **Ownership/relay control**: `RelayControlClient` over `net` with `readline`-style NDJSON parsing (`\n` split, `JSON.parse` per line, ignore parse errors and non-`state` events). `_await_next_state` = a promise resolved by the next state push, raced against `sdr_relay_control_timeout_s`. `claim()`, `release()`, `set(fields)`, `close()`; `available=false` + wake on read-loop end. `RtlTcpConnection._ensure_control` re-claim-on-reconnect logic ported verbatim (`sdr.py:388-424`), `ReadOnlyTuningError` → WS `control` frame with `is_owner:false`.
- **Reachability probe cache** (`_reachability_cache`, TTL 8 s, one retry after 250 ms, `RTL0` magic check, 1.5 s timeouts) ported as `ReachabilityProbe`.
- **Cache keys** `"host:port"` and `rpartition(':')` parsing preserved (IPv6 not supported today either).

### 4b. FFT + spectrum frame ← `services/sdr.py:911-951` (`compute_fft_frame`)

`packages/dsp/src/spectrum.ts`:

1. `iqBytesToComplex(Uint8Array) → {re: Float32Array, im: Float32Array}`: `(byte - 127.5) / 127.5` computed and **stored as float32** (numpy `astype(np.float32)` then arithmetic in float32) — do the arithmetic in float64 then assign into `Float32Array` (assignment rounds to nearest float32, matching numpy's float32 ops for these values; verified by fixture).
2. `hannWindow(n)`: `np.hanning(n)` = symmetric Hann `0.5 - 0.5*cos(2πk/(n-1))` cast to float32. Port exactly (note: **symmetric**, not periodic).
3. Welch averaging: `nAvg = max(1, floor(len/nFft))`; per segment multiply by window (float32×float32 → in numpy stays complex64, i.e. float32 products), FFT via `fft.js` (`FFT(n).transform(out, in)` on interleaved arrays; double precision — numpy `np.fft.fft` upcasts complex64 → complex128 so the FFT is double precision on float32-valued inputs: replicate by copying the float32 windowed segment into a Float64Array before the transform), `fftshift`, accumulate `|X|²` in float64.
4. dBFS: `10*log10(avg + 1e-12) - 10*log10(n²/16)`, `round(v, 1)` with **Python round-half-even on the decimal repr** — implement `pythonRound1(v)` = `Number(v.toFixed(1))` is *not* identical (toFixed rounds half away from zero on the binary value). Use: `const scaled = v * 10; const r = Math.round(scaled); if (Math.abs(scaled - Math.trunc(scaled)) === 0.5) → choose even; return r / 10` — plus fixture verification. Exact `.x5` ties in dB values are measure-zero in practice; the fixture asserts equality after rounding and reports any tie mismatches separately.
5. Frame: `{type:"spectrum", center_hz, sample_rate, bins: number[], timestamp_ms}`. Key order matters only for byte-golden compare; the WS conformance test compares parsed JSON.
6. `fft_size` clamp: `set_fft_size` (`sdr.py:657-673`): clamp to [1024, 32768], round **up** to the next power of two via `1 << (32 - Math.clz32(n))` when not already a power of two, cap again.

**Worker**: one `worker_threads` worker per process (`FftWorkerPool`, size = 1 by default, `SENTINEL_FFT_WORKERS` env optional — new key, documented as additive) receiving `{raw: ArrayBuffer (transferred), nFft, sampleRate, centerHz}` and returning the bins `Float64Array` (transferred). Frame assembly in the main thread.

**Parity test** (`parity/dsp/fft/*.json`, generated by `tools/parity/gen_fft_fixtures.py` run against the *current* Python code before it is deleted): 12 cases × {nFft ∈ 1024, 4096, 32768} × {chunk sizes 4096, 87040, 131072 samples} × {tone at bin k, noise (seeded), DC, full-scale square}. Assertions: pre-rounding `power_db` within `1e-6` dB absolute per bin; post-rounding bins equal, allowing ≤0.1 difference on ≤0.01% of bins (ties), reported.

### 4c. FM demod chain for the decoder PCM feed ← `services/sdr_decode.py:95-343`

`packages/dsp/src/demod/`:

| TS | Python | Notes |
| --- | --- | --- |
| `computeIqDecimation(sampleRate, bwHz)` | `_compute_iq_decim` | `targetMaxSr = max(bw*2.2, 1_024_000)`; doubling while `< 8` and `sr/(decim*2) >= target`. |
| `buildLpfTaps(cutHz, sampleRate): Float64Array` | `_build_lpf_taps` | 65 taps, Hamming `0.54-0.46cos(2πk/64)`, sinc singularity `2πfc`, normalised to sum 1. |
| `DemodState` class | `DemodState` dataclass | `offsetHz, bwHz, ncoPhase, iqDecim, iqLeftover{re,im}, lpfTaps, lpfBw, lpfSr, lpfTail{re,im}, fmPrev{re,im}=(1,0), resPhase, resPrev`; `resetFilters()`. |
| `decimateIq` | `_decimate_iq` | boxcar mean over `factor`, carry leftover. |
| `mixNco` | `_mix_nco` | `dPhase = -2π·offset/sr`; phase per sample `phase0 + k·dPhase` (compute `cos/sin` per sample — numpy did the same via `np.exp(1j*phases)`); end-phase wrap `((end+π) mod 2π) - π` using Python's true modulo (`((x % m) + m) % m`). |
| `lpfChannel` | `_lpf_channel` | rebuild taps on bw/sr change; prepend tail; direct-form FIR = `np.convolve(mode='valid')` (float64 accumulation; sum order differs from numpy's — bounded by ~1e-15 relative). |
| `fmDiscriminate` | `_fm_discriminate` | `atan2(im, re)` of `x[k]·conj(x[k-1])`, carry prev. |
| `resampleToOutput` | `_resample_to_output` | linear interpolation walking `phase += inputRate/48000`; `if step <= 1` passthrough; carry `resPhase-count`, `resPrev`. |
| `demodChunk(raw, sampleRate, state): Int16Array` | `demod_chunk` | LPF only when `0 < bw/sr < 0.95`; scale `audio/π*32767`, clip `[-32768, 32767]`, **truncate toward zero** (`astype('<i2')` truncates) ⇒ `Math.trunc`. Output `Buffer` LE. |
| `DecodedAudioResampler` | `_resample_to_output` (bridge) + `_measure_input_rate` | `np.linspace(0, n-1, dst)` + `np.interp` ⇒ port with `positions[i] = i*(n-1)/(dst-1)` (numpy linspace semantics incl. `dst==1`), `Math.trunc` to int16; rate measurement window 1.5 s, `Math.round(samples/elapsed)`. |

**Worker**: `DemodWorker` per bridge; main thread posts IQ `ArrayBuffer`s (transferred) and receives PCM `ArrayBuffer`s; state lives in the worker. Equivalent to Python's `to_thread` with a shared `DemodState` (single consumer).

**Parity fixtures** (`parity/dsp/demod/`): Python script feeds deterministic IQ (seeded noise + FM-modulated 1 kHz tone at offset 0 / +200 kHz / −50 kHz; sample rates 2.048 M / 1.024 M / 300 k; bw 12 500 / 15 000 / 500 000) through `demod_chunk` in 6 successive chunks (to exercise carried state and a mid-stream `set_channel`). TS asserts: per-sample `|Δ| ≤ 1` LSB for ≥ 99.99% of samples, `max |Δ| ≤ 2` LSB, identical sample **counts** per chunk (resampler phase carry), and identical decimation factor decisions.

### 4d. PCM TCP server + UDP audio receiver + relay control channel ← `sdr_decode.py:349-745`, `sdr.py:110-286`

- `PcmDecodeBridge` (abstract) → `net.createServer` on `0.0.0.0:pcmPort` (port 0 allowed; actual port read back from `server.address()`), single active decoder writer (a new connection closes the previous), `decoderReachable` flips on connect/disconnect and publishes `{type:"decode_status", decoder_reachable}` (+ `audio_sample_rate: 48000` for the voice bridge). Demod loop: `iqQueue.take()` → strip 8-byte header → worker → `socket.write(pcm)`; on `EPIPE/ECONNRESET` mark unreachable. `subscribeEvents()` (maxsize 64; first item is the status frame), `publishEvent`, `wake()`, `stop()` (unsubscribe IQ, close writer, close server with 2 s cap, `_on_stop`, drain subscribers).
- `DigitalDecodeBridge` adds `dgram.createSocket('udp4').bind(audioUdpPort, '0.0.0.0')`, rate measurement, resample, audio subscriber queues (maxsize 8).
- `AprsDecodeBridge` = PCM spine with `aprs_decoder_pcm_port` and `aprs_decoder_default_bw_hz`.
- Registries: `_bridges` / `_aprs_bridges` keyed `"host:port"`; `getOrCreate*` stops *other* bridges of the same kind first; `getActive*` = first value.
- Relay control channel NDJSON: §4a.

### 4e. SGP4, orbit math, day/night ← `services/satellite.py`, `services/daynight.py`, `services/tle.py`

`packages/orbit/src/`:

- `sgp4.ts`: thin wrapper over `satellite.js` — `parseTle(line1,line2) → satrec` (`twoline2satrec`), `propagateAt(satrec, jd, fr)` = `sgp4(satrec, minutesSinceEpoch)` where minutes = `((jd + fr) - (satrec.jdsatepoch + satrec.jdsatepochF)) * 1440` (matches Python's `Satrec.sgp4(jd, fr)`), returning `null` when the error code ≠ 0 (satellite.js returns `false`/sets `satrec.error`). Period from `satrec.no_kozai` (fallback `satrec.no`; both are rad/min — **verify at Phase 4 which field the installed version populates** — §9).
- `jday.ts`: `jdayNow(clock)` via `satellite.js jday(y,m,d,h,mi,s+ms/1000)` returning `{jd, fr}` split as Python does (integer part / fraction — Python `sgp4.api.jday` returns `(jd, fr)` with `jd` the 0.5-aligned integer part); `jdayOffset(jd, fr, seconds)` ported verbatim including the negative-branch `int(abs(fr))+1` quirk.
- `geodetic.ts`: `eciToGeodetic(rKm, date)` **ported from `_eci_to_geodetic`** (J2000 days from `(t - 2000-01-01T12:00Z)/86400`, GMST `fmod(280.46061837 + 360.98564736629·d, 360)` — JS `%` on positives equals `math.fmod`; negative `d` never occurs), spherical latitude, `alt = |r| − 6371`.
- `position.ts`, `groundTrack.ts` (4 orbits × 360 samples, unwrapped longitudes, `round(...,4)`), `passes.ts` (backscan 20 min, 1-minute coarse scan, 10-iteration bisection, 5 s max-el refinement, ≤10 passes, `sky_track` 25 points, ISO `YYYY-MM-DDTHH:MM:SSZ` via a `formatUtcSeconds` helper, `aos_unix_ms = int(aos_dt.timestamp()*1000)` ⇒ `Math.trunc`), `lookAngles.ts`, `footprint.ts` (181-point ring at 2°, unwrap, polar enclosure when `|winding| > 270`, antimeridian split with `_world_of = floor((L+180)/360)`, hemisphere-vote boundary normalisation, shoelace CCW). Python `%` is true modulo — every `(x + 180) % 360 - 180` must use `mod(x, 360)` helper.
- `terminator.ts` ← `daynight.py` (Spencer 1971, equinox threshold 0.001°, 361 integer longitudes, pole cap with the `[0, pole]` midpoint, crossing assertion).

**Rounding**: Python `round(x, n)` (half-even on the shortest decimal) vs JS — implement `pythonRound(x, n)` once in `packages/orbit/src/rounding.ts` and `packages/dsp` re-exports it; fixtures check.

**Parity fixtures** (`parity/orbit/`): 25 real TLEs (ISS, GPS, GEO, Molniya, a CubeSat, a decaying object producing an SGP4 error) × 5 frozen instants × 3 observers (55°N, 0°, −60°S) ⇒ position (`|Δlat|,|Δlon| ≤ 1e-4`, `|Δalt| ≤ 0.1 km`, `|Δvel| ≤ 1e-3`, `|Δtrack| ≤ 0.1°` after rounding), ground track coordinate-wise same tolerance and identical point counts, passes: identical count, `|Δaos_unix_ms| ≤ 1000`, `|Δmax_el| ≤ 0.1`, footprint: identical geometry type, ring count, vertex count, `|Δ| ≤ 1e-4`; terminator at 6 instants incl. the March-2026 equinox second: identical ring lengths, `|Δ| ≤ 1e-6`.

### 4f. ADS-B upstream rate limiting, 429 penalty, readsb adapter, SQLite cache ← `services/adsb.py`, `upstream_rate_limit.py`, `routers/air.py`

Covered in §3.4. Additional parity points:

- Monotonic clock: `performance.now()/1000` via `Clock.monotonicMs()`.
- The limiter's lock: reservation bookkeeping under `AsyncMutex`, sleep outside; `max_wait` comparison uses `>` (strict).
- `_cooldown_seconds`: parse `Retry-After` as float seconds only (HTTP-date ⇒ default); clamp to `adsb_rate_limit_max_penalty_ms/1000`.
- Error classes: `UpstreamThrottledError`, HTTP status errors (undici `Response.ok === false` ⇒ custom `HttpStatusError{status}`), transport errors (`TypeError: fetch failed`, `AbortError`) — mapped to the same three branches in `getAircraftNearPoint` with the same `logger.warn` texts (host via `new URL(base).host`).
- Golden tests use a stub upstream (`packages/testing/src/upstreamStub.ts`) scripted with the same sequences the pytest suite uses (`tests/backend/test_adsb_rate_limit_backoff.py`, `test_adsb_readsb_source.py`).

### 4g. Sentry client + fleet poller ← `services/sentry_client.py`, `services/sentry_fleet.py`

**External Sentry HTTP contract (captured verbatim, this is the wire contract Sentinel depends on):**

| Sentry endpoint | Used by | Auth | Notes |
| --- | --- | --- | --- |
| `POST /api/auth/login {password}` → sets cookie `sentry_session` | `_sign_in` | none | called on first 401, once |
| `GET /api/health` | `test`, `info` | none | `X-Sentry-Api-Version` header captured |
| `GET /api/status` → `{generated_at, sdrs:[{device_id, present, enabled, output:{host, iq_port}, …}]}` | fleet poller | cookie | 2 s poll |
| `GET /api/v1/sdrs` → `{source:{name,version,host,http_port,location:{latitude,longitude,updated_at}}, sdrs:[{sentry_device_id, host, port, …}], control_port_offset}` | poller export (60 s), `info`, adsb-source config | none | |
| `GET /api/devices` | devices/records | cookie | |
| `PATCH /api/devices/{id}` (+ `X-Sentry-Reservation-Holder`) | device patch, claim_and_tune | cookie | |
| `DELETE /api/devices/{id}` | delete device | cookie | |
| `POST /api/devices/{id}/serial {serial, confirm:true}` | serial flash | cookie | |
| `POST /api/devices/{id}/reservation {holder,label,ttl_seconds,force}` | claim | cookie | 409 when held |
| `DELETE /api/devices/{id}/reservation` (+ holder header) | release | cookie | |
| `GET/PUT/DELETE /api/hotspot`, `GET /api/hotspot/interfaces`, `/clients`, `POST /api/hotspot/enable|disable {confirm_uplink_loss}`, `POST /api/hotspot/confirm` | wifi proxy | cookie | |

Error envelope parsing (`_parse_error_envelope`): `{"detail":{code,message,…ctx}}` → typed; `{"detail":[{loc,msg}]}` → `validation_error` with flattened `"field: msg; …"` message and `{errors}` context; `{"detail":"str"}` → `upstream_error`; else generic `"Sentry returned HTTP {n}."`.

Node: `undici.Agent({ connect: { timeout: connect_ms }, headersTimeout: read_ms, bodyTimeout: read_ms })` per client to reproduce httpx's separate connect/read timeouts; `SentryUnreachableError` messages `"Timed out reaching Sentry host {a}:{p}."` / `"Could not reach Sentry host {a}:{p}."`; device ids percent-encoded with `encodeURIComponent` (equivalent to `quote(v, safe="")`). Address validation regex and forbidden substrings ported verbatim; `ipaddress.IPv4Address` ⇒ `net.isIPv4`.

Fleet poller: §3.7. Tests port `tests/backend/test_sentry_client.py`, `test_sentry_fleet.py`, `test_sentry_radio_following.py` against an in-process fake Sentry (`packages/testing/src/fakeSentry.ts`).

### 4h. Settings store, seeding, config upload/preview/export, prune, migrations, JSON write-back

Covered in §3.2–§3.3 and §3.9.2. Parity subtleties worth naming:

- Seeder timestamps: one `ts` per seeder run (Python computes `ts` once before the loop).
- `_canonical_key_order` is cached once per process (lru_cache) — replicate with a module-level memo so a runtime edit of `default_config.json` has the same (non-)effect.
- `config_upload` reads the whole file into memory; size is unbounded today — keep unbounded (constraint #1) but log a §9 note recommending a limit post-cutover.
- File write-back targets: `data/sdr_frequencies.json` (git-ignored, runtime-owned — verify `.gitignore` carries the rule over), `data/sdr_bandplan.json`, `data/satellite_radio.json` (git-tracked, written on UI edit). Paths resolved relative to the app root (`DATA_DIR`), overridable in tests exactly as `conftest.isolate_sdr_data_files` does.

### 4i. Recordings ← `routers/sdr.py:762-925`, `services/sdr.py:723-760`

- `.u8` IQ capture: `RadioBroadcaster.startIqRecording(path)` subscribes a maxsize-8 queue and drains to `fs.createWriteStream(path)` writing `payload.subarray(8)`; `stopIqRecording(queue)` unsubscribes + pushes `null`; the stop handler waits 200 ms (`asyncio.sleep(0.2)`) before stat'ing the file — keep the same sleep so `iq_file_size_bytes` matches under the same timing.
- WAV upload: multer memory storage → `fs.writeFileSync(`${id}.wav`)`; `file_size_bytes = buffer.length`.
- Downloads: `res.download`/`sendFile` with `Content-Disposition: attachment; filename="{safe}.wav"` where `safe = name.replace(/[^A-Za-z0-9 _-]/g,'').trim() || `recording_${id}``. Python's `str.isalnum()` is Unicode-aware (keeps `é`, CJK) — use `/[\p{L}\p{N} _-]/u` to match. Starlette adds `filename*=utf-8''…` when non-ASCII; golden test covers an accented name.
- Streaming: `sendFile` streams with Range support (Starlette `FileResponse` supports Range) — verified in golden tests with a `Range: bytes=0-99` request.

### 4j. Sidecar contracts ← `decoder/entrypoint.py`, `decoder/aprs/entrypoint.py`, `decoder/adsb/entrypoint.py`, `docker-compose.yml`

Preserved verbatim in v1 (D11). The backend-facing contract each sidecar depends on:

| Sidecar | Env (defaults) | Backend endpoints it calls | Sockets |
| --- | --- | --- | --- |
| `decoder` (dsd-fme) | `IQ_PCM_HOST=app`, `IQ_PCM_PORT=7355`, `AUDIO_UDP_HOST=app`, `AUDIO_UDP_PORT=7356`, `INGEST_URL=http://app:8000/api/sdr/decode/ingest`, `CONFIG_URL=http://app:8000/api/sdr/decode/config`, `INGEST_SECRET`, `INGEST_SECRET_FILE=/run/decoder/secret`, `DSD_EXTRA_ARGS` | `GET config` (header `X-Decode-Secret`) polled before each launch; `POST ingest {event}` | TCP client → backend PCM :7355; UDP sender → backend :7356 |
| `aprs-decoder` (Direwolf + aprslib) | `IQ_PCM_HOST=app`, `IQ_PCM_PORT=7357`, `INGEST_URL=…/api/sdr/aprs/ingest`, `CONFIG_URL=…/api/sdr/aprs/config`, secret vars, `APRS_EXTRA_ARGS` | same pattern | TCP client → :7357; `direwolf -t 0 -r 48000 -b 16 -B 1200 -` on stdin |
| `adsb-decoder` (readsb via socat) | `CONFIG_URL=…/api/sdr/adsb/config`, `RTL_TCP_HOST/PORT` fallback, `SENTRY_API_BASE`, `JSON_DIR=/run/adsb/data`, `HTTP_PORT=8080`, `READSB_EXTRA_ARGS` | `GET /api/sdr/adsb/config` (no auth) | serves `aircraft.json` on :8080 (published 8090) |

Note the sidecars address the API as `app:8000` — the Node container keeps listening on **8000 inside the network** (compose maps `8080:8000`) so no sidecar env changes. This intentionally deviates from the user's "Node apps default to port 3000" rule to honour constraint #1 (§9 lists it for owner confirmation).

Phase 12b (optional, gated): port the three supervisors to Node (`apps/decoder-*`, `node:child_process`, same env contract, same log-parsing regexes ported 1:1 from `parse_dsd_line`, `parse_aprs_packet`). `aprslib` replacement candidates: `aprs-parser` (npm) — must be validated against the `tests/backend/test_decoder_aprs_entrypoint.py` fixtures; if field-parity cannot be shown, the APRS supervisor stays Python.

---

## 5. Frontend modularisation plan (no visual or behavioural change)

Principle: the SPA moves to `apps/web` **as-is first** (Phase 1 is a `git mv` + path fixes), then is decomposed in small PRs each gated by the golden-screenshot + vitest + e2e suite (§5.7). No PR in this stream may change a rendered pixel, a DOM role/name, a keyboard path, or a store contract.

### 5.1 `packages/ui` — the primitives (from `frontend/vue/src/components/base/`)

Moved verbatim with their spec files and scoped CSS: `BaseAccordionSection`, `BaseButton`, `BaseCheckbox`, `BaseDataCell`, `BaseDataGrid`, `BaseIconAction`, `BaseIconButton`, `BaseList`, `BaseListItem`, `BaseNumberSetting`, `BasePillToggle`, `BaseSelectMenu`, `BaseSliderRow`, `BaseToggleSetting`, `BaseToggleSwitch`, `IconRail`, `IconRailAccordion` (17 — the brief's "13" predates `IconRail*`, `BaseDataCell`, `BaseDataGrid`, `BaseList`, `BaseListItem`). Plus the icon SFCs from `components/shared/` that are pure presentational (`BellIcon`, `ChevronIcon`, `FilterFunnelIcon`, `FilterSubTabIcon`, `LocationPinIcon`, `MyLocationIcon`, `ScrollHintChevronIcon`), `components/shared/settings/SettingRow.vue` and `SettingsDropdown.vue` (generic settings-row/menu chrome), and the composables they depend on (`useDisclosure`, `useTeleportedMenu`, `useRadioGroupKeyboard`, `useDocumentEvent`, `useWindowEvent`, `useDialog`). Also the design tokens + reset (§5.5).

Rule carried from ADR-0002 and the user's global standard: anything used in two places becomes a `packages/ui` primitive; feature components compose primitives via slots/props.

### 5.2 `packages/map-controls`

`SentinelControlBase.ts` (from `components/air/controls/sentinel-control-base/`), `RangeRingsControlBase.ts` + `RingOriginPicker.vue` + `RingOriginOption.vue` (from `components/shared/controls/range-rings/`), `mapCluster.ts`, `mapLabelParts.ts`, `mapMarkerAria.ts`, `UserLocationMarker.ts`, `utils/rangeRings.ts`, `utils/distanceUtils.ts`, `utils/locationUtils.ts`, and the shared toggle controls `NamesToggleControl`, `RoadsToggleControl`, `SentrySitesControl`. The `maplibre-control` skill's folder convention (`components/<domain>/controls/<feature>/`) stays for domain-specific controls inside `apps/web`; the package holds only the base classes and cross-domain controls. The inline `style.cssText` in `SentinelControlBase.onAdd` (`#000` background, 29 px button, `#c8ff00` active colour) is kept byte-for-byte — it is the visual contract.

### 5.3 Decomposition targets (name → parts; each part single-responsibility; behaviour moves, never changes)

| File (lines) | New composition | Notes |
| --- | --- | --- |
| `sdr/SdrWaterfall.vue` (3,384) + `.css` (714) | `SdrWaterfall.vue` (orchestrator, plots + draw loop) + composables `useWaterfallZoom` (346-471), `useWaterfallDbRange` (312-345, 472-534), `useTunedMarkerAccordion` (545-600, 1426-1666), `useKnownFrequencyMarkers` (601-760), `useFreqAxisDrag` (1120-1286), `useWaterfallWheelPan` (1287-1364), `useWaterfallTouchBridge` (1667-1868), `useWaterfallTimeMarkers` (1895-1924), `useSignalMarker` already exists (2090-2360 moves into it), `useWaterfallPipes` (2363-2445), sub-components `WaterfallBandPlanStrip`, `WaterfallSearchReadout` (189-210), `WaterfallSliders` (1869-1894) | sigplot instances stay non-reactive module refs (comment at 535). |
| `air/controls/adsb/AdsbLiveControl.ts` (2,696) | `AdsbLiveControl` (IControl shell, `onAdd/onRemove/toggle`) + `AdsbFilterState` (209-369), `AdsbLayerBuilder` (455-785), `AdsbTagRenderer` (786-1294: tag HTML, status bar, hover/selected tags), `AdsbCallsignLabels` (1295-1778), `AdsbTrailRenderer` (1779-1915), `AdsbInterpolator` (1916-2009), `AdsbFetcher` (2010-2324: polling, X-Cache handling, `handleConnectivityChange`), `AdsbTrackingPersistence` (2338-2480), `AdsbPlaybackBridge` (2495-2552) | Labels remain permanently on (memory: PR #165). |
| `air/controls/awacs/AwacControl.ts` (2,407) | same pattern: `AwacControl` + layer builder, orbit/track renderer, fetch/poll, selection/tag renderer | Read at Phase 11 start; section markers absent, so split along class-method clusters. |
| `sdr/SdrPanel.vue` (1,998) + `.css` (2,096) | already engine-in-composables (memory: P0–P8). Remaining split: `SdrTransportBar` (tune/stop/rec/decode pills), `SdrFrequencyReadout` (1469-1544 digit wheel UI), `SdrGainControls` (1545-1570), `SdrAudioControls` (1571-1625 volume/squelch/bw), `SdrModePills` (1626-1649), `SdrSignalMeter` (1650-1667), `SdrStatusLine` (1668-1792), `SdrScannerSection` (1797-1901), `SdrSearchSection` (1902-1920); CSS moves with each part | Store-backed tab/radio selection stays in `stores/sdr.ts` (teleport rule). |
| `space/SpaceFilter.vue` (1,412) | `SpaceFilter` + `SpaceCategorySection` (accordion per category), `SpaceSatelliteRow`, `SpaceUpcomingPassesList` (the `sfr-` passes list — memory: duplicated with SpacePasses; both keep their own markup but share `PassRow` from ui) | |
| `air/AirReplayPanel.vue` (1,162) + `.css` | `AirReplayPanel` + `ReplayCalendar` (already `airReplayCalendar.ts`), `ReplayTimeRangePicker` (the four teleported HH/MM dropdowns → one `TimeFieldDropdown` composed 4×), `ReplaySpeedPills`, `ReplayTransport`, `ReplayFlightList` | The four hand-rolled `<Teleport>` menus (lines 107-375) become `BaseSelectMenu` usages — ADR-0002 already identified this. |
| `air/AirFilter.vue` (1,157) | `AirFilter` + `AircraftFilterList`, `AirportsFilterList`, `MilitaryBasesFilterList`, shared `FilterListRow` | |
| `sdr/SdrFrequencyManagerTab.vue` (1,005) | `SdrFrequencyManagerTab` + `FrequencyGroupFilter` (already a component; 678-763 logic → `useFrequencyGroupFilter`), `FrequencyEditPanel` (764-end), `FrequencyList` using `SdrFrequencyRowSummary` | |
| `shared/MapSidebar.vue` (973) | `MapSidebar` + `SidebarRail` (rail buttons, 1-100), `SidebarFilterSubTabs` (103-134), `SidebarPanes` (139-186), composable `useSidebarTabMemory` (218-320: per-domain localStorage tab map) | e2e specs assert `data-tab` ids, `aria-controls` = `SIDEBAR_PANE_IDS` — these move unchanged. |
| `space/controls/satellite/SatelliteControl.ts` (974) | `SatelliteControl` + `SatelliteLayerBuilder`, `SatelliteFetcher`, `SatelliteFootprintRenderer`, `SatelliteSelection`; scheduler/notifier/`passNotifStore` already separate | passNotifStore spread-merge rule (memory) preserved. |
| `shared/SettingsPanel.vue` (826) + `.css` (1,636) | `SettingsPanel` (shell + section nav) + one `SettingsSection*` per namespace composing the existing ~35 `settings/*` controls; CSS split per section file | Settings design language (memory: square corners, `#e8eaed` fields, dot accents) is a token set in `packages/ui`. |
| `sdr/SdrRecordingsSection.vue` (1,229) | `SdrRecordingsSection` + `RecordingRow`, `RecordingPlayer`, `RecordingEditForm`, `LiveRecordingBanner` | |

### 5.4 State rule

"State that must survive teleport remounts lives in stores, not component refs" (`CLAUDE.md`, memory: space pane state, SDR tab). Every decomposition PR must check the extracted component holds no selection/tab/expanded state that a `<Teleport>` remount would lose; such state is moved to the domain store (`stores/air.ts`, `space.ts`, `sdr.ts`) with `_persist.ts` helpers where it is already persisted. `_persist.ts` (`usePersistedObject/Ref/StringSet`, `flush:'sync'`) moves to `packages/ui/src/state/persist.ts` unchanged.

### 5.5 CSS strategy

- **Design tokens + reset only are global.** `frontend/assets/template.css` (847 lines, imported by `src/assets/styles.css`) is moved to `packages/ui/src/styles/template.css` *unchanged* in v1 (it also styles the app shell `#nav`, sidebar region, footer). A follow-up PR splits it into `tokens.css` (custom properties), `reset.css`, and per-shell-component scoped styles — gated by screenshots. `a11y.css` and `fonts.css` move alongside.
- **Co-located scoped styles.** The large per-feature sheets (`SdrPanel.css` 2,096, `SettingsPanel.css` 1,636, `SpacePasses.css` 931, `SdrWaterfall.css` 714, `AirReplayPanel.css` 482) are split so each rule lives in the `<style scoped>` of the component that owns the selector. The B10 co-location policy (ADR-0002 row B10) applies: `:slotted()` trap for multi-root components (memory), no cross-component selectors.
- Selector-hash changes (`data-v-*`) do not affect rendering; screenshot diffs prove it.

### 5.6 Contracts package adoption

`services/settingsApi.ts`, `sdrRadiosApi.ts`, `sdrSearchApi.ts`, `sentryApi.ts`, `adsbSourceApi.ts` and the ad-hoc `fetch('/api/...')` calls in `main.ts`, stores and controls keep their behaviour but type their payloads from `@sentinel/contracts` (`z.infer<>`). No runtime zod parsing is added to the SPA in v1 (it would change failure behaviour on malformed responses); types only.

### 5.7 The "no visual/behaviour change" gate (mandatory on every frontend PR)

1. **Golden screenshots**: Playwright `toHaveScreenshot()` baselines captured from the *current* app (`frontend/spa-dist` at 7b6a456e, served by `vite preview` with `e2e/support/mockApi.ts` stubs and `page.routeWebSocket` stubs) for every route × {desktop 1440×900, tablet 1024×768, mobile 390×844} × {sidebar closed, each rail tab open, settings panel open, SDR panel with a stubbed spectrum} × {reduced-motion on}. Stored in `apps/web/e2e/__screenshots__/`; `maxDiffPixelRatio: 0` for static views, `0.001` for waterfall frames. Fonts are self-hosted (`/fonts`) so rendering is deterministic in the CI Chromium.
2. **DOM snapshot**: `page.accessibility.snapshot()` (ARIA tree) per state compared exactly — catches role/name/state regressions that pixels miss.
3. All 209 vitest specs move with their components and must pass unchanged (a spec may be *split* when its component is split, never weakened); coverage stays 100%.
4. All 11 Playwright specs + axe pass unchanged.
5. Keyboard path scripts (Tab order per pane, `Esc` closes, arrow keys in radio groups) recorded as Playwright steps from the current app.
6. **WCAG 2.2 AA stays the bar** (user standard + `accessibility-standards`): every moved/split component keeps its `jest-axe` test; `packages/ui` primitives additionally get role/name query tests; a manual VoiceOver pass on the shell closes Phase 13.

---

## 6. Parity verification strategy

### 6-i. API golden-master harness (`packages/testing/src/goldenMaster/`)

- **Record** (once, against FastAPI at 7b6a456e, before any Python is deleted): a Python script (`tools/parity/record_api.py`, using `httpx` against the live app in Docker with a seeded DB fixture and the upstream stubs from `tests/backend/`) walks a scenario file (`parity/api/scenarios.yaml`, one scenario per route × happy/edge/error case ≈ 350 requests) and writes `parity/api/<scenario>.json`: request (method, path, query, headers, body/multipart), response (status, headers subset: `content-type`, `x-cache`, `cache-control`, `content-disposition`, `content-range`, `accept-ranges`), body (parsed JSON or base64 bytes), plus DB state diff (`sqlite3 .dump` delta) for mutating calls.
- **Replay** (vitest, `apps/api/test/golden/*.spec.ts`): boot the Nest app on `:memory:` with the same seed, same frozen `Clock`, same upstream stubs; replay each scenario; assert status, header subset, body (deep-equal JSON; byte-equal for files), DB diff. Volatile fields (`timestamp`, `computed_at`, `created_at`) are frozen by the clock, not masked.
- Scenarios cover the surprising routes: unknown `/api/x` → index.html, `POST /unknown` → 405/404 body, `Range` requests on `/assets` and recordings, `index.html` `no-cache`, `503` when bundle missing.

### 6-ii. WS protocol conformance (`apps/api/test/ws/*.spec.ts`)

- A **fake rtl_tcp** (`packages/testing/src/fakeRtlTcp.ts`: emits `RTL0` header + deterministic IQ from a seed; records command frames) and a **fake relay control channel** (NDJSON server with a scripted token owner).
- Message-by-message transcripts recorded from FastAPI with the same fakes (Python versions in `tools/parity/fake_rtl_tcp.py`): for each of the 4 sockets, the sequence of frames for scripted client inputs (`tune`, `mode`, `gain`, `sample_rate`, `fft_size`, `demod`, `sweep_state`, `claim/release` under owner/follower, `digital_decode` on/off, `ping`, malformed JSON, unknown radio → `error NOT_FOUND`, connect failure ×3 → `CONNECT_FAILED`). Assertions: same frame order and types; `status`/`control` frames deep-equal; `spectrum` frames equal after §4b tolerance; IQ binary frames byte-equal (header + payload); decode/audio frames byte-equal.
- Shutdown test: open all 4 sockets, send SIGTERM to the process, assert all sockets close within 2 s and the process exits 0 (the wake-queue behaviour).

### 6-iii. DSP / orbit numeric fixtures — §4b, §4c, §4e (stated tolerances there). Generated by `tools/parity/gen_*.py` from the current Python; checked into `parity/`.

### 6-iv. DB schema and seed diff

- `sqlite3 sentinel.db .schema` from a fresh FastAPI boot and from a fresh Nest boot must be identical modulo whitespace/quoting (normalised by a script). Same for a boot against a **legacy DB fixture** (`parity/schema/legacy-2026-04.db`: a copy of a real pre-migration database with `sdr_radios` rows, missing columns, empty slugs) — proving the ALTER/backfill path.
- Seed diff: `SELECT namespace,key,value FROM user_settings ORDER BY 1,2` identical after first boot; `data/sdr_frequencies.json` written by both must be identical.

### 6-v. Config key/env parity — Appendix C is a test: `apps/api/test/config.spec.ts` asserts every key's default equals the table and every env name resolves (the table is generated from `config.py` by `tools/parity/dump_config.py` and checked in).

### 6-vi. Frontend — §5.7.

### 6-vii. Sidecar smoke — `docker compose --profile decoder --profile aprs --profile adsb up` in a nightly (non-CI-gating, mbelib licensing) job: assert each sidecar polls its `config` URL and gets `{active:false}`, the PCM ports accept a connection when a bridge is started via the API, and `POST ingest` with the shared-volume secret is accepted (`200`) / rejected without it (`401`).

### Definition of done per module

A module is done when: (1) every route in its Appendix A rows has ≥1 golden scenario passing, (2) its ported pytest file(s) pass as vitest (Appendix E lists the 25 → mapping), (3) unit coverage 100% for the module, (4) `tsc --noEmit` strict, ESLint, Prettier clean, (5) the module's ADR (if any) is written, (6) for stream/decode: WS conformance + shutdown test green, (7) for DSP/orbit: fixture suites green.

---

## 7. Phased delivery plan

Sizing: S ≤ 2 days, M ≤ 1 week, L ≤ 2 weeks, XL > 2 weeks (one engineer). Parallelisable phases are marked ∥.

| # | Phase | Scope | Depends on | Exit criteria / gates | Size |
| --- | --- | --- | --- | --- | --- |
| 0 | **Parity capture** | Freeze 7b6a456e; write `tools/parity/*` Python generators; record API golden scenarios, WS transcripts, DSP/orbit fixtures, `.schema`, seed dumps, config dump, golden screenshots + ARIA snapshots. Check into `parity/`. | — | All fixture suites exist and are replayable against the *Python* app (self-consistency run). | L |
| 1 | **Repo skeleton** | npm workspaces, `tsconfig.base`, `packages/config`, husky/lint-staged, git-cliff, CI matrix (§8), `git mv frontend/vue → apps/web`, `frontend/assets → assets`, `backend/data → data`, path fixes, `dist/spa` output; Dockerfile placeholder. | 0 | Existing Vue gates green in the new layout; `npm run -ws lint/typecheck/test`. | M |
| 2 | **`packages/contracts`** | zod schemas for every request/response/WS frame (from Appendix A) and settings/config keys. | 1 | Types compile; SPA `services/*` typed from contracts (types only). | M |
| 3 | **Persistence + Config + Settings** | ConfigModule, PersistenceModule (schema, migrator, seeders, mirror, JsonFileStore), SettingsModule, common (filter, pipe, clock, queue). | 2 | §6-iv schema/seed diff green (fresh + legacy DB); settings golden scenarios; config parity test. | L |
| 4 ∥ | **Air** | AirModule incl. rate limiter, readsb adapter, flight history, cache headers. | 3 | Air golden scenarios; ports of `test_routers_air`, `test_adsb_*`, `test_cache`. | M |
| 4 ∥ | **`packages/orbit` + Space** | orbit package + fixtures; SpaceModule, TLE service, sat radio store. | 3 | §4e fixtures; space golden scenarios; ports of `test_services_satellite`, `test_services_tle_fetch`, `test_routers_space`. | L |
| 4 ∥ | **Land** | LandModule + AprsStationStore. | 3 | golden; `test_aprs_store` port. | S |
| 5 ∥ | **Sentry + AdsbSource** | SentryClient (undici agent), fleet poller, hosts controller, adsb-source. | 3 | golden with fake Sentry; ports of `test_sentry_*`, `test_adsb_source_claim`, `test_routers_sentry`. | L |
| 6 | **SDR radios / frequencies / search-ranges / recordings** | the four CRUD sub-modules + bulk editors + file write-back + multipart. | 3 | golden; `test_routers_sdr` port; `data/sdr_frequencies.json` byte-diff. | M |
| 7 | **`packages/dsp` + SDR stream** | FFT + spectrum frame, rtl_tcp connection, relay control, broadcaster, registry, reachability, ws server, connect/disconnect/status. | 3, 6 | §4b fixtures; WS conformance for `/ws/sdr/:id` and `/iq`; ports of `test_sdr_broadcaster`, `test_sdr_fft`, `test_sdr_ownership`, `test_sdr_reachability`; shutdown test. | XL |
| 8 | **SDR decode + APRS bridges** | demod chain + worker, PCM bridges, UDP audio, ingest/config/status, APRS control + resume. | 7, Land | §4c fixtures; WS conformance for `/decode`, `/decode/audio`; ports of `test_sdr_decode`, `test_routers_sdr_decode`, `test_routers_aprs`. | L |
| 9 | **Static serving + lifecycle + SPA cutover (dev)** | StaticServingModule order, LifecycleModule bootstrap order + signal chaining, swagger paths; `apps/web` dev proxy → Nest on 8080. | 3–8 | Golden scenarios for `/health`, favicon, Range on `/assets`, catch-all; full golden suite green end-to-end; `tests/e2e/fullstack-smoke.spec.ts` green against Nest. | M |
| 10 ∥ | **Frontend package extraction** | `packages/ui`, `packages/map-controls`, token/reset CSS move (template.css verbatim), `_persist` move. | 1 (can start after 1) | §5.7 gate: zero screenshot/ARIA diff; 209 specs + 11 e2e + axe green. | M |
| 11 ∥ | **Frontend decomposition** | §5.3 table, one PR per file (≈12 PRs), CSS co-location. | 10 | §5.7 gate per PR. | XL |
| 12 | **Docker/CI parity** | Single `node:24-alpine` multi-stage image (web build → api build → runtime with `assets/`, `dist/spa`, `data/`), compose with identical service names/profiles/volumes/env, port 8000 internal / 8080 published, `sysctls` keepalive, healthcheck on `/health`; CI job layout §8.4. | 9 | `docker compose up --build` serves the app; §6-vii sidecar smoke nightly; CI green. | M |
| 12b (gated) | Sidecar supervisors → Node | §4j. | 12 | `test_decoder_entrypoint`/`test_decoder_aprs_entrypoint` ports green incl. APRS parse parity. | M |
| 13 | **Cutover** | Remove `backend/`, `tests/backend/`, `decoder/*.py` (if 12b), `uv`/ruff tooling; README/CONTRIBUTING/CLAUDE.md rewrite; ADR-0005 (rebuild) + ADR-0006 (ORM) + ADR-0007 (WS transport); release tag. | 12 | Golden/WS/DSP/orbit/schema/config/screenshot suites all green on `main`; manual VoiceOver pass on the shell. | S |

Critical path: 0 → 1 → 2 → 3 → 6 → 7 → 8 → 9 → 12 → 13. Phases 4/5 run alongside 6–8; 10/11 run alongside 3–9 on the frontend stream (two engineers minimum: backend, frontend; a third can take Sentry/Space).

---

## 8. Tooling and quality gates

### 8.1 TypeScript
`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`; `apps/api` adds `experimentalDecorators`, `emitDecoratorMetadata`, `target ES2022`, `module NodeNext`. `tsc -b` over project references is the typecheck gate for api/packages; `vue-tsc --noEmit` for web. No `any`; `@ts-expect-error` only with a justification comment.

### 8.2 Lint/format
Flat ESLint config in `packages/config` (`typescript-eslint` strict-type-checked, `eslint-plugin-vue` for web, `eslint-plugin-import` boundaries rule for §2.1), Prettier shared config (the current `frontend/vue/.prettierrc` values). `npm run lint` at root fans out. Naming rule: `@typescript-eslint/naming-convention` with `id-length` min 2 (no single-letter identifiers — user standard) — the existing Vue code has single-letter names in places (`for (const d of ALL_DOMAINS)` in `main.ts`); renaming is allowed in decomposition PRs (behaviour-neutral) but not required for the move-only phases.

### 8.3 Tests
- Vitest everywhere (`apps/api` with `unplugin-swc`), coverage `v8`, thresholds 100/100/100/100 per workspace (the frontend already; the api from Phase 3). `/* v8 ignore start … stop */` with a reason for genuinely unreachable defensive branches (existing convention).
- Playwright + `@axe-core/playwright` in `apps/web/e2e` (moved), plus golden screenshots (§5.7); root `tests/e2e` full-stack smoke against the Docker image.
- Test timing rule (user standard): build agents do not write tests during feature work; the test-writing pass runs at commit/push time after the user confirms. **Exception the owner must confirm (§9, Q2): the parity harnesses (§6) are the deliverable of Phase 0 and the exit gate of every phase — they must be written up-front, not at push time.**

### 8.4 CI (`.github/workflows/ci.yml`) — mirrors today's split
Jobs: `api / quality` (eslint + prettier + tsc -b), `api / test` (vitest 100% + golden + ws + dsp/orbit fixtures), `web / quality`, `web / test`, `web / build` (uploads `dist/spa` artifact; **replaces** the "committed spa-dist matches build" gate — the bundle is no longer committed; the Docker image builds it), `web / a11y` (Playwright + axe + screenshots, consumes artifact), `packages / test` (ui, map-controls, dsp, orbit), `root-tooling`, `docker / build` (builds the image, runs `tests/e2e` smoke). `changelog.yml` unchanged (git-cliff on push to main). Nightly: `sidecars / smoke` (§6-vii, never builds in PR CI — mbelib note carried over from the current workflow header).

### 8.5 Docker
- `Dockerfile` (root): stage `web-build` (`node:24-alpine`, `npm ci -w apps/web`, `vite build` → `dist/spa`), stage `api-build` (`npm ci`, `tsc -b`, prune dev deps), stage `runtime` (`node:24-alpine`, non-root `node` user, `COPY assets/ data/ dist/`, `EXPOSE 8000`, `HEALTHCHECK CMD wget -qO- http://127.0.0.1:8000/health`, `CMD ["node","apps/api/dist/main.js"]`, `tini`/`--init` for signal forwarding). better-sqlite3 needs its prebuilt binary for `linuxmusl-arm64` (Pi) — verify prebuilds exist for Node 24/alpine; fallback to `node:24-bookworm-slim` (§9).
- `docker-compose.yml`: service `app` keeps `container_name: sentinel-app`, `ports: 8080:8000`, `extra_hosts host.docker.internal`, volumes `sentinel_db:/app/data`, `./assets:/app/assets:ro`, `decoder_secret:/run/decoder`, env `DB_PATH=/app/data/sentinel.db`, `DECODER_INGEST_SECRET`, `DECODER_PCM_PORT=7355`, `DECODER_AUDIO_UDP_PORT=7356`, `APRS_DECODER_PCM_PORT=7357`; dev override `docker-compose.dev.yml` bind-mounts `apps/api/src` with `node --watch` (the `uvicorn --reload` equivalent). Sidecar services byte-identical.
- `.env.example` lists every Appendix C key with placeholders; `.env` git-ignored.

### 8.6 Commits/PRs
Conventional Commits, feature branches only, husky pre-commit running lint-staged (eslint --fix, prettier) on staged TS/Vue and `tsc`/`vue-tsc` on touched workspaces; no "generated by" footers in PR bodies (user standard).

---

## 9. Risks, unknowns and open questions

| # | Item | Type | Mitigation / decision needed |
| --- | --- | --- | --- |
| Q1 | Keep the three sidecar supervisors in Python (D11)? Constraint #4 says "wherever possible". | Open question | Recommend yes for v1; Phase 12b ports them behind a separate gate. **Owner decision.** |
| Q2 | The parity harnesses (§6) must be written before/alongside code, which conflicts with the user's "tests at push time" rule. | Open question | Treat §6 as *fixtures/tooling*, not feature tests; unit tests still follow the push-time rule. **Owner confirmation.** |
| Q3 | Internal port stays 8000 (sidecars address `app:8000`) rather than the Node default 3000. | Deviation from standard | Keep 8000 for constraint #1; document in README. **Owner confirmation.** |
| Q4 | `frontend/spa-dist` is committed today and served in prod; CI gates on it. The plan stops committing the bundle (image builds it). | Behaviour of the *repo*, not the app | Confirm acceptable; alternative is to keep committing `dist/spa` and keep the drift gate. |
| R1 | TCP keepalive interval/count not settable from Node (§4a). | Verified gap | 10 s read timeout bounds detection; container `sysctls` restore ~5 s; document. |
| R2 | Python `round()` half-even vs JS rounding; `astype(int16)` truncation. | Verified | Shared `pythonRound` + `Math.trunc`; fixtures assert. |
| R3 | `satellite.js` field naming for mean motion (`no` vs `no_kozai`) and `sgp4()` signature (minutes since epoch, not `jd,fr`). | Unverified detail | Verify at Phase 4 start against the installed version; the wrapper isolates it. |
| R4 | better-sqlite3 prebuilt binaries for `node:24-alpine` on arm64 (Pi). | Unverified | Check at Phase 12; fallback `bookworm-slim`. |
| R5 | `express.static` Range/ETag/Last-Modified semantics vs Starlette `StaticFiles` (PMTiles reads depend on Range; MapLibre caches on ETag). | Verified need, behaviour untested | Golden scenarios include Range + conditional requests; if headers differ, a custom static handler replicates Starlette's. |
| R6 | FastAPI 405 vs Express 404 for wrong-method on known paths; JSON body for 404 on `/api/*`. | Verified difference | Filter normalises; golden covers. |
| R7 | Multipart parsing differences (field order, missing `file` → FastAPI 422 body shape). | Verified need | Golden scenarios for missing/empty file. |
| R8 | `POST /api/settings/config/upload` unbounded size; no auth on any route (today). | Security note, out of scope | Do not change in the rebuild (constraint #1); raise as post-cutover ADR candidates. |
| R9 | Worker-thread FFT/demod on the Pi: latency budget ~40 ms/frame. | Performance | Benchmark fft.js @32768 on Pi 4 in Phase 7; swap to kissfft-wasm behind the `packages/dsp` interface if needed. |
| R10 | Sync SQLite (`better-sqlite3`) blocks the loop during `GET /api/air/snapshots` (24 h window can be large) and `/api/space/passes` (CPU anyway). | Performance | Measure with a 30-day history DB; if needed, move the snapshot query to a worker (`better-sqlite3` supports worker threads). |
| R11 | Frontend golden screenshots are only as good as the mock data; live-data views (waterfall, aircraft) need deterministic stubs. | Test design | Reuse `e2e/support/mockApi.ts` fixtures + scripted `routeWebSocket`. |
| R12 | `AwacControl.ts` internals were not read for this plan (no section markers). | Not verified | Read at Phase 11; split plan is provisional. |
| R13 | `backend/scripts/*.py` (offline satellite-radio regeneration, SatNOGS fetch) → `tools/`. | Small, verified | Port with a golden output diff of `satellite_radio.json`. |
| R14 | The SPA 503 message text changes path (`cd frontend/vue` → `cd apps/web`). | Deliberate string change | Listed here; golden scenario updated with the new text. |
| R15 | Node `fetch`/undici error class names differ from httpx (`ConnectError`, `TimeoutException` appear in `/api/space/tle/fetch` error text: `"Network error — could not reach {url}: {TypeName}"`). | Verified text leak | Map undici errors to the same two names (`TimeoutException`, `ConnectError`) in the message for parity. |

---

## Appendix A — complete route parity table (105 REST + 4 WS)

Status = success status; Err = error statuses produced by the handler (422 = validation, always possible where a body/query schema exists). Module = target Nest module. Src = Python source. All bodies are JSON unless stated.

### A.1 main.py

| # | Method | Path | Status | Body / notes | Err | Module | Src |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | GET | `/health` | 200 | `{status:"ok",timestamp}` | — | StaticServing | `main.py:134` |
| 2 | GET | `/favicon.ico` | 200 | `image/x-icon` file | 404 if missing | StaticServing | `main.py:140` |
| 3 | GET | `/assets/*` | 200/206/304 | static, Range, ETag | 404 | StaticServing | `main.py:149` |
| 4 | GET | `/fonts/*` | 200 | conditional mount | 404 | StaticServing | `main.py:157` |
| 5 | GET | `/spa-assets/*` | 200 | conditional mount | 404 | StaticServing | `main.py:160` |
| 6 | GET | `/{path}` catch-all | 200 | `index.html`, `Cache-Control: no-cache, no-store, must-revalidate` | 503 `{detail:"SPA not built…"}` | StaticServing | `main.py:167` |
| 7–9 | GET | `/api/docs`, `/api/redoc`, `/api/openapi.json` | 200 | swagger UI / redoc / spec (not byte-parity) | — | StaticServing | `main.py:117-119` |

### A.2 /api/air (`routers/air.py`) — AirModule

| # | Method | Path | Status | Response | Err |
| --- | --- | --- | --- | --- | --- |
| 10 | GET | `/api/air/adsb/point/{lat}/{lon}/{radius}` | 200 | upstream JSON + `X-Cache` | 503 detail, 422 |
| 11 | GET | `/api/air/messages` | 200 | `[{msg_id,type,title,detail,ts}]` | |
| 12 | POST | `/api/air/messages` | 201/200 | `{status:created\|exists}` | 422 |
| 13 | DELETE | `/api/air/messages/{msg_id}` | 200 | `{status:dismissed\|absent}` | |
| 14 | DELETE | `/api/air/messages` | 200 | `{status:cleared}` | |
| 15 | GET | `/api/air/tracking` | 200 | `[{hex,callsign,follow,added_at}]` | |
| 16 | POST | `/api/air/tracking` | 201/200 | `{status:created\|updated}` | 422 |
| 17 | DELETE | `/api/air/tracking/{hex}` | 200 | `{status:removed}` | |
| 18 | GET | `/api/air/recordings/available-dates` | 200 | `[{date,start_ms,end_ms,count}]` | |
| 19 | GET | `/api/air/snapshots?start_ms&end_ms` | 200 | `{start_ms,end_ms,aircraft}` | 400, 422 |
| 20 | GET | `/api/air/flights?limit&offset` | 200 | `[…]` | |
| 21 | GET | `/api/air/flights/{registration}` | 200 | `[{flight_id,…}]` | |
| 22 | GET | `/api/air/flights/{registration}/{flight_id}` | 200 | `{…,snapshots}` | 404 |
| 23 | DELETE | `/api/air/flights/{registration}` | 200 | `{status:deleted}` | |

### A.3 /api/space (`routers/space.py`) — SpaceModule

| # | Method | Path | Status | Err |
| --- | --- | --- | --- | --- |
| 24 | GET | `/api/space/iss?lat&lon` | 200 | 503 `{error,no_tle_data}` / 503 `{error}` / 500 |
| 25 | GET | `/api/space/iss/passes?lat&lon&hours&min_el` | 200 | 422, 503, 500 |
| 26 | GET | `/api/space/satellite/{norad_id}?lat&lon` | 200 | 503, 404, 500 |
| 27 | GET | `/api/space/satellite/{norad_id}/passes` | 200 | 422, 503, 500 |
| 28 | GET | `/api/space/passes?lat&lon&hours&min_el&categories&limit` | 200 | 400, 422, 503, 500 |
| 29 | GET | `/api/space/daynight` | 200 | 500 |
| 30 | GET | `/api/space/tle/status` | 200 | 500 |
| 31 | GET | `/api/space/tle/list` | 200 | 500 |
| 32 | GET | `/api/space/tle/uncategorised` | 200 | 500 |
| 33 | POST | `/api/space/tle/fetch` | 200 | 400, 422, 502 |
| 34 | POST | `/api/space/tle/manual` | 200 | 400, 422, 500 |
| 35 | PATCH | `/api/space/tle/category` | 200 | 400, 500 |
| 36 | PATCH | `/api/space/tle/satellite` | 200 | 400, 404, 500 |
| 37 | GET | `/api/space/radio/file` | 200 | 500 |
| 38 | POST | `/api/space/radio/file` | 200 | 400, 500 |
| 39 | DELETE | `/api/space/tle?confirm&category` | 200 | 400, 500 |

### A.4 /api/land — LandModule

| # | Method | Path | Status |
| --- | --- | --- | --- |
| 40 | GET | `/api/land/aprs/stations` | 200 `{stations}` |

### A.5 /api/settings — SettingsModule

| # | Method | Path | Status | Err |
| --- | --- | --- | --- | --- |
| 41 | GET | `/api/settings` | 200 | |
| 42 | GET | `/api/settings/config/preview` | 200 (`application/json`, indent 2) | |
| 43 | POST | `/api/settings/config/upload` (multipart `file`) | 200 | 400, 422 |
| 44 | GET | `/api/settings/{namespace}` | 200 | |
| 45 | PUT | `/api/settings/{namespace}/{key}` | 200 | 400, 422 |
| 46 | DELETE | `/api/settings/{namespace}/{key}` | 200 | |

### A.6 /api/sdr (`routers/sdr.py`) — Sdr* sub-modules

| # | Method | Path | Status | Err | Sub-module |
| --- | --- | --- | --- | --- | --- |
| 47 | GET | `/api/sdr/radios` | 200 | | Radios |
| 48 | POST | `/api/sdr/radios` | 201 | 422 | Radios |
| 49 | PUT | `/api/sdr/radios/{radio_id}` | 200 | 404, 422 | Radios |
| 50 | DELETE | `/api/sdr/radios/{radio_id}` | 204 | 404 | Radios |
| 51 | GET | `/api/sdr/groups` | 200 | | Frequencies |
| 52 | POST | `/api/sdr/groups` | 201 | 422 | Frequencies |
| 53 | PUT | `/api/sdr/groups/{group_id}` | 200 | 404, 422 | Frequencies |
| 54 | DELETE | `/api/sdr/groups/{group_id}` | 204 | 404 | Frequencies |
| 55 | GET | `/api/sdr/frequencies` | 200 | | Frequencies |
| 56 | POST | `/api/sdr/frequencies` | 201 | 422 | Frequencies |
| 57 | PUT | `/api/sdr/frequencies/{freq_id}` | 200 | 404, 422 | Frequencies |
| 58 | PATCH | `/api/sdr/frequencies/{freq_id}` | 200 | 404, 422 | Frequencies |
| 59 | DELETE | `/api/sdr/frequencies/{freq_id}` | 204 | 404 | Frequencies |
| 60 | GET | `/api/sdr/search-ranges` | 200 | | SearchRanges |
| 61 | POST | `/api/sdr/search-ranges` | 201 | 400, 422 | SearchRanges |
| 62 | PUT | `/api/sdr/search-ranges/{range_id}` | 200 | 400, 404, 422 | SearchRanges |
| 63 | DELETE | `/api/sdr/search-ranges/{range_id}` | 204 | 404 | SearchRanges |
| 64 | GET | `/api/sdr/data/frequencies` | 200 | | Frequencies |
| 65 | POST | `/api/sdr/data/frequencies` | 200 | 400 | Frequencies |
| 66 | GET | `/api/sdr/data/bandplan` | 200 | | Frequencies |
| 67 | POST | `/api/sdr/data/bandplan` | 200 | 400 | Frequencies |
| 68 | GET | `/api/sdr/recordings` | 200 | | Recordings |
| 69 | POST | `/api/sdr/recordings/start` | 201 | 422 | Recordings |
| 70 | POST | `/api/sdr/recordings/stop` (multipart) | 200 | 404, 422 | Recordings |
| 71 | PATCH | `/api/sdr/recordings/{rec_id}` | 200 | 404, 422 | Recordings |
| 72 | DELETE | `/api/sdr/recordings/{rec_id}` | 204 | 404 | Recordings |
| 73 | GET | `/api/sdr/recordings/{rec_id}/file` | 200 `audio/wav` attachment | 404 | Recordings |
| 74 | GET | `/api/sdr/recordings/{rec_id}/iq` | 200 `application/octet-stream` | 404 | Recordings |
| 75 | POST | `/api/sdr/connect` | 200 | 404, 503, 422 | Stream |
| 76 | POST | `/api/sdr/disconnect` | 200 | 404, 422 | Stream |
| 77 | GET | `/api/sdr/status/{radio_id}` | 200 | 404 | Stream |
| 78 | POST | `/api/sdr/decode/ingest` (`X-Decode-Secret`) | 200 | 503, 401, 409, 422 | Decode |
| 79 | GET | `/api/sdr/decode/config` (`X-Decode-Secret`) | 200 | 503, 401 | Decode |
| 80 | GET | `/api/sdr/decode/status/{radio_id}` | 200 | 404 | Decode |
| 81 | POST | `/api/sdr/aprs/start` | 200 | 404, 503, 502, 422 | Aprs |
| 82 | POST | `/api/sdr/aprs/stop` | 200 | 404, 422 | Aprs |
| 83 | GET | `/api/sdr/aprs/status/{radio_id}` | 200 | 404 | Aprs |
| 84 | POST | `/api/sdr/aprs/ingest` (`X-Decode-Secret`) | 200 | 503, 401, 409, 422 | Aprs |
| 85 | GET | `/api/sdr/aprs/config` (`X-Decode-Secret`) | 200 | 503, 401 | Aprs |

### A.7 /api/sdr/sentry-hosts (`routers/sentry.py`) — SentryModule

| # | Method | Path | Status | Err |
| --- | --- | --- | --- | --- |
| 86 | GET | `/api/sdr/sentry-hosts` | 200 | |
| 87 | POST | `/api/sdr/sentry-hosts` | 201 | 409, 422 |
| 88 | GET | `/api/sdr/sentry-hosts/locations` | 200 | |
| 89 | GET | `/api/sdr/sentry-hosts/{host_id}` | 200 | 404 |
| 90 | PUT | `/api/sdr/sentry-hosts/{host_id}` | 200 | 404, 409, 422 |
| 91 | DELETE | `/api/sdr/sentry-hosts/{host_id}` | 204 | 404 |
| 92 | POST | `/api/sdr/sentry-hosts/{host_id}/test` | 200 | 404 |
| 93 | GET | `/api/sdr/sentry-hosts/{host_id}/info` | 200 | 404 |
| 94 | GET | `/api/sdr/sentry-hosts/{host_id}/devices` | 200 | 404 |
| 95 | GET | `/api/sdr/sentry-hosts/{host_id}/devices/records` | 200 | 404, 502, Sentry's |
| 96 | PATCH | `/api/sdr/sentry-hosts/{host_id}/devices/{device_id}` | 200 | 404, 502, Sentry's |
| 97 | DELETE | `/api/sdr/sentry-hosts/{host_id}/devices/{device_id}` | 204 | 404, 502, Sentry's |
| 98 | POST | `/api/sdr/sentry-hosts/{host_id}/devices/{device_id}/serial` | 202 | 404, 422, 502, Sentry's |
| 99 | GET | `/api/sdr/sentry-hosts/{host_id}/wifi` | 200 | 404, 502, Sentry's |
| 100 | PUT | `/api/sdr/sentry-hosts/{host_id}/wifi` | 200 | 404, 422, 502, Sentry's |
| 101 | DELETE | `/api/sdr/sentry-hosts/{host_id}/wifi` | 204 | 404, 502, Sentry's |
| 102 | POST | `/api/sdr/sentry-hosts/{host_id}/wifi/enable` | 200 | 404, 502, Sentry's |
| 103 | POST | `/api/sdr/sentry-hosts/{host_id}/wifi/disable` | 200 | 404, 502, Sentry's |
| 104 | POST | `/api/sdr/sentry-hosts/{host_id}/wifi/confirm` | 200 | 404, 502, Sentry's |
| 105 | GET | `/api/sdr/sentry-hosts/{host_id}/wifi/interfaces` | 200 | 404, 502, Sentry's |
| 106 | GET | `/api/sdr/sentry-hosts/{host_id}/wifi/clients` | 200 | 404, 502, Sentry's |

### A.8 /api/sdr/adsb (`routers/adsb_source.py`) — AdsbSourceModule

| # | Method | Path | Status | Err |
| --- | --- | --- | --- | --- |
| 107 | GET | `/api/sdr/adsb/source` | 200 | |
| 108 | PUT | `/api/sdr/adsb/source` | 200 | 422 |
| 109 | POST | `/api/sdr/adsb/claim` | 200 | 404, 409, 502 |
| 110 | DELETE | `/api/sdr/adsb/claim` | 204 | |
| 111 | GET | `/api/sdr/adsb/config` | 200 | |

(Numbering runs to 111 because rows 3–5 are static mounts and 7–9 are docs; the REST handler count is 105.)

### A.9 WebSockets (`routers/sdr.py`) — SdrStreamModule / SdrDecodeModule

| # | Path | Direction | Frames |
| --- | --- | --- | --- |
| W1 | `/ws/sdr/{radio_id}` | S→C text | `status` (initial `connected:false` + full tuner/ownership/sweep state; later `{type:status,connected:false,reconnecting:true}`), `spectrum`, `control`, `error {code:NOT_FOUND\|CONNECT_FAILED,message}`, `pong` |
| | | C→S text | `tune{frequency_hz}`, `mode{mode}`, `release`, `claim`, `demod{offset_hz,mode,bw_hz}`, `sweep_state{scan_active,scan_groups(≤64×≤64 chars),search_active,search_low_hz,search_high_hz,search_current_hz}`, `gain{gain_db\|null}`, `sample_rate{rate_hz}`, `fft_size{bins}`, `digital_decode{enabled,offset_hz,bw_hz}`, `digital_channel{offset_hz,bw_hz}`, `ping`; malformed JSON ignored; command errors logged, socket stays open; `ReadOnlyTuningError` → `control{is_owner:false,…}`. On close: unsubscribe, cancel reader, **stop the voice decode bridge** for that radio. |
| W2 | `/ws/sdr/{radio_id}/iq` | S→C binary | `uint32 LE sample_rate, uint32 LE center_hz, uint8 IQ…`; closes on `null` sentinel |
| W3 | `/ws/sdr/{radio_id}/decode` | S→C text | first frame `decode_status{decoder_reachable[,audio_sample_rate:48000]}`; then `decode_event`/`aprs`/`log`/sidecar-typed events; if no bridge appears within 3 s (100 ms polls): send `{type:decode_status,active:false,decoder_reachable:false}` and close |
| W4 | `/ws/sdr/{radio_id}/decode/audio` | S→C binary | 48 kHz s16 mono PCM datagrams; closes immediately if the radio's bridge is not a voice bridge |

All four: `NOT_FOUND`/`CONNECT_FAILED` error frame + close when the radio is unknown or the broadcaster cannot start after 3 attempts 1 s apart.

---

## Appendix B — entity/table parity table (`backend/models.py`, `backend/database.py`)

Types are SQLite affinities as SQLAlchemy emits them (`INTEGER`, `REAL`, `TEXT`; `BOOLEAN` → `INTEGER` with a CHECK in SQLAlchemy's DDL — the Drizzle schema must emit the same `.schema` text; §6-iv proves it). `PK` = primary key autoincrement unless noted.

| Table | Columns (name: type, constraints, default) | Indexes / uniques |
| --- | --- | --- |
| `adsb_cache` | id PK; cache_key TEXT NN UNIQUE; lat REAL NN; lon REAL NN; radius_nm INTEGER NN (250); payload TEXT NN; ac_count INTEGER; fetched_at INTEGER NN; expires_at INTEGER NN | |
| `tle_cache` | id PK; cache_key TEXT NN UNIQUE; payload TEXT NN; source TEXT NN ('online'); fetched_at INTEGER NN; expires_at INTEGER NN | |
| `satellite_catalogue` | norad_id TEXT PK; name TEXT NN; category TEXT; category_source TEXT; name_source TEXT (ALTER-added); updated_at INTEGER NN; uplink_hz INTEGER; uplink_mode TEXT; downlink_hz INTEGER; downlink_mode TEXT; ctcss_hz REAL; transponder_type TEXT; beacon_hz INTEGER; packet_info TEXT; radio_status TEXT; radio_notes TEXT (last 10 ALTER-added) | |
| `air_messages` | id PK; msg_id TEXT NN UNIQUE; type TEXT NN; title TEXT NN; detail TEXT NN (''); ts INTEGER NN; dismissed BOOLEAN NN (false) | |
| `air_tracking` | id PK; hex TEXT NN UNIQUE; callsign TEXT NN (''); follow BOOLEAN NN (false); added_at INTEGER NN | |
| `sdr_radios` (legacy; still created; read only by the migration) | id PK; name TEXT NN; host TEXT NN; port INTEGER NN (1234); description TEXT NN (''); enabled BOOLEAN NN (true); bandwidth INTEGER; rf_gain REAL; agc BOOLEAN; created_at INTEGER NN | ALTERs: bandwidth, rf_gain, agc |
| `sdr_frequency_groups` | id PK; name TEXT NN; slug TEXT NN (''); color TEXT NN ('#c8ff00'); sort_order INTEGER NN (0); created_at INTEGER NN | ALTER: slug; backfill slug |
| `sdr_stored_frequencies` | id PK; group_id INTEGER; label TEXT NN; frequency_hz INTEGER NN; mode TEXT NN ('AM'); squelch REAL NN (-60.0); gain REAL NN (30.0); bandwidth INTEGER; sample_rate INTEGER; volume INTEGER NN (80); zoom REAL NN (1.0); zmin REAL NN (0.0); zmax REAL NN (0.0); scannable BOOLEAN NN (true); favourite BOOLEAN NN (false); notes TEXT NN (''); created_at INTEGER NN | ALTERs: bandwidth, sample_rate, volume, zoom, zmin, zmax, favourite; backfill bandwidth by mode / sample_rate 2048000 |
| `sdr_frequency_group_links` | frequency_id INTEGER PK; group_id INTEGER PK (composite) | seeded `INSERT OR IGNORE` from `group_id` |
| `sdr_search_ranges` | id PK; label TEXT NN; low_hz INTEGER NN; high_hz INTEGER NN; step_hz INTEGER NN (12500); mode TEXT NN ('NFM'); threshold_dbfs REAL NN (-35.0); dwell_ms INTEGER NN (250); band_name TEXT NN (''); enabled BOOLEAN NN (true); notes TEXT NN (''); sort_order INTEGER NN (0); created_at INTEGER NN | |
| `sdr_recordings` | id PK; name TEXT NN; notes TEXT NN (''); radio_id INTEGER; radio_name TEXT NN (''); frequency_hz INTEGER NN; mode TEXT NN ('AM'); gain_db REAL NN (30.0); squelch_dbfs REAL NN (-60.0); sample_rate INTEGER NN (2048000); started_at TEXT NN; ended_at TEXT NN (''); duration_s REAL NN (0.0); file_size_bytes INTEGER NN (0); has_iq_file BOOLEAN NN (false); iq_file_size_bytes INTEGER NN (0); status TEXT NN ('recording'); created_at INTEGER NN | |
| `air_aircraft` | id PK; registration TEXT NN UNIQUE; hex TEXT NN (''); type_code TEXT NN (''); callsign TEXT NN ('') (ALTER-added); first_seen INTEGER NN; last_seen INTEGER NN; flight_count INTEGER NN (0) | `ix_air_aircraft_last_seen (last_seen DESC)` |
| `air_flights` | id PK; aircraft_id INTEGER NN; registration TEXT NN; callsign TEXT NN (''); started_at INTEGER NN; last_active_at INTEGER NN; snapshot_count INTEGER NN (0) | `ix_air_flights_registration`, `ix_air_flights_started_last (started_at,last_active_at)` |
| `air_snapshots` | id PK; flight_id INTEGER NN; ts INTEGER NN; lat REAL NN; lon REAL NN; alt_baro INTEGER; gs REAL; track REAL; baro_rate INTEGER; squawk TEXT | `ix_air_snapshots_flight_id_ts (flight_id,ts)`, `ix_air_snapshots_ts` |
| `user_settings` | id PK; namespace TEXT NN; key TEXT NN; value TEXT NN; updated_at INTEGER NN | `uq_user_settings_ns_key (namespace,key)` |
| `sentry_hosts` | id PK; name TEXT; address TEXT NN; port INTEGER NN (8000); auth_token TEXT NN (''); enabled BOOLEAN NN (true); created_at INTEGER NN; last_seen_at INTEGER; last_error TEXT | `uq_sentry_hosts_address_port` |
| `aprs_stations` | id PK; callsign TEXT NN UNIQUE; latitude REAL NN; longitude REAL NN; symbol TEXT; comment TEXT; course REAL; speed REAL; altitude REAL; path TEXT; raw TEXT; last_heard_ms INTEGER NN | |

Note: SQLAlchemy `default=` values are Python-side (not DDL `DEFAULT`) except where the ALTER statements carry `NOT NULL DEFAULT`. The Drizzle schema mirrors this: application-level defaults in the insert helpers, DDL defaults only on the ALTER-added columns. Foreign keys are not declared in the ORM (comments only) — none are emitted.

---

## Appendix C — config key parity table (`backend/config.py`)

| Key (`config.py`) | Env var | Type | Default | Used by |
| --- | --- | --- | --- | --- |
| db_path | `DB_PATH` | string | `backend/sentinel.db` (→ `data/sentinel.db` in the new layout for non-Docker dev; compose sets `/app/data/sentinel.db`) | Persistence, recordings dir |
| adsb_ttl_ms | `ADSB_TTL_MS` | int | 10000 | Air cache |
| adsb_stale_ms | `ADSB_STALE_MS` | int | 60000 | Air cache |
| adsb_upstream_base | `ADSB_UPSTREAM_BASE` | string | `https://api.adsb.lol/v2` | Air; seeder override |
| adsb_min_request_interval_ms | `ADSB_MIN_REQUEST_INTERVAL_MS` | int | 5000 | rate limiter |
| adsb_rate_limit_max_wait_ms | `ADSB_RATE_LIMIT_MAX_WAIT_MS` | int | 5000 | rate limiter |
| adsb_rate_limit_penalty_ms | `ADSB_RATE_LIMIT_PENALTY_MS` | int | 60000 | 429 cooldown |
| adsb_rate_limit_max_penalty_ms | `ADSB_RATE_LIMIT_MAX_PENALTY_MS` | int | 600000 | Retry-After cap |
| tle_ttl_ms | `TLE_TTL_MS` | int | 21600000 | TLE online TTL |
| tle_stale_ms | `TLE_STALE_MS` | int | 43200000 | TLE stale window |
| tle_manual_ttl_ms | `TLE_MANUAL_TTL_MS` | int | 2592000000 | manual/url/upload TTL |
| celestrak_iss_url | `CELESTRAK_ISS_URL` | string | `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle` | TLE default; seeder override |
| decoder_pcm_port | `DECODER_PCM_PORT` | int | 7355 | voice PCM server |
| decoder_audio_udp_port | `DECODER_AUDIO_UDP_PORT` | int | 7356 | voice UDP receiver |
| decoder_ingest_secret | `DECODER_INGEST_SECRET` | string | `""` | ingest auth |
| decoder_secret_file | `DECODER_SECRET_FILE` | string | `/run/decoder/secret` | ingest auth |
| decoder_default_bw_hz | `DECODER_DEFAULT_BW_HZ` | int | 12500 | voice bridge |
| sdr_relay_control_port_offset | `SDR_RELAY_CONTROL_PORT_OFFSET` | int | 2 | relay control |
| sdr_relay_control_timeout_s | `SDR_RELAY_CONTROL_TIMEOUT_S` | float | 2.0 | relay control |
| aprs_decoder_pcm_port | `APRS_DECODER_PCM_PORT` | int | 7357 | APRS bridge |
| aprs_decoder_default_bw_hz | `APRS_DECODER_DEFAULT_BW_HZ` | int | 15000 | APRS bridge |
| aprs_station_ttl_ms | `APRS_STATION_TTL_MS` | int | 300000 | APRS store fallback |
| sentry_poll_interval_s | `SENTRY_POLL_INTERVAL_S` | float | 2.0 | fleet poller |
| sentry_poll_backoff_start_s | `SENTRY_POLL_BACKOFF_START_S` | float | 2.0 | fleet poller |
| sentry_poll_backoff_max_s | `SENTRY_POLL_BACKOFF_MAX_S` | float | 30.0 | fleet poller |
| sentry_location_refresh_s | `SENTRY_LOCATION_REFRESH_S` | float | 60.0 | fleet poller |
| sentry_connect_timeout_s | `SENTRY_CONNECT_TIMEOUT_S` | float | 3.0 | Sentry client |
| sentry_read_timeout_s | `SENTRY_READ_TIMEOUT_S` | float | 5.0 | Sentry client |
| (env_file) | `.env` in CWD, utf-8 | — | — | `@nestjs/config envFilePath` |
| (compose-only) | `PYTHONUNBUFFERED=1` | — | — | dropped (no Python); Node logs are unbuffered |
| (new, optional) | `SENTINEL_FFT_WORKERS` | int | 1 | additive; §4b |

31 rows including the three non-key rows; 28 typed settings keys. Hard-coded constants that are *not* config today and stay hard-coded (parity): `FLIGHT_GAP_MS`, `SNAPSHOT_INTERVAL_MS`, `MAX_HISTORY_DAYS`, `READ_CHUNK_*`, `RECONNECT_BACKOFF_*`, `IDLE_RELEASE_GRACE_S`, `REACHABILITY_*`, `MIN/MAX_FFT_SIZE`, `OUTPUT_RATE`, `_IQ_DECIM_*`, `_FIR_M`, `ADSB_CENTRE_HZ`, `ADSB_SAMPLE_RATE`, `ADSB_GAIN_DB`, `RESERVATION_TTL_SECONDS`, `RENEWAL_INTERVAL_SECONDS`.

---

## Appendix D — frontend module → package mapping

Every non-test source file under `frontend/vue/src/` (219 files) and the shared assets. Spec files (`*.spec.ts`) travel with their subject. "web" = `apps/web/src/…` (same relative path unless stated). "ui" = `packages/ui/src/…`. "map" = `packages/map-controls/src/…`.

### D.1 App shell, entry, router, assets

| File | New home | Note |
| --- | --- | --- |
| `App.vue` | web `App.vue` | shell; later split `AppHeaderNav`, `MobileNavOverlay` (§5.3 follow-up) |
| `main.ts` | web `main.ts` | hydration/seeding logic → `bootstrap/hydrateFromSettings.ts` (testable), PMTiles registration stays |
| `router/index.ts` | web `router/index.ts` | unchanged — keeps the `beforeEach` domain gate on `appStore.enabledDomains`, `body[data-domain]` stamping and the `sentinel:domain-changed` `CustomEvent` (`{domain, prev}`) that map controls and `MapSidebar` listen for; all three are asserted by the ARIA/DOM snapshot gate (§5.7) |
| `assets/styles.css`, `assets/a11y.css`, `assets/fonts.css` | ui `styles/` (imported by web `main.ts`) | `styles.css` import path of template.css updated |
| `frontend/assets/template.css` | ui `styles/template.css` (verbatim, v1) | later split tokens/reset/shell |
| `frontend/assets/*` (tiles, sprites, fonts, fiord*.json, logo, favicons) | repo `assets/` | served at `/assets` by the API |
| `test/setup.ts` | web `test/setup.ts` (+ ui/map copies) | jest-axe matchers |
| `types/settings.ts` | `packages/contracts/src/settings.ts` | |
| `types/sigplot.d.ts` | web `types/sigplot.d.ts` | |
| `constants/adsb.ts`, `constants/aprs.ts`, `constants/sidebarPanes.ts` | web `constants/` | `sidebarPanes` also re-exported for e2e |

### D.2 `components/base/*` (17) → `packages/ui/src/components/`

All 17 files listed in §5.1, verbatim.

### D.3 `components/shared/*`

| File | New home |
| --- | --- |
| `AppFooter.vue`, `MapLibreMap.vue`, `MapSidebar.vue`, `NotificationsPanel.vue`, `TrackingPanel.vue`, `NoUrlOverlay.vue`, `SettingsPanel.vue` + `.css` | web `components/shell/` (MapSidebar → §5.3 split) |
| `BellIcon`, `ChevronIcon`, `FilterFunnelIcon`, `FilterSubTabIcon`, `LocationPinIcon`, `MyLocationIcon`, `ScrollHintChevronIcon` | ui `icons/` |
| `UserLocationMarker.ts` | map `markers/UserLocationMarker.ts` |
| `filter/BaseFilterPanel.vue` | ui `components/BaseFilterPanel.vue` (generic filter chrome) |
| `map-cluster/mapCluster.ts`, `map-label/mapLabelParts.ts`, `map-label/mapMarkerAria.ts` | map `cluster/`, `label/` |
| `controls/names/NamesToggleControl.ts`, `controls/roads/RoadsToggleControl.ts`, `controls/sentry-sites/SentrySitesControl.ts` | map `controls/` |
| `controls/range-rings/RangeRingsControlBase.ts`, `RingOriginPicker.vue`, `RingOriginOption.vue` | map `controls/range-rings/` |
| `settings/SettingRow.vue`, `settings/SettingsDropdown.vue` | ui `components/settings/` |
| `settings/*` remaining 33 controls (`AdsbLabelFieldsControl`, `AdsbSdrSourceControl`, `AdsbTagFieldsControl`, `AirReplayToggleControl`, `AprsLabelFieldsControl`, `AprsSdrSourceControl`, `ConfigCurrentControl`, `ConnectivityToggle`, `ExportAllControl`, `JsonDataControl`, `LabelFieldsTable`, `LandAprsRetentionControl`, `LocationControl`, `MapLayersControl`, `NotificationSoundControl`, `OfflineSourceControl`, `OnlineSourceControl`, `OverheadAlertsControl`, `ProbeUrlControl`, `RangeRingOriginControl`, `SdrDeviceForm`, `SdrDevicesControl`, `SdrHostGroupHeader`, `SdrOptionsControl`, `SdrRadioRow`, `SdrResumeDelayControl`, `SdrSentryDeviceRow`, `SdrSerialFlashControl`, `SdrSourceStatusDot`, `SdrTimestampIntervalControl`, `SentryHostDetails`, `SentryHostForm`, `SentryHostsControl`, `SentrySiteMap`, `SourceOverrideControl`, `SpaceHoverPreviewControl`, `SpaceTleDatabaseControl`, `SpaceTleManualControl`, `SpaceTleOnlineControl`, `SpaceTleSatListControl`, `SpaceTleUncatControl`) | web `components/settings/<namespace>/` grouped by settings section (app/air/space/land/sdr/sentry) |

### D.4 `components/air/*`

| File | New home |
| --- | --- |
| `AirView.vue`, `AirMap.vue`, `AirSideMenu.vue`, `AirFilter.vue`, `AirReplayPanel.vue` + `.css`, `AdsbSourceNotice.vue`, `airReplayCalendar.ts` | web `components/air/` (AirFilter/AirReplayPanel → §5.3 splits) |
| `controls/sentinel-control-base/SentinelControlBase.ts` | map `SentinelControlBase.ts` |
| `controls/types.ts` | map `types.ts` |
| `controls/adsb/*` (`AdsbLiveControl.ts`, `adsbParse.ts`, `adsbSprites.ts`, `AircraftEventDetector.ts`, `AirMultiPlaybackControl.ts`) | web `components/air/controls/adsb/` (AdsbLiveControl → §5.3 split) |
| `controls/awacs/AwacControl.ts`, `controls/aara/AaraControl.ts`, `controls/airports/AirportsControl.ts`, `controls/military-bases/MilitaryBasesControl.ts`, `controls/overhead-zone/*`, `controls/range-rings/RangeRingsControl.ts`, `controls/reset-view/ResetViewControl.ts`, `controls/clear-overlays/ClearOverlaysControl.ts`, `controls/adsb-labels/AdsbLabelsToggleControl.ts` | web `components/air/controls/<feature>/` |

### D.5 `components/space/*`, `components/land/*`, `components/sea/*`

| File | New home |
| --- | --- |
| `SpaceView`, `SpaceMap`, `SpaceSideMenu`, `SpaceFilter`, `SpacePasses` + `.css`, `SatInfoPanel`, `SatPolarPlot`, `SatRadioInfoSection`, `satRadioInfo.ts`, `spacePassesUtils.ts` | web `components/space/` |
| `controls/satellite/*` (`SatelliteControl.ts`, `SatellitePassScheduler.ts`, `SatellitePassNotifier.ts`, `passNotifStore.ts`, `satelliteSprites.ts`), `controls/daynight/DaynightControl.ts` | web `components/space/controls/` |
| `LandView`, `LandSideMenu`, `LandFilter`, `controls/aprs/AprsStationsControl.ts`, `controls/range-rings/LandRangeRingsControl.ts` | web `components/land/` |
| `SeaView.vue` | web `components/sea/` |

### D.6 `components/sdr/*`

| File | New home |
| --- | --- |
| `SdrView`, `SdrTabPanel`, `SdrPanel` + `.css`, `SdrWaterfall` + `.css`, `SdrRecordingsSection`, `SdrFrequencyManagerTab`, `SdrGroupsTab`, `SdrSearchRangesTab`, `SdrDecodeDock`, `SdrDeviceSelector`, `SdrFavouritesSection`, `SdrFavouriteStar`, `SdrFrequencyGroupFilter`, `SdrFrequencyRowSummary`, `SdrSampleRatePicker`, `SdrSettingsAccordion`, `SdrStepPicker`, `SdrAprsSymbol`, `sdrPanelUtils.ts` | web `components/sdr/` (splits per §5.3) |

### D.7 `stores/*`

| File | New home |
| --- | --- |
| `_persist.ts` | ui `state/persist.ts` |
| `app.ts`, `air.ts`, `airNotif.ts`, `basemap.ts`, `land.ts`, `notifications.ts`, `playback.ts`, `sdr.ts`, `sentrySites.ts`, `settings.ts`, `space.ts`, `tracking.ts` | web `stores/` (payload types from contracts) |

### D.8 `composables/*`

| File | New home |
| --- | --- |
| `useDisclosure`, `useTeleportedMenu`, `useRadioGroupKeyboard`, `useDocumentEvent`, `useWindowEvent`, `useDialog` | ui `composables/` |
| `useRangeRingOrigin`, `useMapContextMenu`, `useUserLocation` | map `composables/` |
| `sdrDeviceEvents`, `useAdsbSourceClaim`, `useAirAlertsService`, `useConnectivity`, `useFrequencyGroupFilter`, `useNotificationSound`, `useOverheadAlertZones`, `useSdrAudio`, `useSdrAutoTune`, `useSdrControlSocket`, `useSdrDecode`, `useSdrDigitalDecode`, `useSdrFreqDigitWheel`, `useSdrRadioSelection`, `useSdrRecording`, `useSdrSignalMarker`, `useSdrSweepEngine`, `useSidebarPaneTarget`, `useSpaceAlertsService`, `useStagedSetting` | web `composables/` |

### D.9 `services/*`, `utils/*`

| File | New home |
| --- | --- |
| `services/adsbSourceApi`, `sdrRadiosApi`, `sdrSearchApi`, `sentryApi`, `settingsApi` | web `services/` (typed from contracts) |
| `utils/rangeRings`, `distanceUtils`, `locationUtils` | map `utils/` |
| `utils/aprsSymbols`, `domainKeys`, `locationValidation`, `removedStorageKeys`, `satelliteUtils`, `sentrySiteLabel` | web `utils/` |

### D.10 Tests

| Location today | New home |
| --- | --- |
| `frontend/vue/src/**/*.spec.ts` (209) | alongside their subjects (ui / map / web) |
| `frontend/vue/e2e/*.spec.ts` (11) + `support/`, `fixtures/` | `apps/web/e2e/` (+ new `screenshots/` goldens) |
| `tests/e2e/fullstack-smoke.spec.ts` | `tests/e2e/` unchanged (targets the Docker image) |
| `tests/backend/*.py` (25) | Appendix E |

## Appendix E — pytest → vitest mapping

| pytest file | vitest target |
| --- | --- |
| `test_adsb_rate_limit_backoff.py` | `apps/api/src/air/upstream-rate-limiter.spec.ts` |
| `test_adsb_readsb_source.py` | `apps/api/src/air/adsb-upstream-client.spec.ts` |
| `test_adsb_source_claim.py` | `apps/api/src/adsb-source/adsb-source.service.spec.ts` |
| `test_aprs_store.py` | `apps/api/src/land/aprs-station-store.spec.ts` |
| `test_cache.py` | `apps/api/src/common/clock.spec.ts` |
| `test_database_prune_settings.py` | `apps/api/src/persistence/removed-settings-pruner.spec.ts` |
| `test_decoder_entrypoint.py`, `test_decoder_aprs_entrypoint.py` | stay pytest under `decoder/` in v1 (D11); move to `apps/decoder-*` in 12b |
| `test_routers_air.py` | `apps/api/src/air/air.controller.spec.ts` + golden |
| `test_routers_aprs.py` | `apps/api/src/sdr/aprs/aprs.controller.spec.ts` |
| `test_routers_sdr_decode.py` | `apps/api/src/sdr/decode/decode.controller.spec.ts` |
| `test_routers_sdr.py` | `apps/api/src/sdr/{radios,frequencies,search-ranges,recordings,stream}/*.controller.spec.ts` |
| `test_routers_sentry.py` | `apps/api/src/sentry/sentry-hosts.controller.spec.ts` |
| `test_routers_settings.py` | `apps/api/src/settings/settings.controller.spec.ts` |
| `test_routers_space.py` | `apps/api/src/space/space.controller.spec.ts` |
| `test_sdr_broadcaster.py` | `apps/api/src/sdr/stream/radio-broadcaster.spec.ts` |
| `test_sdr_decode.py` | `packages/dsp/src/demod/*.spec.ts` + `apps/api/src/sdr/decode/bridges.spec.ts` |
| `test_sdr_fft.py` | `packages/dsp/src/spectrum.spec.ts` |
| `test_sdr_ownership.py` | `apps/api/src/sdr/stream/relay-control-client.spec.ts` |
| `test_sdr_reachability.py` | `apps/api/src/sdr/stream/reachability-probe.spec.ts` |
| `test_sentry_client.py` | `apps/api/src/sentry/sentry-client.spec.ts` |
| `test_sentry_fleet.py`, `test_sentry_radio_following.py` | `apps/api/src/sentry/sentry-fleet-poller.spec.ts` |
| `test_services_satellite.py` | `packages/orbit/src/*.spec.ts` |
| `test_services_tle_fetch.py` | `apps/api/src/space/tle.service.spec.ts` |

---

## Sources checked for library facts

- satellite.js API surface (twoline2satrec, sgp4, propagate, jday, gstime, eciToGeodetic, satrec fields): https://github.com/shashwatak/satellite-js , https://www.npmjs.com/package/satellite.js
- NestJS WsAdapter dynamic path params still unreleased (PR open): https://github.com/nestjs/nest/pull/15488 ; adapter docs https://docs.nestjs.com/websockets/adapter
- FFT options and benchmarks: https://github.com/indutny/fft.js/ , https://toughengineer.github.io/demo/dsp/fft-perf/ , https://www.npmjs.com/package/kissfft-js , https://github.com/IQEngine/WebFFT
- Drizzle SQLite drivers (better-sqlite3 default; node:sqlite unsupported by drizzle-kit): https://orm.drizzle.team/docs/get-started-sqlite , https://github.com/drizzle-team/drizzle-orm/issues/5471 ; TypeORM 1.0 dropped `sqlite3`: https://typeorm.io/docs/releases/1.0/upgrading-from-0.3/ ; Prisma WAL via `$queryRaw`: https://github.com/prisma/prisma/issues/3303
- Vitest + NestJS decorators via unplugin-swc: https://zenn.dev/maronn/articles/nestjs-vitest-migrate?locale=en , https://ecosire.com/blog/vitest-testing-nestjs-guide
