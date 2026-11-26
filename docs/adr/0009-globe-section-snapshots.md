# 0009. The globe asks each section for a snapshot over NATS and serves one combined feed

Date: 2026-11-26
Status: accepted

## Context

The optional GLOBE section draws live aircraft, satellites, vessels and APRS stations on a 3D globe. That data already belongs to four sections, and each one applies its own rules before serving it:

- **Air** picks the online feed or the off-grid receiver, keeps a write-through cache with several fallback states, and spends a daily online quota through a per-host rate limiter.
- **Sea** feeds one vessel store from AISStream online or from the SDR decoder off grid, and must never dial AISStream off grid.
- **Land** keeps the APRS stations heard within the operator's retention window.
- **Space** refreshes TLEs from a configured feed with a fallback and a stale window, then propagates them with SGP4.

The globe runs in its own container (ADR 0006), like every section. The owner chose that it has its own backend feed: the browser polls only `/api/globe/...` and never calls `/api/air`, `/api/sea`, `/api/land` or `/api/space` for the globe.

Two constraints shape how the globe gets the data:

- **Services talk to each other over NATS request/reply,** not service-to-service HTTP. Internal HTTP is only for core, the radio hub and sdr-manager-local.
- **No `max_payload` is set,** so a NATS message is limited to the 1 MB default. A worldwide vessel picture is tens of thousands of rows.

## Decision

- **Each owning section answers `<section>.globe.snapshot`:** `air.globe.snapshot` `{lat, lon}`, `sea.globe.snapshot` `{bbox, maxRows}`, `land.globe.snapshot` `{}` and `space.globe.snapshot` `{noradIds, lat, lon}`. The globe service is the only requester. The subjects and limits live in `backend/platform/globe_snapshots.py`, because neither side may import the other.
- **A responder answers from the same service function as the section's own HTTP route.** The route bodies moved into service functions that both call:
  - Air: `sentinel_air.services.adsb_point.aircraft_near_point`
  - Sea: `sentinel_sea.services.vessel_snapshot`
  - Space: `sentinel_space.services.satellite_snapshot`
  - Land: `aprs_store.get_stations`, which was already shared

  So the mode, the cache, the quota, the limiter and the fallback are identical for the map and the globe.
- **Aircraft come from around home, at radius 250.** That is the same centre and radius as Air's alerts service, so the globe is served the cached row Air already holds and spends no extra online call. It counts as an open map for the squawk watcher, as the map does.
- **Rows cross the bus columnar:** one `fields` list, then one array per item, trimmed to a 900 KB budget with a `truncated` flag. Each responder sends only the fields the globe uses. Vessels are limited to the view's bbox and to 5,000 rows, and satellites to 12 per request.
- **Space reports unknown satellites instead of fetching them.** An id Space holds no TLE for is listed in `unknown`, without the upstream fetch the map's endpoint would try, so one bad id can't hold the whole layer past its timeout.
- **The globe serves `GET /api/globe/objects`.** It validates every parameter at the edge, asks only for the layers requested (in parallel, each with its own timeout), and reports a failure **per layer**: `{status: 'unavailable', reason}`. The reasons come from a fixed list, never an internal message. One section being down never fails the response.
- **Each layer has a short TTL cache, with shared in-flight requests:** 10 s for air and sea, 5 s for APRS and space. However many tabs are open, each layer costs one NATS request per interval. Failures are cached too, so a stopped section costs one timeout per interval.
- **The globe's items are typed once,** as Pydantic models in `sentinel_globe/schemas.py`. The globe frontend mirrors them as TypeScript types.

## Consequences

- **Air, Sea, Land and Space now answer requests on NATS** (`answers_requests` plus subscribe on their own subject). After the permissions change, a running deployment needs `docker compose restart nats`.
- **The responders register at import, from each section's `module.py`,** so they are in place in the section's service and in the test app. Core still never imports a section, so it answers none of them.
- **A change to a section's map route now changes the globe too,** which is the point: the shared function is the one place to change. A new field the globe needs must be added to the responder's field list as well as to the globe's model.
- **The globe has no data of its own.** With a section's container stopped, its layer reports `section-unavailable`, and the other layers carry on.
