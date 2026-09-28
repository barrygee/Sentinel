# Plan: user-selected offline map downloads

Status: IMPLEMENTED — shipped in PR #366 (merged 2026-09-28). Decisions made 2026-09-27. Written 2026-09-27 from a code review plus two
research passes (tile extraction/storage, and selection UX/progress).

## Goal

The user picks an area on the map, either by **dragging a rectangle** (dashed
outline) or with **"Use current view"**. They choose a **depth** (max zoom),
see an estimate of tile count and size, and download everything needed to view
that area offline in the **dark, light and colour** basemaps. All three are
selected by default, with checkboxes to deselect.

## What the code review established (drives the design)

1. **All three themes use the same tiles.** `fiord.json`, `positron.json` and
   `cartographic.json` share the same sources (`openmaptiles` →
   `uk.pmtiles`, `surroundings` → `surroundings.pmtiles`) and the same layer
   ids. Only the paint differs (`utils/mapStyle.ts`, `build_colour_basemap.py`).
   Downloading "dark + light + colour" therefore means **one tile download**
   plus three ~50 KB style JSONs, and those JSONs are already bundled.
2. **Glyphs and sprites are already fully local.** There are 256/256 Noto Sans
   ranges under `/assets/fonts/` and the `ofm` sprites under `/assets/sprites/`,
   and they don't depend on the area chosen. Nothing needs downloading.
3. **Offline tiles use the Protomaps v4 schema.** `uk.pmtiles` was built by
   planetiler "Protomaps Basemap" 4.14.3 and uses the layers
   `earth/water/roads/places/…`. The *online* styles use OpenFreeMap, which is
   the OpenMapTiles schema and cannot feed the offline styles. Downloads must
   come from a Protomaps v4 build.
4. **`frontend/assets` is mounted read-only in Docker** (`docker-compose.yml`).
   Downloads need a new writable volume.
5. **Styles are selected by `basemapStyleUrl(online, theme)`**, which is used
   by AirMap, SeaMap, SpaceMap and LandView. Every map already reloads its
   style on theme or connectivity change through `setMapStyle`.

## Key design decisions

### D1 — Extract with go-pmtiles on the backend

`pmtiles extract <remote planet> out.pmtiles --bbox=W,S,E,N --maxzoom=Z`
range-reads only the area needed from a hosted planet archive. It is the
sanctioned Protomaps workflow and is already documented in our README. The
Python `pmtiles` package **cannot** do this, because it has no remote reader and
no bbox subsetting. Bundle a pinned go-pmtiles release (v1.31.x, ~16 MB static
binary, amd64 + arm64 via `TARGETARCH`) in `backend/Dockerfile`, with a
checksum check.

- Always extract from zoom **0 to maxzoom**; never pass `--minzoom`. The full
  pyramid is the efficient case, and the overview zooms are needed to zoom out
  offline.
- **Source URL is configurable and pinned.** Keep it in an env/settings value
  such as `OFFLINE_TILES_SOURCE_URL=https://build.protomaps.com/YYYYMMDD.pmtiles`.
  build.protomaps.com keeps dated builds for about a week plus one per patch
  version, has no stable "latest" alias, and discourages hotlinking. Before
  each job, the backend validates the header: MVT, clustered, and basemap
  major version 4.

### D2 — Serve all offline tiles through one backend tile endpoint

> The research suggested adding one `pmtiles://region-N.pmtiles` source per
> downloaded region to the style. **I'm not taking that suggestion.** A
> MapLibre layer is bound to a single source, so N regions would mean N copies
> of all 48 `openmaptiles` layers. Where a region overlaps `uk.pmtiles`, roads
> and labels would draw twice. `pmtiles merge` is also out, because it requires
> archives that don't overlap.

Instead, add `GET /api/offline-map/tiles/{z}/{x}/{y}.mvt`, which:

1. looks the tile up in the downloaded region archives, newest first
   (the Python `pmtiles` **local** mmap `Reader.get(z,x,y)` can do this, with
   cached readers);
2. falls back to `uk.pmtiles`;
3. returns **204** when no archive has the tile (MapLibre renders an empty
   tile).

It returns the stored gzip bytes as-is with `Content-Encoding: gzip`, so there
is no recompression. It sends `Cache-Control` plus an ETag tied to the region
set, so deleting a region busts the cache. Each lookup is a dict lookup plus one
mmap slice, which is well within budget for a single-operator LAN app.

In the three **offline** styles, change the `openmaptiles` source from
`url: pmtiles:///assets/tiles/uk.pmtiles` to
`tiles: ["/api/offline-map/tiles/{z}/{x}/{y}.mvt"], minzoom 0, maxzoom 14`.
Also update `build_colour_basemap.py` so the colour style regenerates
correctly. `surroundings` stays a static `pmtiles://` source because it is the
global z0–6 underlay. This change ships first on its own, with no behaviour
change: `uk.pmtiles` becomes the only tier.

### D3 — Content checkboxes, not theme checkboxes (DECIDED)

Because of finding 1, unticking a theme would save **no tiles and no
bandwidth**, so a theme checkbox would be a control that does nothing. The
checkboxes cover what *does* cost bandwidth instead:

- **Basemap**: vector tiles, ticked by default.
- **Terrain**: DEM for hillshade and contours (see D6), ticked by default.

At least one must be ticked. A fixed line beneath them reads "Works offline in
DARK, LIGHT and COLOUR". It isn't a control, so the three themes are still
visibly covered.

### D4 — Store regions in a writable volume, tracked in SQLite

- New compose volume `sentinel_tiles:/app/data/tiles`, with a local path
  fallback for non-Docker dev set by config `OFFLINE_TILES_DIR`.
- New ORM model `offline_map_region`: `id` (uuid), `label`, `west/south/east/north`,
  `max_zoom`, `themes` (JSON), `include_terrain`, `status`
  (queued|running|complete|failed|cancelled), `bytes_done`, `bytes_estimated`,
  `tiles_estimated`, `error`, `source_url`, `created_at`, `completed_at`.
  Filenames are server-generated (`<uuid>.pmtiles`). No client-supplied path
  ever reaches the filesystem.
- The job runner writes to `<uuid>.pmtiles.part` and atomically renames it on
  success. On startup, `lifespan` marks leftover `running` rows as `failed` and
  deletes `.part` files.

### D5 — Run jobs in the background and poll for progress

- One job at a time, in an `asyncio.Queue` worker started in `lifespan` and
  launched with `asyncio.create_subprocess_exec` (argv list, never a shell).
- **Progress** comes from the growth of the `.part` file against the size
  estimate. That is more robust than scraping go-pmtiles' progress bar. Show it
  as an indeterminate bar until the first bytes arrive.
- **Cancel** is `DELETE` on a running job: terminate the process, remove
  `.part`, set status `cancelled`.
- The frontend polls `GET /api/offline-map/regions/{id}` every 1–2 s. The
  active job id is persisted in the store (`_persist.ts`), so progress resumes
  after a reload or tab switch and the download keeps running server-side.
  Polling was chosen over SSE or WebSocket because the job is one-directional
  and low-frequency and must be resumable anyway. Reusing the SDR WS machinery
  (SIGTERM chaining) would add cost with no benefit.
- Hook the worker into the existing SIGTERM chain so a `--reload` doesn't hang
  on a running subprocess.

### D6 — Terrain (IN v1)

The same `pmtiles extract` works against `https://download.mapterhorn.com/planet.pmtiles`,
which is Terrarium z0–12 and matches the existing `uk-terrain.pmtiles`. Its
source URL is configured separately (`OFFLINE_TERRAIN_SOURCE_URL`).

- A region with Terrain ticked produces a second archive,
  `<uuid>.terrain.pmtiles`, extracted to `min(max_zoom, 12)`. MapLibre
  overzooms the DEM beyond that, as it does today. The job runs the basemap
  extract, then the terrain extract. Progress covers both and shows which part
  is running.
- A second resolver endpoint, `/api/offline-map/terrain/{z}/{x}/{y}`, checks
  region terrain archives newest first, then `uk-terrain.pmtiles`, else 204.
  It keeps the tile type from the archive header.
- `terrainDem.ts` / `TerrainToggleControl.ts` currently open
  `uk-terrain.pmtiles` directly, both for the raster-dem source and for
  maplibre-contour's DEM fetch. Both move to the endpoint (`tiles: [...]` and a
  plain-fetch URL template), which also retires the "archive not installed"
  check. The TERRAIN button is instead enabled when *any* terrain tier exists
  (`GET /api/offline-map/source` reports it).
- Deeper than z12 would need Mapterhorn's regional archives. That stays out of
  scope.

## API (new router `backend/routers/offline_map.py`, mounted under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/offline-map/tiles/{z}/{x}/{y}.mvt` | Resolved tile: regions, then uk.pmtiles, else 204 |
| GET | `/api/offline-map/source` | Configured source URL, validated build version, reachable yes/no |
| POST | `/api/offline-map/estimate` | `{bbox, max_zoom, include_basemap, include_terrain}` → tiles and bytes (basemap and terrain) plus free disk space. This is the authoritative pre-queue check; the UI computes the same numbers live |
| POST | `/api/offline-map/regions` | Queue a download → 202 + region row |
| GET | `/api/offline-map/regions` | List all regions (for the list and the map outlines) |
| GET | `/api/offline-map/regions/{id}` | Status and progress (polled) |
| DELETE | `/api/offline-map/regions/{id}` | Cancel if running; else delete the file and row |

**Validation.** This is the highest priority, per the standards.

- `z/x/y` are ints with `0 ≤ z ≤ 14` and `0 ≤ x,y < 2^z`.
- bbox values are finite. Clamp latitude to ±85.05113 and longitude to
  ±180, with `W < E` and `S < N`. Split an antimeridian crossing into two
  bboxes, or reject it (v1: reject with a clear message).
- `max_zoom` is between 6 and 14. `label` is at most 60 characters and
  stripped. `include_basemap` and `include_terrain` are booleans, and at least
  one must be true.
- **No size cap (DECIDED).** The user sees the live size estimate and decides.
  The only hard gate is physical: `shutil.disk_usage` must exceed the
  estimate plus a 10% margin, or the request gets 507 with a clear message
  that includes both numbers. The job also re-checks free space during the
  download and aborts cleanly if the disk fills.
- Downloads are refused while connectivity is offline. The source URL is only
  ever the configured one, and the client can't supply it (no SSRF).
- Errors never leak subprocess stderr verbatim: log it and return a generic
  message.

## Estimation

- **Tile count** is exact, using the standard Web Mercator tile math summed over
  z = 0..max. It lives in a shared pure function, mirrored in TS for the live
  preview and in Python for the authoritative disk-space check.
- **Byte estimate:** calibrate average bytes per tile, per zoom, from our own
  `uk.pmtiles` directory, and the terrain equivalent from
  `uk-terrain.pmtiles`. Do this once with a script
  (`backend/scripts/calibrate_tile_sizes.py`) and commit the resulting table as
  a constant. No official per-zoom table exists.
- **Live display (DECIDED, replaces the cap).** The estimate is computed
  **client-side** from the same table on every change: while dragging
  (rAF-throttled), when a N/S/E/W field is edited, when the depth changes, and
  when a checkbox is toggled. There is no server round trip per frame. It shows
  "~1.2 GB · 184,300 tiles", split into basemap and terrain, next to the free
  disk space (from `/api/offline-map/source`). It turns to a warning style
  when the estimate exceeds the free space, which is the only case where
  Download is disabled. The `aria-live` region announces only the *settled*
  value (debounced ~500 ms) so screen readers aren't flooded mid-drag.

## Frontend

The map interaction and the panel are separate, following the
composition rule. The selection map lives only in Settings (see below).

**Location (DECIDED): Settings only.** There are no domain-map controls. A new
**Offline Maps** group in Settings › App Settings hosts everything, around its
own small map. That map is `OfflineAreaMap.vue`, which reuses the
`SentrySiteMap.vue` pattern: a self-contained MapLibre instance on the
**online** basemap for the current map theme. The online basemap is used
because downloading requires a connection anyway, and it lets you frame areas
outside what's already downloaded. On mobile the map is full-width, about
60vh. On wider screens the map and form sit side by side.

**`components/shared/settings/offline-maps/`**
- `rectangleDrawHandler.ts` is a small custom handler, roughly 150 lines, not
  terra-draw. It is a plain class, not an IControl, because it only lives on
  this one map; the "DRAW AREA" button arms it. When armed, it:
  - sets a crosshair cursor and disables `dragPan`, `boxZoom` and
    `dragRotate`;
  - uses Pointer Events, so mouse, touch and pen share one path;
  - takes the corners from `map.unproject`, and supports **tap-tap** (two
    single clicks for opposite corners) as the WCAG 2.5.7 no-drag alternative;
  - cancels on `Escape`, listening on `window`;
  - re-enables the map handlers when it finishes.
- Rendering uses a GeoJSON polygon source plus a `line` layer with
  `line-dasharray` for the **dashed selection**. It reprojects on pan/zoom and
  under globe. Downloaded regions get a solid, muted outline layer. Both are
  rebuilt on `style.load`, because every theme swap wipes them, and their ink
  is theme-aware via `overlayAccentColor()` / `isBrightBasemap()` (the lesson
  from PRs #363/#364). Updates are rAF-throttled.

**Settings group, in the same folder, built from small components**
- `OfflineMapsSettings.vue` is the shell (the settings row). It composes
  `OfflineAreaMap.vue` and:
  - `AreaSelector.vue`: "DRAW AREA" and "USE CURRENT VIEW" buttons, plus
    `BboxFields.vue` with labelled N/S/E/W inputs (`inputmode="decimal"`,
    validated, two-way bound to the drawn box). The fields are the accessible
    equivalent of the canvas, and the only path for screen-reader users.
    "Use current view" reads `map.getBounds()` and clamps latitude. It is
    disabled on the globe below about z3, where "visible bounds" stops meaning
    anything.
  - `DepthPicker.vue`: a max-zoom slider (6–14) with a plain-language label
    such as "z12 · street level".
  - `ContentChecks.vue`: Basemap and Terrain, both ticked by default, plus
    the "Works offline in DARK, LIGHT and COLOUR" line (D3). Terrain notes
    "up to z12" when the depth is higher.
  - `DownloadEstimate.vue`: the live size and tile count, split into basemap
    and terrain, against free disk space. It is an `aria-live="polite"` region
    and announces debounced values only; remember the Playwright strict-mode
    `.first()` trap from CLAUDE.md.
  - `DownloadProgress.vue`: a `<progress>` bar with percentage and MB, and a
    Cancel button.
  - `RegionList.vue` / `RegionListItem.vue`: label, zoom, contents
    (basemap/terrain), size and date, plus a total disk-usage line. Clicking a
    row flies the settings map to that region. Delete has an accessible name
    ("Delete offline area <label>") and asks for confirmation.
- Pinia store `stores/offlineMaps.ts` holds the regions, the draft bbox,
  zoom and checkboxes, and the active job id (persisted). It is the single
  source of truth for both the outline layer and the list. The draft lives in
  the store rather than component refs, so closing and reopening Settings
  keeps it. The API client goes in `services/offlineMaps.ts`.
- Download is disabled with an explanation while connectivity is offline or
  when the source probe fails.
- **Domain maps change only indirectly:** their offline styles read from the
  resolver endpoints, so downloaded regions simply appear there. Regions are
  newest first, so the domain maps refresh their tile cache when a job
  completes. The store bumps a `regionsVersion`, and the map views re-set the
  style or call `source.reload()`.

## Delivery: one branch/PR per step

1. **`feat/offline-tile-endpoint`**: add both resolver endpoints (basemap
   serving uk.pmtiles only, terrain serving uk-terrain.pmtiles only). Switch
   the offline styles' `openmaptiles` source and `terrainDem.ts` /
   `TerrainToggleControl.ts` to them, and update `build_colour_basemap.py`. No
   visible change; confirm the offline maps and TERRAIN look identical in all
   three themes.
2. **`feat/offline-map-jobs`**: go-pmtiles in the Dockerfile, the tiles volume,
   config (both source URLs), model, source/estimate/regions endpoints, the
   basemap + terrain job worker, the disk-space gate, startup cleanup, the
   SIGTERM hook, region tiers in both resolvers, and the calibration script and
   constant.
3. **`feat/offline-maps-settings`**: the store and service, `OfflineAreaMap`
   with the draw handler (dashed rectangle, current view, tap-tap, Escape),
   the form (bbox fields, depth, Basemap/Terrain checks, live estimate),
   progress and cancel, the region list and outlines, the Settings group, and
   the domain-map refresh on completion. Rebuild and commit `spa-dist`, and run
   `npm run test:e2e`: the settings specs and the new live region affect
   existing specs.
4. README (Docker and non-Docker, volume, both source URLs), `.env.example`,
   and a CONTRIBUTING note.

Tests follow the global rule: they are written at commit/push time once
confirmed, not during the build. When they are written they must cover the
negative validation tests (bad z/x/y, inverted or NaN bbox, insufficient disk space, both boxes unticked, offline
mode, path safety, cancel), the tile-tier precedence, the draw handler state
machine, jest-axe on every new component, and e2e with the endpoints stubbed
in `mockApi`.

## Owner decisions (answered 2026-09-27)

- **Q1: Theme checkboxes.** Left to me. Decision: replace them with
  **Basemap / Terrain** checkboxes, and state that downloads work in all three
  themes (D3).
- **Q2: Where the feature lives.** **Settings only**, with its own small map.
- **Q3: Size cap.** **No cap.** Show the size live as the area, depth or
  checkboxes change. Free disk space is the only gate.
- **Q4: Terrain.** **Included in v1** (D6).

---

## BUILD CONTRACT (binding for the parallel build — 2026-09-27)

Everything below is the seam between backend and frontend. Do not deviate
without flagging it as an open question. JSON over the wire is **snake_case**
(existing convention). Times are epoch **milliseconds**.

### Branching
One feature branch `feat/offline-map-downloads`, worktree `/tmp/sentinel-offline-maps`.
The release step may split it into stacked PRs; build it as one.

### Config (`backend/config.py`, env / `.env` overridable)
- `offline_tiles_dir: str = ""` → empty means `<dir of db_path>/tiles` (in Docker `/app/data/tiles`, via the `sentinel_db` volume, so NO new compose volume is required; mkdir on startup).
- `offline_basemap_source_url: str = "https://build.protomaps.com/<pinned YYYYMMDD>.pmtiles"` (pin a real, currently available v4 build; document in `.env.example`).
- `offline_terrain_source_url: str = "https://download.mapterhorn.com/planet.pmtiles"`
- `pmtiles_bin: str = "pmtiles"` (path/name of the go-pmtiles binary)
- `offline_basemap_base_archive` = `frontend/assets/tiles/uk.pmtiles`, `offline_terrain_base_archive` = `frontend/assets/tiles/uk-terrain.pmtiles` (resolved from ROOT_DIR, overridable).

### Endpoints — router `backend/routers/offline_map.py`, prefix `/api/offline-map`
1. `GET /api/offline-map/basemap/{z}/{x}/{y}` — tile resolver: completed region basemap archives newest `completed_at` first → base `uk.pmtiles` → **204** empty. Body = stored bytes untouched; `Content-Type: application/x-protobuf`; `Content-Encoding: gzip` when archive tile_compression is gzip. `Cache-Control: no-cache` + `ETag` = hash(tiers-version, z, x, y) so a region add/delete invalidates. Validate `0<=z<=14`, `0<=x,y<2^z` → 422/404 otherwise.
2. `GET /api/offline-map/terrain/{z}/{x}/{y}` — same, terrain tiers (region `.terrain.pmtiles` → `uk-terrain.pmtiles`), `0<=z<=12`, Content-Type from archive header tile type (`image/webp` / `image/png`), **204** when missing.
3. `GET /api/offline-map/status` →
```json
{ "basemap_available": true, "terrain_available": true,
  "basemap_max_zoom": 14, "terrain_max_zoom": 12,
  "free_bytes": 0, "used_bytes": 0,
  "sources_configured": true, "pmtiles_available": true,
  "tiers_version": "abc123",
  "avg_tile_bytes": { "basemap": {"0": 0, "...": 0, "14": 0}, "terrain": {"0": 0, "...": 0, "12": 0} } }
```
`avg_tile_bytes` is the calibration table (bytes per tile by zoom, string keys) — the frontend's live estimate uses exactly this, so client and server can never disagree. `tiers_version` changes whenever a region completes or is deleted.
4. `POST /api/offline-map/estimate` body `AreaRequest` →
```json
{ "basemap_tiles": 0, "basemap_bytes": 0, "terrain_tiles": 0, "terrain_bytes": 0,
  "total_bytes": 0, "free_bytes": 0, "fits": true }
```
5. `POST /api/offline-map/regions` body `AreaRequest & {"label": str}` → **202** `Region`. 422 on invalid input, **507** when `total_bytes*1.1 > free_bytes`, **409** if connectivity mode is offline, **503** if pmtiles binary/source not configured. Jobs queue and run one at a time.
6. `GET /api/offline-map/regions` → `Region[]` newest first.
7. `GET /api/offline-map/regions/{id}` → `Region` (polled every 1–2 s). 404 unknown.
8. `DELETE /api/offline-map/regions/{id}` → **204**. Queued/running → cancel (terminate subprocess, remove `.part`, status `cancelled`, row then deleted); otherwise delete files + row.

`AreaRequest`: `{ "west": float, "south": float, "east": float, "north": float, "max_zoom": int, "include_basemap": bool, "include_terrain": bool }` — finite; lon in [-180,180], lat clamped/validated to ±85.05113; `west<east` (antimeridian crossing rejected in v1 with a clear message), `south<north`; `6<=max_zoom<=14`; at least one include true. `label`: 1–60 chars, stripped.

`Region`:
```json
{ "id": "uuid", "label": "Lake District", "west": 0, "south": 0, "east": 0, "north": 0,
  "max_zoom": 14, "include_basemap": true, "include_terrain": true,
  "status": "queued|running|complete|failed|cancelled",
  "phase": "basemap|terrain|null",
  "bytes_done": 0, "bytes_estimated": 0, "tiles_estimated": 0, "size_bytes": 0,
  "error": null, "created_at": 0, "completed_at": null }
```
Terrain is extracted to `min(max_zoom, 12)`.

### Frontend switch-over (part of this build)
- Offline styles `fiord.json`, `positron.json`, `cartographic.json`: `openmaptiles` source → `{"type":"vector","tiles":["/api/offline-map/basemap/{z}/{x}/{y}"],"minzoom":0,"maxzoom":14}`; `surroundings` unchanged. `frontend/scripts/build_colour_basemap.py` must produce the same for cartographic. (Backend engineer owns these JSON/script edits.)
- `terrainDem.ts` / `TerrainToggleControl.ts`: raster-dem source → `tiles:["/api/offline-map/terrain/{z}/{x}/{y}"]`, `maxzoom` from status `terrain_max_zoom`, `tileSize` 512; maplibre-contour fetches the same URL template (plain HTTP, so its worker can be used again if sensible; a 204 must become the flat sea-level tile, not an error). Availability = status `terrain_available`.
- Domain maps refresh tiles when `tiers_version` changes after a job completes.
