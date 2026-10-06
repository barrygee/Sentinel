# Server-side ADS-B squawk alerts

Status: built (2026-10-06). Backlog item #22 of the ham/prepper ideas list.

## Problem

Emergency squawk alerts (7700 / 7600 / 7500, and "squawk cleared") are computed in the browser, in
`AdsbLiveControl`. An emergency is only noticed while someone has the Air page open, and every open
browser raises its own copy.

## Decisions (owner, 2026-10-06)

| Question | Decision |
|---|---|
| What area does the server watch? | Off grid: the receiver's own aircraft (centred on the receiver, as the map already is). Online: a fixed radius around Settings › App › Location; with no location set the online watcher stays idle. |
| How does an open browser get server alerts? | Push: a Server-Sent Events stream, `GET /api/air/messages/stream`. |
| Who raises squawk alerts? | The server only. The browser keeps the red map highlighting but no longer raises squawk alerts. |

## Design

```
 browser poll ─► Air router ─┐                       ┌─► core notifications ─► DB + SSE ─► browsers
                              ├─► SquawkTracker ─► bus: air.squawk.changed ─► Air: notifications.raise
 watcher (idle-only fetch) ──┘
```

1. **`SquawkTracker`** (`backend/services/adsb_squawk.py`, Air). It is given every aircraft snapshot
   Air fetches and compares each aircraft's squawk with the last one seen. A change to or from an
   emergency code publishes `air.squawk.changed` on the bus with `{hex, callsign, squawk, previous,
   alt_baro, gs, lat, lon, ts}`. The rules match the browser's today:
   - The first sighting of an aircraft already squawking an emergency is a change.
   - The first sighting with a normal squawk is not.
   - An aircraft missing from one snapshot keeps its last squawk, because snapshots cover different
     areas. It is forgotten only after 10 minutes unseen, so a returning aircraft doesn't alert twice.
2. **Feeding the tracker without extra upstream traffic.** The Air router hands every successful
   upstream fetch to the tracker. A background watcher (Air's new lifecycle) fetches on its own only
   when nothing has fed the tracker for `adsb_watch_idle_s`, i.e. when no browser is polling. It uses
   the same `fetch_aircraft` call, so the per-host rate limiter still applies.
3. **Bus subjects.**
   - `air.squawk.changed`: the domain event, for any section that cares.
   - `notifications.raise`: a generic "store this alert and push it" request with `{msg_id, type,
     title, detail, ts, hex}`. Air subscribes to its own `air.squawk.changed` and raises the
     notification. Core subscribes to `notifications.raise`, so core never learns about squawks and
     any section can raise a server-side alert the same way later (e.g. Sea AIS-SART, backlog #2).
4. **Core notifications.**
   - `air_messages` gains a nullable `hex` column, so clicking a server alert still flies the map to
     the aircraft (`aircraftNotificationTarget`).
   - `GET` returns `hex`; `POST` accepts it.
   - `GET /api/air/messages/stream` is the SSE stream, sending one `data:` line per raised alert plus
     a keep-alive comment every 15 s.
   - Streams end on SIGTERM through core's `wake` hook; otherwise `--reload` would hang on them, like
     the SDR WebSockets would.
5. **Browser.**
   - The notifications store opens an `EventSource` once (the same place it syncs from the backend).
   - It adds each pushed alert that isn't already present, with sound and the screen-reader
     announcement, but without POSTing it back.
   - `AdsbLiveControl` stops raising squawk alerts.
   - The e2e mock API stubs the stream.
6. **Alert text.** The detail is `SQK 7700 — General Emergency · ALT 12,000 ft · GS 420 kt`. The
   date/time line the browser used to append is dropped, because the card already shows the alert's
   time in the viewer's own time zone; the server's could be UTC.

## Later

The P5.3 Caddy gateway must not buffer `/api/air/messages/stream` (Caddy streams `text/event-stream`
by default; keep it that way).
