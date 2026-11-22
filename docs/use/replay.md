# History and replay

Air, Sea, Land and Space can record movement and play it back on their map. Recording keeps up to 7 rolling days and survives restarts. It works online, off grid, and when you switch between the two.

## Turn it on

Recording is off until you turn it on, separately for each section.

1. **Settings › AIR** (or **SEA**, **LAND**, **SPACE**) › **REPLAY** › **History & Replay**.
2. Switch on **Record**.
3. **KEEP**: how many days to keep, 1 to 7. Anything older is deleted every hour.
4. **APPLY CHANGES**.

The line under the switch shows what is stored: days kept, how much space the history takes, and the size of the section's whole database beside it (Air's also holds its ADS-B cache, so it is larger than the history alone).

## What is recorded

| Section | Recorded | Sources |
|---|---|---|
| Air | Aircraft positions, callsign, altitude, speed, squawk | The online feed and the off-grid ADS-B receiver |
| Sea | Vessel positions, name, type, speed, course | AISStream and the off-grid AIS decoder |
| Land | APRS station fixes, symbol, comment | The APRS decoder |
| Space | Each version of a satellite's orbit (TLE) | Every TLE source |

Space stores no positions. A replayed moment is recalculated from the orbit that applied then, so every moment can be replayed, not just recorded ones.

Each point is tagged with the source that heard it. An aircraft or vessel heard by both sources keeps one track across a switch between online and off grid.

**Air online:** Air records only what it already fetches, so recording costs none of the online feed's daily limit. With no browser open, Air fetches only every few minutes, so online history has gaps while nobody is watching. Off grid, Air records every 10 seconds with or without a browser.

## Replay

1. Open the left side panel's **REPLAY** tab (the clock with a back-arrow). It appears only while that section records.
2. The panel says **LIVE** until you go back in time. Any of these starts replay:
   - **Drag the TIMELINE** back. The shaded parts hold recorded data: lime for online, yellow for off grid. The readout beside it says which (**ONLINE**, **OFF GRID** or **NO DATA**). From the keyboard: arrows move a second, **Page Up / Page Down** an hour, **Home / End** to either end.
   - **Back / forward** steps a minute.
   - **Play** starts an hour back and plays; press again to pause.
   - **GO TO (UTC)**: type a date and time, then **GO**.
3. **SPEED**: 1×, 10×, 60× or 300×.
4. **LIVE**, or playing into the present, returns to the live map.

Replay keeps playing with the side panel closed. Times are UTC.

Everything else on the map keeps working while you replay: filters, search, selecting and labelling, trails, tracking, range rings and layers. Each section replays on its own, so replaying Air leaves Sea live. Alerts keep coming from live data, never from the replay.

Replay reads only the Sentinel computer's own database. It works with no internet connection.

## Disk space

Air and Sea use the most. As a rough guide, 7 days of a busy area takes a few hundred MB per section. Land and Space take very little. On a Raspberry Pi, watch the history size under **History & Replay** and lower **KEEP** if needed.

## The computer's clock

Points are stamped with the Sentinel computer's clock. An off-grid computer with no time source can drift, then jump when it next goes online; Sentinel logs a warning when the clock goes back. Keep the clock right (a GPS time source, or set it by hand) for history that lines up.
