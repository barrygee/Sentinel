# Land live feeds — P0 contract (backend ⇄ frontend seam)

Companion to `land-live-feeds.md` §3–§5a. Both engineers build against this
exactly; anything not covered here is an open question, not a guess.

## Feed config item (`land.feeds[]`, stored via the generic settings router)

```jsonc
{
  "id": "durham-cc",                 // ^[a-z0-9][a-z0-9-]{1,39}$ ; unique ; immutable
  "name": "Durham County Council",   // 1–60 chars
  "category": "traffic-cameras",     // "traffic-cameras" | "traffic-data" | "webcams"
  "provider": "durham",              // "snapshot" | "durham" | "tfl-jamcams"   (P0 allow-list)
  "url": "https://spatial.durham.gov.uk/arcgis/rest/services/External/VectorPoint/MapServer/30",
  "enabled": false,
  "refreshSeconds": 60,              // int, clamped 15–3600; adapter may enforce a higher floor
  "datasets": ["cameras"],           // provider-specific; may be []
  "bbox": null,                      // null | [[minLon,minLat],[maxLon,maxLat]]
  "location": null,                  // snapshot only: {"latitude": 54.9, "longitude": -1.6} (required for snapshot)
  "auth": { "type": "none" }         // {type:"none"} | {type:"basic"} | {type:"apiKey", headerName?: str, queryParam?: str, optional?: bool}
}
```

Seeded (all `enabled: false`) in `backend/default_config.json` → `land.feeds`:
`durham-cc` (provider durham, url above, refresh 60), `tfl-jamcams` (provider
tfl-jamcams, url `https://api.tfl.gov.uk`, refresh 300, auth
`{type:"apiKey", queryParam:"app_key", optional:true}`). `land.defaultLayers`
gains `"trafficCameras"`.

Credentials are **never** in the item. They live in `user_settings` as
`namespace="land"`, `key="feedCredential:<id>"`, JSON value
`{"username":…,"password":…}` or `{"apiKey":…}`; the settings router treats any
`("land", "feedCredential:*")` key as secret (redact on read, refuse on write,
skip on upload/export).

## Endpoints (`backend/routers/land_feeds.py`, prefix `/api/land/feeds`)

| Method | Path | Response |
|---|---|---|
| GET | `/` | `{"feeds": [FeedWithStatus]}` — `FeedWithStatus = config item + "status": {"lastFetchAt": ms\|null, "lastError": str\|null, "featureCount": int, "credentialConfigured": bool, "running": bool}` |
| GET | `/{id}/features` | GeoJSON `FeatureCollection` (below). Header `X-Cache: HIT\|STALE\|MISS`. Empty collection if the feed is disabled or hasn't fetched yet. 404 unknown id. |
| GET | `/{id}/image/{ref}` | image bytes (`Content-Type` from upstream, `Cache-Control: no-store`). 404 unknown id/ref, 502 upstream failure, 503 if the camera is offline (night / unavailable). |
| GET | `/{id}/clip/{ref}` | `video/mp4` bytes, same rules. Only providers that expose clips (tfl-jamcams). 404 otherwise. |
| GET | `/{id}/credentials` | `{"configured": bool}` |
| PUT | `/{id}/credentials` | body `{"username"?: str, "password"?: str, "apiKey"?: str}` (shape must match `auth.type`; 400 otherwise) → `{"configured": true}` |
| DELETE | `/{id}/credentials` | → `{"configured": false}` |
| POST | `/{id}/test` | `{"ok": bool, "message": str, "featureCount": int}` — probes with the stored credential; never echoes upstream bodies or secrets |

`ref` is an opaque, provider-issued token that the adapter maps back to the
upstream URL (**never** the upstream URL itself, and never user-controlled
beyond `^[A-Za-z0-9._-]{1,80}$`).

Feed list CRUD stays on the generic `PUT /api/settings/land/feeds` (whole
list). The settings router validates it with the schema above (400 on any
violation, including duplicate ids) and the poller resyncs after a write.

## Feature (GeoJSON) — the one shape the map consumes

```jsonc
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [lon, lat] },
  "properties": {
    "kind": "camera",                       // P0 emits only "camera"
    "id": "durham-cc:dutmc_24",             // "<feedId>:<providerId>", unique across feeds
    "name": "Framwellgate Peth",
    "description": "View towards the City Centre",   // may be ""
    "view": "West",                         // may be null (TfL gives it, Durham gives Camera_Vie)
    "updatedAt": "2026-09-14T19:29:11Z",    // ISO 8601 UTC or null
    "state": "live",                        // "live" | "stale" | "offline"
    "imageUrl": "/api/land/feeds/durham-cc/image/dutmc_24",   // relative, proxied
    "clipUrl": null,                        // or "/api/land/feeds/tfl-jamcams/clip/00002.00865"
    "externalUrl": "https://www.durham.gov.uk/article/6134",  // or null
    "sourceId": "durham-cc",
    "sourceName": "Durham County Council",
    "attribution": "Contains public sector information licensed under the OGL v3.0"
  }
}
```

State rules (backend decides, frontend only renders): `live` = image newer than
2× `refreshSeconds`; `stale` = older than that but the feed is reachable;
`offline` = provider says unavailable (TfL `available:false`, Durham
`Status != "Live"`) or the image fetch failed twice in a row.

## Frontend surfaces (for the frontend-engineer)

- Pinia `stores/landFeeds.ts`: `feeds` (from `GET /api/land/feeds`), `featuresByFeed`, `refresh(feedId)`, `startPolling()/stopPolling()` (only while the Land view is mounted and the layer is on), `saveFeeds(list)` → `PUT /api/settings/land/feeds`, `credentials(id).get/set/clear`, `test(id)`.
- Settings › LAND › group **LIVE FEEDS**: `LandFeedsControl` (list + ADD FEED + empty state) composed of `LandFeedRow` and `LandFeedForm`, cloned from `SdrDevicesControl` / `SdrRadioRow` / `SdrDeviceForm`; credential field is write-only with a "configured" indicator + CLEAR (`SeaAisKeyControl` behaviour); TEST button; staged save with APPLY via `useStagedSetting`.
- Map: `components/land/controls/traffic-cameras/TrafficCamerasControl.ts` on `SentinelControlBase`, DOM markers built exactly like `PortsControl._buildMarker` (see plan §5a for every colour/size), count markers below zoom 11, popup per §5a (still, optional clip, state chip, meta, OPEN SOURCE, attribution). Visibility via a `trafficCameras` flag in the land store, honouring `land.defaultLayers`, rail toggle, Map Layers.
- `LandFilter` gains a **CAMERAS** section listing features in the viewport (list↔map parity as APRS).
- e2e `mockApi` stubs for `/api/land/feeds*` so the Land view doesn't show the no-data overlay.
