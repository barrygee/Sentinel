# Land live feeds — traffic cameras, traffic data and public webcams (North East UK)

Status: PLAN — COMPLETE (2026-09-14). Nothing implemented yet. Research done
inline; every claim below was verified against the live service on 2026-09-14
unless marked *unverified* (see §8 for the verification log).

## 1. Research findings

### Ranked shortlist

| # | Source | What it gives us | Auth | Licence | Coverage | Confidence |
|---|--------|------------------|------|---------|----------|------------|
| 1 | **Tyne & Wear + Durham UTMC Open Data Service** — `https://www.netraveldata.co.uk/api/v2/` | CCTV camera locations + JPEG images, events, incidents, roadworks, journey times, SCOOT flow/speed/congestion, VMS, car parks, weather stations, air quality | Free account, **HTTP Basic** (site username/password) | **OGL 3.0** (Newcastle City Council) | Tyne & Wear + County Durham (not Northumberland, not Tees Valley) | **Verified live** — `/api/v2/cctv/static` answers 401 without credentials |
| 2 | **National Highways Developer Portal** — `https://developer.data.nationalhighways.co.uk/`, API host `https://api.data.nationalhighways.co.uk` | Road & Lane Closures v2 (planned + unplanned, **DATEX II payload**), Digital VMS, Speed Managed Areas, Road Limits & Features | Free self-serve key; header **`Ocp-Apim-Subscription-Key`**; **10 calls / key / minute** | OGL v2-based NH terms: commercial use + redistribution OK, attribution **"Powered by National Highways' Transport Data Feeds"**, scraping prohibited, may become chargeable with 6–12 months' notice | Strategic Road Network: A1(M), A19, A69, A66, A1 | **Verified** — `roads/v2.0/closures` returns `Invalid Subscription Key` (401) with the APIM header |
| 3 | **Durham County Council traffic cameras** — ArcGIS feature layer `https://spatial.durham.gov.uk/arcgis/rest/services/External/VectorPoint/MapServer/30` + images `https://dcc.ussgroup.co.uk/images/<USS_Camera_Number>.jpg` | **33 cameras** (Durham City, Bishop Auckland, A167/A690) with WGS84 lat/lon, name, view description, status, council page link, USS camera id; JPEG updated **every minute** | **None** — public ArcGIS REST query + unauthenticated image | Not stated on the pages (council "External" GIS service; CCTV privacy notice only) — **confirm reuse terms with DCC** before shipping; assume OGL-style council open data until then | County Durham | **Verified live** — query returns 33 features; image `Last-Modified` was 1 min old |
| 4 | **TfL JamCams (London)** — Unified API `https://api.tfl.gov.uk/Place/Type/JamCam` + images/clips on `s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/<id>.jpg|.mp4` | **890 cameras** (847 `available`) across Greater London (bbox −0.49…0.23, 51.32…51.68) with lat/lon, name, `view` direction, JPEG still **and a ~5–10 s MP4 loop** per camera; refreshed ~every 5 min | None needed (anonymous 50 req/min); free `app_key` lifts it to 500 req/min | TfL open-data terms (OGL-based), attribution **"Powered by TfL Open Data"**, commercial use OK | Greater London | **Verified live** — 890 features returned; image + mp4 `Last-Modified` 1 min old |
| 5 | **Street Manager Open Data API** (DfT) — `https://api.manage-roadworks.service.gov.uk` | Every utility street work + LA roadwork in England; **GeoJSON API v6** with bbox, **EPSG:27700 BNG** (reproject) | Onboarding form (`manage-roadworks.service.gov.uk/open-data-onboarding`), then `POST /authenticate` → ID token (1 h) + refresh token (1 day) via `POST /party/refresh`; per-IP 429 throttling | OGL | Whole of England — fills the Northumberland / Tees Valley roadworks gap | High — documented v6 spec |
| 6 | **Windy Webcams API v3** — `https://api.windy.com/webcams/api/v3/webcams` | Public webcams (beach, harbour, town) with lat/lon, preview image + player URLs, bbox/region filter | Free key, header `x-windy-api-key`; image URLs carry **10-min tokens** on the free tier | ToS: use only API image URLs, no stretching, every image links to its Windy page/player, courtesy line "Webcams provided by Windy.com"; free-tier request quota *unverified* (not on the terms page) | Coast + towns (Tynemouth Longsands, Mouth of Tyne, etc.) | High |
| 7 | **TomTom Traffic API** (Incidents + Flow Segment) | Congestion/speed + incidents anywhere | Free tier **20,000 req/month** for Flow Segment Data, no credit card | Attribution; basemap/display terms *unverified* (T&C page is client-rendered) | Gap-filler for Northumberland + Tees Valley live congestion | Medium — deferred to P4 |

### Sources investigated and ruled out (for now)

- **National Highways CCTV images** — there is **no public API**. A 2024 petition for one was rejected as "operational". Images reach the public via (a) NTIS DATEX II push subscriptions (needs approval, delivers to *your* server, and the Traffic England site closes **30 June 2026** in favour of the "NTIS Transformed Solution"), or (b) nominated "media partners" over the VIH. Third-party sites (trafficcameras.uk, motorwaycameras.co.uk, trafficengland.uk) rehost these; scraping them is ToS-questionable and brittle — **do not build on them**. Design a generic *JPEG snapshot* feed type so any camera image URL the user is licensed to use can still be plotted, and leave a DATEX II adapter as a later phase if an NTIS subscription is granted.
- **Council public-space CCTV** — no NE council publishes live public-space CCTV; only tourism/weather webcams are legitimately public. Directories of unsecured private cameras (insecam-style, Shodan RTSP) are explicitly out of scope.
- **Newcastle Urban Observatory** — **confirmed dead for cameras.** `api/v2.0a/sensors/entity?metric=Camera image` lists 401 camera entities, but their broker "UTMC Open Camera Feeds" reports `active: false` and every entity has an empty `position`. Nothing to build on; source 1 is the live upstream anyway.
- **Tees Valley UTMC** (Middlesbrough control centre, cameras + VMS) — no open-data API found. Gap; cover with sources 2, 5 and 7.
- **Bus Open Data Service** (SIRI-VM / GTFS-RT, free key, 10 s bus positions) — real and easy, but it's a *transport* layer, not traffic/cameras. Park as an optional phase.
- **Local webcam operators** (Tynemouth Surf Co, North Tyneside Council "Mouth of Tyne", bluestarline.org) — page-embedded players, no schema, hotlinking unclear. Reach them through Windy where listed; otherwise the *snapshot* feed type if the operator agrees.

### Sites you asked me to try

| Site | What it is | Verdict |
|------|------------|---------|
| `netrafficcams.co.uk` | Drupal viewer, ~30 pages × 12 ≈ 360 cameras, images at `/sites/default/files/images/cameras/<id>.jpg` (1920×1080), ids `dutmc_*`, `VAISALACCTV*`… — i.e. a **rehost of source #1's UTMC feed**, credited "© Tyne and Wear Urban Traffic Management Control". No API, no map data endpoint, no terms/licence page, blocks non-browser user agents (403). | **Don't consume.** Same data as #1 with no licence — go to netraveldata directly. Useful only as a visual catalogue of what's in the feed. |
| `durham.gov.uk/durhamtrafficcameras` | 25-camera listing + "see all on a map" → ArcGIS Instant Atlas → a **public feature layer** (33 cameras, lat/lon + metadata) whose `Cam_Link` pages wrap a plain JPEG on `dcc.ussgroup.co.uk`. | **Promoted to source #3.** Zero-credential Durham cameras; the same cameras (`dutmc_*`) also arrive via UTMC once that account exists, so the adapter dedupes on USS id. Images have no CORS header → proxy. |
| `uktraffic.live` | Aggregator of 4,339 cameras crediting Highways England (2,600), TfL, Traffic Scotland, Traffic Wales, TrafficWatchNI. No API, no reuse terms. | **Don't consume** — third-party rehost of National Highways media-partner imagery; same ToS problem as trafficcameras.uk. It does confirm NH camera *names* for the A1/A66/A68 if we ever get an NTIS subscription. |
| `trafficwatchni.com/twni/cameras` | DfI Northern Ireland, 220+ cameras, static pages `/twni/cameras/static?id=…`, Crown copyright, no API. | **Out of area** (Northern Ireland). Pattern is the same page-wrapped JPEG as Durham, so the `snapshot` provider would handle it if ever wanted. |

### UTMC camera behaviour the adapter must model (from the CCTV page)

- Camera id prefixes: `GH, MC, NB, NC, NT, PS, SL, ST` (UTMC), `TT2` (Tyne Tunnel), `METCCTV`/`VAISALACCTV` (Vaisala weather cams). Both `/api/v1/` and `/api/v2/` exist — use v2.
- Refresh: UTMC 60–300 s (640×480 or 1280×720), Tyne Tunnel ~60 s (352×288), Vaisala 900–1800 s.
- **Joint UTMC/Public-Safety cameras stop returning JPEGs Mon–Fri 23:00–06:30 and Sat–Sun 23:00–07:00**, and PTZ cameras return nothing while an operator is driving them. The UI must show these as *offline (night)* / *operator control*, not as errors — derive it from a missing image with a recent `dynamic` timestamp, and don't back-off the poller for it.

### Schema families (one adapter serves several)

- **UTMC v2 JSON** — one adapter covers cameras, events, incidents, roadworks, SCOOT, VMS, car parks (all `…/{dataset}/static` + `…/{dataset}/dynamic`, joined on `systemCodeNumber`).
- **National Highways portal** — each product is its own REST/JSON API behind one key; one HTTP client, per-product mappers.
- **GeoJSON** (Street Manager) — generic GeoJSON adapter + CRS reprojection.
- **TfL Unified API JSON** — one adapter; `additionalProperties[]` key/value list flattened to `imageUrl`, `videoUrl`, `view`, `available`.
- **Image snapshot** — generic "poll a JPEG URL" adapter; also what the UTMC image proxy reduces to.

## 2. Product scope

Three feed **categories** the user sees, each backed by one or more configured **sources**:

| Category | Map layer(s) | Feature kinds |
|----------|--------------|---------------|
| `traffic-cameras` | Traffic Cameras | `camera` (click → latest image, timestamp, stale badge, auto-refresh while popup open) |
| `traffic-data` | Traffic Events, Roadworks, Congestion, VMS, Car Parks | `incident`, `event`, `roadworks`, `flow`, `vms`, `carpark` |
| `webcams` | Webcams | `webcam` (preview image + "Open on Windy" link) |

## 3. Settings config (the deliverable the user asked for)

`backend/default_config.json`, `land` namespace, new key **`feeds`** — a list, same shape-of-idea as `sdr.radios`. Seeded with the free sources *disabled* so a fresh install shows what to fill in:

```jsonc
"land": {
  "enabled": false,
  "sourceOverride": "auto",
  "labelDataPoints": { ... },
  "aprsRetentionMinutes": 5,
  "defaultLayers": ["aprs", "trafficCameras", "trafficEvents", "roadworks", "webcams"],
  "feeds": [
    {
      "id": "utmc-tyne-wear",                 // slug, unique, immutable once created
      "name": "Tyne & Wear + Durham UTMC",    // shown in Settings, layer legend, attribution
      "category": "traffic-cameras",          // traffic-cameras | traffic-data | webcams
      "provider": "utmc",                     // adapter key — allow-listed on the backend
      "url": "https://www.netraveldata.co.uk/api/v2",
      "enabled": false,
      "refreshSeconds": 60,                   // clamped 15–3600 on the backend
      "datasets": ["cctv", "events", "incidents", "roadworks", "scoot", "vms"], // provider-specific
      "bbox": null,                           // optional [[minLon,minLat],[maxLon,maxLat]] filter
      "auth": { "type": "basic" }             // none | basic | apiKey ; secrets are NOT here
    },
    {
      "id": "national-highways-closures",
      "name": "National Highways closures",
      "category": "traffic-data",
      "provider": "nationalhighways",
      "url": "https://api.data.nationalhighways.co.uk",   // verify exact base on subscription
      "enabled": false,
      "refreshSeconds": 120,
      "datasets": ["closures", "vms"],
      "bbox": [[-2.6, 54.4], [-0.7, 55.9]],
      "auth": { "type": "apiKey", "headerName": "Ocp-Apim-Subscription-Key" }
    },
    {
      "id": "tfl-jamcams",
      "name": "TfL JamCams",
      "category": "traffic-cameras",
      "provider": "tfl-jamcams",
      "url": "https://api.tfl.gov.uk",
      "enabled": false,
      "refreshSeconds": 300,                  // TfL refreshes stills/clips ~every 5 min
      "datasets": ["jamcams"],
      "bbox": null,
      "auth": { "type": "apiKey", "queryParam": "app_key", "optional": true }   // anonymous = 50 req/min, keyed = 500
    }
  ]
}
```

**Secrets never live in `feeds`.** Each feed's credential is a separate
`user_settings` row: namespace `land`, key `feedCredential:<feedId>`, value
`{"username":…,"password":…}` or `{"apiKey":…}`. That row follows the existing
`sea.aisstreamApiKey` pattern — redacted on read, refused on write, skipped on
config upload/export — which needs `_SECRET_SETTING_KEYS` in
`backend/routers/settings.py` to grow a prefix rule
(`_SECRET_SETTING_PREFIXES = {("land", "feedCredential:")}`) alongside the
exact-match set. `.env` override: `LAND_FEED_CREDENTIALS_JSON` (optional, same
shape keyed by feed id) so a headless deployment can ship credentials without
the UI, mirroring `AISSTREAM_API_KEY`.

## 4. Backend design

New package `backend/services/land_feeds/`:

- `schema.py` — Pydantic models: `FeedConfig` (validates id slug, https-only URL, provider allow-list, refresh bounds, bbox sanity, `auth.type`), `FeedCredential`, and the **normalised output** `FeedFeature` (`kind`, `id`, `name`, `lat`, `lon`, `updatedAt`, `stale`, `sourceId`, `properties`) grouped into `FeedSnapshot` (per-kind GeoJSON `FeatureCollection`s + `fetchedAt` + `error`).
- `base.py` — `FeedAdapter` protocol: `async fetch(config, credential) -> FeedSnapshot`, `async probe(...)` for the Settings "TEST" button, optional `async image(ref) -> (bytes, content_type)` for camera providers.
- `adapters/utmc.py`, `adapters/tfl_jamcams.py` (one list call per poll; passes `app_key` as a query param when a credential exists; `available:false` → offline state), `adapters/durham.py` (ArcGIS REST query for the feature list + USS JPEG per camera; dedupes against UTMC on `USS_Camera_Number`), `adapters/national_highways.py` (parses the DATEX II closures/VMS payload — confirm XML vs JSON on first keyed call), `adapters/street_manager.py` (BNG→WGS84 via a pure-Python 7-parameter Helmert transform, ±5 m — decided, see §7), `adapters/windy.py`, `adapters/snapshot.py`, `adapters/tomtom.py` (phase 4). Registry maps `provider` → adapter.
- `poller.py` — one asyncio task per **enabled** feed (started/stopped by lifespan and by the settings write path, like the AIS watchdog), honouring `refreshSeconds`, backing off on errors, writing snapshots through `backend/cache.py` (fresh TTL = refresh, stale window = 30 min, `X-Cache` header on reads). Never fetch on request path. Each adapter declares a **minimum interval** the poller enforces regardless of config: National Highways is 10 calls/min per key across *all* its products, so with two datasets the floor is ~15 s and the seeded default is 120 s; Street Manager reuses its 1-hour ID token and refreshes with the refresh token rather than re-authenticating every poll.
- Image proxy — `/api/land/feeds/{id}/image/{ref}` injects the credential server-side, caches bytes for ~20 s, sets `Cache-Control: no-store` to the browser and **never returns the upstream URL** (UTMC image URLs are Basic-auth'd; Windy URLs carry short-lived tokens). A sibling `/{id}/clip/{ref}` streams the JamCam MP4 (≈115 KB, `video/mp4`, cached for the feed's refresh) so the popup can loop it.

New router `backend/routers/land_feeds.py` under `/api/land/feeds` (separate from `routers/land.py` per the one-router-per-resource rule):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Feed list + runtime status (`lastFetchAt`, `lastError`, `featureCount`) — never credentials |
| GET | `/{id}/features` | Latest normalised snapshot (GeoJSON per kind), `X-Cache` |
| GET | `/{id}/image/{ref}` | Camera/webcam image proxy |
| GET/PUT/DELETE | `/{id}/credentials` | `{configured: bool}` / set / clear — the AIS-key pattern |
| POST | `/{id}/test` | Probe with the stored credential; returns `{ok, message, sampleCount}` |

Feed CRUD itself goes through the existing generic `PUT /api/settings/land/feeds` (the whole list, as `sdr.radios` does) — but the settings router must run `FeedConfig` validation on that key (add a `_validated_feeds()` next to `_validated_location()`), and the poller must resync on write.

Security notes: provider allow-list stops SSRF-by-config (`url` is only used as a *base* the adapter appends known paths to; `snapshot` provider requires https and blocks private/link-local ranges); per-feed upstream rate limiting via `services/upstream_rate_limit.py`; errors returned to the UI are sanitised (`lastError` is a short code + message, no upstream body).

## 5. Frontend design

- **Store** `stores/landFeeds.ts` — feed list (from settings), per-feed runtime status, per-feed snapshots, polling on the SPA side at `refreshSeconds` (min 15 s) only while the Land view is mounted and the relevant layer is on.
- **Settings › LAND** — new group `LIVE FEEDS` in `SettingsPanel.vue`, composed from small components in `components/shared/settings/`, cloned from the SDR devices trio:
  - `LandFeedsControl.vue` (list + "ADD FEED", empty state)
  - `LandFeedRow.vue` (name, category chip, provider, enabled toggle, status dot via `SdrSourceStatusDot`-style base, edit/delete with confirm)
  - `LandFeedForm.vue` (provider dropdown drives which fields render — datasets multi-select, bbox, header name; write-only credential field with a "configured" indicator and CLEAR, reusing the `SeaAisKeyControl` behaviour; TEST button calls `/test`)
  - Staged save via `useStagedSetting` + APPLY, matching the Sea Map Layers change on this branch.
- **Density** — 890 London cameras (and ~360 UTMC) is too many DOM markers at low zoom: below zoom ~11 the camera control switches to the APRS-style **count markers** (`APRS_COUNT_FILL` / ring) per grid cell and expands to individual markers as you zoom in; the sidebar list is bbox-filtered to the viewport.
- **Map** — one MapLibre `IControl` per layer under `components/land/controls/`: `traffic-cameras/TrafficCamerasControl.ts`, `traffic-events/TrafficEventsControl.ts` (incidents + events + roadworks + VMS + car parks as sub-layers), `webcams/WebcamsControl.ts`, all extending `SentinelControlBase` (see `maplibre-control` skill). GeoJSON `setData` throttled to ≤1/s and only when `source.loaded()` (the AIS lesson). Camera popup: `<img>` from the proxy with `alt`, timestamp, STALE badge, refresh while open; Windy popup carries the mandatory "View on Windy" link and attribution.
- **Sidebar** — `LandFilter` gains a feeds section listing features by kind with the same list↔map parity pattern as APRS.
- **Layers** — `land.defaultLayers` grows `trafficCameras`, `trafficEvents`, `roadworks`, `webcams`; Map Layers in Settings and the rail toggles cover all of them.
- **Accessibility** — every camera image has an accessible name (camera description + time), layer toggles are real buttons with `aria-pressed`, popup is focus-managed, a data-table equivalent of each layer lives in the sidebar list.

## 5a. Visual spec — cameras on the map (app tokens only)

Sentinel's Land map is **monochrome by rule** (`frontend/vue/src/constants/aprs.ts`: Air uses colour to carry meaning; Land stays white-on-charcoal so colour stays meaningful). Cameras follow that — no amber, no accent fill. Everything below is an existing token or a literal already used by a sibling control.

| Element | Value | Where it already lives |
|---------|-------|------------------------|
| Marker glyph | 12×12 white camera outline (`#ffffff`, 1.4 px stroke), inside a 20×20 pill filled `#15171d` | `APRS_BADGE_BACKGROUND` / `APRS_ACCENT_COLOR`; same chip the APRS symbol uses |
| Marker label | `'Barlow Condensed'` 10 px 700, `letter-spacing:.08em`, uppercase, `#fff`; second line (view description) 400 weight at `opacity:.7` | identical `cssText` to `PortsControl._buildMarker` / airports |
| Anchor | `anchor:'top-left'`, `offset:[8,-6]` (label sits right of the pin) | `PortsControl` |
| State: live | glyph + pill at full opacity | — |
| State: stale (image older than 2× refresh) | whole marker `opacity:.45` | same dimming as an APRS station past its retention |
| State: offline (night blackout / operator control / feed down) | pill fill `#26292e` (`--color-button-bg`), glyph and label at `.35` — no outline, flat | rail button grey; `MapSidebar` disabled-row `.35` |
| Popup surface | `rgba(21,23,29,.98)`, square corners, **no border** — the surface change against the map is the edge | `#map-sidebar` surface; Settings design language (flat, square) |
| Popup title | `var(--font-condensed)` 10 px 700 `.08em` uppercase `#fff` | sidebar section titles (9–10 px Condensed) |
| Popup body / meta | `var(--font-primary)` 13 px `rgba(255,255,255,.82)`; secondary 9–10 px `var(--color-text-muted)` `rgba(255,255,255,.75)` | `LandFilter` row text (13 px / .82) and 9 px meta |
| Status chip | LIVE = white text on `#26292e` (`--color-button-bg`); STALE / NIGHT / OPERATOR = `rgba(255,255,255,.6)` text on `rgba(0,0,0,.32)` (`--color-search-field-bg`) — fills only, no outlines | rail button fill; search-field scrim; `createAccentBadge` |
| Clip (JamCams) | same box as the image; `<video muted loop playsinline>` with `prefers-reduced-motion` → still only; a PLAY/STILL toggle in `BaseButton` style | — |
| Image | full popup width, `background:#000` letterbox, `image-rendering:auto`; height from the JPEG's own ratio (4:3 UTMC, 16:9 Durham + JamCams, 11:9 Tyne Tunnel) | — |
| Buttons | `BaseButton` (`#26292e` fill, `#fff` 10 px Condensed uppercase) for OPEN SOURCE / VIEW ON WINDY | `BaseButton.vue` |
| Attribution line | 9 px `rgba(255,255,255,.6)` | sidebar 9 px meta |
| Focus ring | `2px solid var(--color-accent)` (`#c8ff00`) — the one place accent appears, and only on keyboard focus | `a11y.css` |

**No borders or outlines anywhere** — pills, chips, popup and image are distinguished by fill steps alone (`#000` → `rgba(0,0,0,.32)` scrim → `#15171d` → `#26292e`), the same way the sidebar and rail are. The only stroke is the keyboard focus ring.

Events (P1+) keep the same monochrome language with different glyphs (▲ incident, ▮ roadworks barrier, ▭ VMS); congestion (SCOOT) is the exception and may use the same greyscale ramp as range rings, still no hue.

## 6. Phases (one PR each, branch off `main`)

| Phase | Branch | Delivers | Needs from user |
|-------|--------|----------|-----------------|
| P0 | `feat/land-feeds-config` | `land.feeds` schema + seed, validation in settings router, credential rows + prefix redaction, `/api/land/feeds` list/credentials/test, Settings LIVE FEEDS UI, `snapshot` + **`durham`** + **`tfl-jamcams`** adapters, poller, image + clip proxy, Traffic Cameras map control with count-marker clustering — **~920 live cameras (Durham + London) with no accounts** | Confirm reuse terms with Durham CC (email; can proceed in parallel) |
| P1 | `feat/land-feeds-utmc` | UTMC adapter (cameras + events/incidents/roadworks + SCOOT + VMS), Traffic Events map control, sidebar lists, night/operator states, Durham↔UTMC dedupe | A **netraveldata.co.uk** account (free) |
| P2 | `feat/land-feeds-national-highways` | National Highways closures + VMS adapter; Street Manager roadworks (GeoJSON + BNG reprojection) | NH developer-portal key; Street Manager open-data account |
| P3 | `feat/land-feeds-webcams` | Windy adapter + Webcams control, attribution/link rules | Windy API key |
| P4 (optional) | `feat/land-feeds-flow` | TomTom flow/incidents for Northumberland + Tees Valley; DATEX II ingest if an NTIS subscription is granted; BODS buses | TomTom key; NTIS approval |

Each phase: tests written at commit time on confirmation (global rule); run
`npm run test:e2e` before pushing — new layers/rail toggles change
`land`/shell spec expectations, and `mockApi` needs `/api/land/feeds` stubs
or the Land view will show the no-data overlay.

## 7. Decisions (taken — say so if you want any reversed)

1. **Feed list lives in the `land` namespace.** It's a Land map feature; config export/upload stays one coherent document and `land.defaultLayers` sits beside it.
2. **Seed the two NE feeds disabled with no credentials.** A fresh install shows exactly what to fill in; nothing polls until a credential is saved and the feed is enabled.
3. **TomTom stays optional (P4).** Closures (National Highways) + roadworks (Street Manager) already cover Northumberland / Tees Valley; the free 20K/month TomTom budget is ~1 flow poll per 2 min, which only justifies itself if live congestion there is actually wanted.
4. **Pure-Python Helmert for BNG→WGS84.** ±5 m is fine for roadworks pins and avoids adding `pyproj` (+~10 MB) to the image; swap in `pyproj` later if anything needs sub-metre accuracy.

## 8. Verification log (2026-09-14)

| Claim | How verified | Result |
|-------|--------------|--------|
| UTMC service live, Basic auth | `GET https://www.netraveldata.co.uk/api/v2/cctv/static` unauthenticated | **401** — live, auth enforced |
| UTMC dataset list + endpoints | API spec PDF v2019 (`/api/v2/{carpark,cctv,scoot,vms,journeytime,…}/{static,dynamic}`, `/cctv/images/:file`, events/incidents/roadworks) + CCTV page | Confirmed; OGL 3.0 on the Licence page |
| National Highways API host / header / path | `GET https://api.data.nationalhighways.co.uk/roads/v2.0/closures` with `Ocp-Apim-Subscription-Key: x` | **401 `Invalid Subscription Key`** — host, header and path real; key is self-serve via Subscriptions; 10 calls/min per key (FAQ); terms page: OGL-based, attribution line required |
| National Highways CCTV API | Petition 657108 (rejected 20 Feb 2024), NH CCTV services page (VIH / media partners only) | **None exists** — unchanged |
| Traffic England closure | NH FAQ / search | Closes **30 Jun 2026**; raw data via "NTIS Transformed Solution" |
| Street Manager open data | DfT docs v6.0: `POST /authenticate` (ID token 1 h, refresh 1 day), GeoJSON API, EPSG:27700, per-IP 429s; onboarding form on GOV.UK | Confirmed |
| Windy Webcams v3 | Docs + Terms pages | Header, bbox filter, 10-min tokens, link-back + courtesy line confirmed; **free-tier quota not published — *unverified*** |
| TomTom free tier | docs.tomtom.com/pricing | **20K/month** Flow Segment Data, no card (earlier "2,500/day" figure was stale); basemap/attribution terms **unverified** |
| Newcastle Urban Observatory cameras | `api/v2.0a/sensors/entity?metric=Camera image` + one timeseries | 401 entities, broker `active: false`, empty positions — **dead** |
| Tees Valley UTMC open data | Search (TVCA UTMC pages, digital-twin report) | No public API found — **gap stands** |
| TfL JamCams | `GET api.tfl.gov.uk/Place/Type/JamCam` anonymous → 890 features (847 available), lat/lon + `imageUrl`/`videoUrl`/`view`; image + mp4 HEAD → 200, `Last-Modified` ≈ now; TfL forum: 50 req/min anonymous, 500 with `app_key` | **Live, no auth** — attribution wording "Powered by TfL Open Data" is TfL's standard line; confirm on the open-data T&Cs page when registering |
| Durham CC cameras | ArcGIS `…/MapServer/30/query?returnCountOnly=true` → 33; `…/query?outSR=4326` → lat/lon + `Cam_Link`; `dcc.ussgroup.co.uk/images/dutmc_24.jpg` → `image/jpeg`, `Last-Modified` ≈ now | **Live, no auth** — licence unstated |
| netrafficcams.co.uk | Fetched with a browser UA (403 otherwise); image ids `dutmc_*`/`VAISALACCTV*`; footer credit T&W UTMC; no API/terms | **Rehost of UTMC** — not a source |
| uktraffic.live | Homepage credits (NH 2,600, TfL, TS, TW, TWNI); no API | **Rehost** — not a source |
| trafficwatchni.com | Camera index, static pages, Crown copyright | **Out of area** |
