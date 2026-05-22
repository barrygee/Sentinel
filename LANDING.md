# Sentinel — Landing Page Content

A copy-and-paste content kit for the Sentinel promotional landing page. Screenshot
placeholders mark where the AIR, SPACE, and SDR captures should be dropped in.

---

## Hero

### Headline
**One screen. Every signal in the sky.**

### Sub-headline
Sentinel is a real-time, multi-domain surveillance dashboard that tracks aircraft,
satellites, and the radio spectrum on a single interactive map — built to keep
working even when the internet doesn't.

### Primary call to action
`Launch Sentinel`  ·  `View on GitHub`

> _[Screenshot: AIR view — full-bleed hero background]_

---

## The one-line pitch

Sentinel unifies live ADS-B aircraft tracking, SGP4 satellite propagation, and
software-defined radio into one dark-themed operations console — with an
offline-first architecture that fails over automatically when connectivity drops.

---

## Why Sentinel

| | |
|---|---|
| 🛰️ **Multi-domain** | Air, Space, and SDR in one console — switch domains without losing your place. |
| 🔌 **Offline-first** | Every domain has online *and* offline data sources. Lose connectivity and Sentinel fails over automatically — it probes the network every 2 seconds. |
| ⚡ **Real-time** | Live aircraft positions, live satellite ground tracks, and a live RF waterfall — all streaming, all the time. |
| 🗺️ **Offline maps** | Vector map tiles (PMTiles) render with zero network access — global overview plus street-level detail for your region. |
| 🎛️ **Operator-grade UI** | A focused dark interface with side rails, overlay toggles, and detail panels designed for sustained monitoring. |
| 🐳 **Deploy in one command** | `docker compose up` and you're live. SQLite persistence, no external database to manage. |

---

## Feature sections

### ✈️ AIR — Live Aircraft Tracking

> _[Screenshot: AIR section]_

Watch the skies in real time. Sentinel streams live ADS-B data and renders every
aircraft as an icon on an interactive map. Click any aircraft for callsign,
altitude, speed, and heading, then add it to a persistent tracking list that
survives across sessions.

**Highlights**
- Live ADS-B aircraft positions with a write-through cache for smooth, low-latency updates
- Click-through detail panels — callsign, altitude, speed, heading
- Persistent tracking list and "follow" mode for individual aircraft
- Rich map overlays: military bases, airports, range rings, roads, AWACS and overhead-alert zones
- Ground vehicles, towers, and callsign labels — toggle exactly what you want to see
- Emergency and special-squawk notifications surfaced in a dedicated alerts panel
- Flight history and multi-aircraft replay

### 🛰️ SPACE — Satellite Tracking

> _[Screenshot: SPACE section]_

Track the orbital domain with real SGP4 propagation from Two-Line Element data.
The ISS is followed by default — add any satellite by NORAD ID and watch its
ground track and visibility footprint update live.

**Highlights**
- Accurate SGP4 orbital propagation from live Celestrak TLE feeds
- Ground tracks (±2 orbits) and visibility footprints rendered on the map
- Pass prediction — know when a satellite is overhead your location
- A day/night terminator overlay rendered across the globe
- Full TLE database management — fetch by URL, upload `.txt` files, categorise satellites
- Satellite categories: space stations, weather, navigation, military, science, cubesats, amateur, and more
- Globe projection with an animated starfield backdrop

### 📡 SDR — Software-Defined Radio

> _[Screenshot: SDR section]_

Bring the radio spectrum into the same console. Sentinel connects to `rtl_tcp`
software-defined radios over the network and streams a live spectrum waterfall
straight to the browser — tune, listen, and record without leaving the page.

**Highlights**
- Live spectrum waterfall streamed over WebSocket from networked SDR hardware
- Tune by frequency, switch demodulation modes, and adjust gain and squelch in real time
- Manage multiple radios — connect, disconnect, and monitor status per device
- Save and organise frequencies into colour-coded groups with notes and scan flags
- Built-in band-plan and known-frequency overlays for fast orientation
- One-touch recording — capture audio to WAV plus optional raw IQ for later analysis
- A CLIPS library to browse, rename, download, and manage every recording

---

## How it works

```
        Browser  ◀──────────  nginx  ◀──────────  FastAPI (uvicorn)
   Vue 3 SPA          reverse proxy          ┌─ AIR    → ADS-B proxy + cache
   MapLibre GL                               ├─ SPACE  → SGP4 + TLE management
   Live WebSockets                           └─ SDR    → rtl_tcp WebSocket bridge
                                                          │
                                              SQLite (settings, cache, recordings)
```

- **Frontend** — a Vue 3 single-page app with MapLibre GL maps and live WebSocket streams
- **Backend** — a Python 3.12 / FastAPI service with async SQLAlchemy
- **Storage** — SQLite; nothing external to provision
- **Maps** — MapLibre GL with PMTiles vector archives for true offline rendering

---

## Built for the field

Sentinel's offline-first design is its defining feature. Every domain carries
two data-source slots — one online, one offline — and a global connectivity mode
chooses between them. A background probe checks the network every 2 seconds, so
when the connection drops Sentinel switches to local sources and offline map
tiles automatically. No manual intervention, no blank screens.

---

## Tech at a glance

| Layer | Technology |
|---|---|
| Frontend | Vue 3, TypeScript, Vite SPA |
| Maps | MapLibre GL JS, PMTiles offline vector tiles |
| Backend | Python 3.12, FastAPI, async SQLAlchemy |
| Database | SQLite |
| Satellites | SGP4 propagation, Celestrak TLE feeds |
| Radio | rtl_tcp SDR bridge over WebSocket |
| Deployment | Docker Compose, nginx reverse proxy |

---

## Closing call to action

### Headline
**See everything. Miss nothing.**

### Sub-headline
Air, space, and spectrum — unified, real-time, and ready to run offline.

### Buttons
`Get Started`  ·  `Read the Docs`
