# 0005. Sea domain: live vessel tracking via AISStream

Date: 2026-09-12
Status: accepted

## Context

The Sea domain had been routing/settings scaffolding with an empty map. The
brief was to replicate the ship-tracking approach of
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) inside
Sentinel's existing structure and visual language, with the data source
configurable from Settings › SEA and a map that matches the Air and Space maps.

God's Eye View tracks ships with **AISStream.io** — a free, keyed AIS WebSocket
push feed that allows one connection per key and has no browser CORS — proxied
through a server-side module that keeps one long-lived socket, an in-memory
per-MMSI vessel store (30-minute retention, 50 000 cap, static-data merge,
thinned per-vessel track ring buffers) and a REST snapshot the client polls
every 60 s, with dead reckoning between polls and a slow reconnect watchdog.

## Decision

Build the Sea domain on the same model, translated into Sentinel's own
patterns rather than ported verbatim:

- **Backend feed, REST snapshot, polled map** — the Land/APRS delivery model.
  `backend/services/ais_stream.py` owns the single AISStream socket and its
  watchdog; `backend/services/ais_store.py` owns the vessel picture;
  `backend/routers/sea.py` serves `GET /api/sea/vessels` (viewport `bbox`,
  newest first, feed status attached), `/vessels/{mmsi}/track` and `/status`.
- **Watchdog cadence is deliberately asymmetric**: silence is *reported* after
  2 min so the map is honest, but the socket is only *recycled* at 2.5× that,
  and failures walk a 5 s → 15 s → 60 s → 5 min ladder before a 15-min DOWN
  cadence; a rejected key is probed hourly until the key changes. A reconnect
  storm is how the one-connection-per-key limit locks a feed out.
- **In-memory primary store, SQLite snapshot** — the AIS message rate rules out
  a write per message, but Sentinel is offline-capable, so the store is
  snapshotted to `sea_vessel_cache` every 30 s and reloaded on start, served
  as `X-Cache: STALE` until the feed is live again.
- **The key is a secret.** It lives in `.env` (`AISSTREAM_API_KEY`) or, taking
  precedence, in `user_settings` written only through `PUT /api/sea/ais-key`.
  The generic settings router redacts it on read, refuses it on write and
  skips it on config upload (`_SECRET_SETTING_KEYS`), so it never appears in
  an exported config.
- **Frontend mirrors Air**: `SeaMap.vue` (same style, connectivity restyle,
  shared controls), `SeaSideMenu.vue` (IconRail: zoom, locate, FILTER
  accordion of vessel families, MAP LAYERS accordion), `SeaFilter.vue` in the
  sidebar FILTER pane as the map's accessible data list, and
  `AisVesselsControl` extending `SentinelControlBase` — a MapLibre symbol
  layer of family-tinted hull chevrons, dead-reckoned at 1 Hz, Sentinel's
  shared label pills above zoom 9, bracket + recent-track on select.
- **Poll at 10 s, not 60 s**: the backend store is live, so a poll always has
  a chance of new fixes, and it matches the ADS-B cadence users already know.
  Every request carries the padded viewport bbox; a worldwide snapshot is
  tens of thousands of rows.
- **Colour by family** follows the source project's palette (tanker amber,
  cargo cyan, passenger pink, fishing green, service yellow) except military
  and SAR, which take Sentinel's `#c8ff00` so that lime means the same thing
  on every map.

## Consequences

- Live vessels need a free AISStream key. Without one the Sea map shows a
  notice with a shortcut to Settings › SEA; with one, terrestrial AIS coverage
  is coastal — mid-ocean is quiet by nature of the feed.
- Running two Sentinel backends (Docker and a local `--reload`) against the
  same key makes them fight for the connection; the slow ladder keeps that
  survivable but the README says not to.
- A worldwide subscription is hundreds of messages a second of JSON parsing
  in the Python process. Settings › SEA › Coverage Area limits it; the
  default stays worldwide for parity with the source project.
- `AisVesselsControl` pushes GeoJSON at most once a second and only when the
  source reports `loaded()`. A 250 ms cadence starved MapLibre's single
  worker so the base map never painted — keep the guard.
- The Off Grid slot (NMEA AIVDM over TCP/UDP from `rtl_ais` / AIS-catcher,
  decoded with `pyais` into the same store) is the planned follow-up; the
  reader reports `unsupported-source` for a non-`wss://` URL until then.
