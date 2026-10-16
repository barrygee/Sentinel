# Air: aircraft (ADS-B)

This page shows you how to watch aircraft near you, get alerts about them, and run Air with your own radio.

## What it's for

The **AIR** section shows aircraft near you on a live map. Most aircraft broadcast their position, height, speed and identity every second over a radio system called **ADS-B**. Use Air to:

- watch local air traffic, civil and military;
- get an alert when an aircraft declares an emergency, even when no browser has Sentinel open;
- get an alert when an aircraft flies over a place you care about;
- look up an airport and listen to its radio frequencies.

Online, the aircraft come from [adsb.lol](https://adsb.lol), a free community feed. Off grid, they come from your own radio.

## Start it

Air starts with the rest of Sentinel. To run it on its own:

```bash
docker compose up -d gateway air
```

## Before you start

- **Online:** an internet connection. Nothing else.
- **Off grid:** a radio on a Sentry host, an antenna for 1090 MHz, and the ADS-B decoder. See [Off grid](#off-grid).
- For alerts and range rings, set **Settings › App Settings › Sentinel Location** ([Quick start](../install.md#first-things-to-set)).

## Using it

### Watch local traffic

Open **AIR**. Sentinel shows the aircraft within about 250 nautical miles of the middle of the map, updated every few seconds. Move the map to look somewhere else.

Select an aircraft to see its **POSITION** (height, speed, heading, climb or descent) and **IDENTIFICATION** (type, registration, category and squawk code). From the details you can:

- **Track aircraft**: keep the map centred on it as it moves. It also appears under **TRACKING** in the sidebar.
- **Enable alerts**: get an alert when it lands or takes off.
- **Centre on map**: move the map to it once.

If an aircraft stops reporting, its details say **SIGNAL LOST**.

![An aircraft's details in the FILTER pane: POSITION and IDENTIFICATION, squawk 7700, and the track, alert and centre buttons beneath. The aircraft is highlighted in red on the map.](../images/air-aircraft-details.png)

### Find an aircraft, airport or base

Open **FILTER** in the sidebar and type a callsign, an ICAO address (the aircraft's unique code) or a squawk code. The buttons under **FILTER** choose what the map and list show: **ALL AIRCRAFT**, **CIVIL AIRCRAFT**, **MILITARY AIRCRAFT**, **AIRPORTS** or **MILITARY BASES**.

### Listen to an airport

Select an airport. Its details list its **FREQUENCIES** (tower, approach and so on). Select one to tune your radio to it in AM, ready to listen. You need a radio set up in the SDR section; see [Add a radio](sdr/add-a-radio.md).

### Get alerted to emergencies

Aircraft in trouble set their transponder to an emergency **squawk** code:

| Code | Meaning |
|---|---|
| 7700 | General emergency |
| 7600 | Radio failure |
| 7500 | Hijacking or unlawful interference |

Sentinel raises an alert for every aircraft that sets one of these codes, and highlights the aircraft on the map. It keeps checking when no browser has the AIR map open: every 20 seconds it looks for emergencies within 250 nautical miles of your **Sentinel Location** (off grid, of your receiver). The alert waits for you under **ALERTS**. [Get alerted to aircraft emergencies](../tasks/aircraft-emergency-alerts.md) sets this up from start to finish.

### Get alerted to aircraft overhead

**Settings › AIR › Overhead Aircraft Alerts** alerts you when an aircraft comes within a distance of a place: your **Sentinel Location** or any Sentry host's location. Choose civil aircraft, military aircraft or both for each place.

### Map layers

The map controls on the right turn layers on and off: **RANGE RING** (distance circles around your location), **A2A REFUELING** (air-to-air refuelling areas), **AWACS** (surveillance aircraft orbits) and **TERRAIN** (hills and contours). **MAP LAYERS** has the rest. **Settings › AIR › Map Layers** chooses which are on when the map opens.

## Off grid

With no internet, Air reads aircraft from your own radio. It needs:

- an RTL-SDR dongle and a 1090 MHz antenna on a **Sentry host** (a Raspberry Pi running Sentry, which shares its dongles over your network);
- the ADS-B decoder, started with `docker compose --profile adsb up -d --build`;
- a fast local network: the radio's raw signal uses about 38 Mbps the whole time Air is open.

Then:

1. Add the Sentry host under **Settings › SDR › Sentry Hosts** ([Add a radio](sdr/add-a-radio.md#add-a-sentry-host)).
2. Pick its dongle in **Settings › AIR › Off Grid ADS-B SDR**.
3. Switch to **OFF GRID** (all of Sentinel in **Settings › App Settings › Connectivity Mode**, or only Air in **Settings › AIR › Source Override**), then select **APPLY CHANGES**.
4. Open **AIR**. Sentinel claims the dongle, tunes it to 1090 MHz and shows the aircraft around the receiver.

The dongle is held for Air while the map is open and released when you close it. More detail is in [Install and run decoders](../decoders.md).

## Settings

All under **Settings › AIR**:

| Setting | What it does | When to change it |
|---|---|---|
| **Source Override** | Uses **ONLINE** or **OFF GRID** for Air only, whatever the rest of Sentinel uses. | When Air should use your own radio while other sections stay online, or the other way round. |
| **Off Grid ADS-B SDR** | The Sentry dongle that receives aircraft off grid. | When you set up off-grid Air or move the dongle. |
| **Off Grid Squawk Checks** | Seconds between background checks for emergencies off grid, while no AIR map is open. Default 20. | Raise it to put less load on the radio host. |
| **Online Data Source** | The online feed of aircraft. Default `https://api.adsb.lol/v2`. | Only if you use another feed with the same format. |
| **Online Squawk Checks** | Seconds between background checks for emergencies online, while no AIR map is open. Default 20. | Raise it to use less internet. |
| **Map Layers** | Which layers the map draws when it opens. | To change what you see by default. |
| **Overhead Aircraft Alerts** | Places to watch for aircraft overhead, and how close counts. | To be told when something flies over. |
| **Label Data Points** | What each aircraft's label on the map shows. | To show more or less on the map. |

## Troubleshooting

- **The map is empty off grid.** The notice at the top of the map says why. Check that a dongle is chosen in **Off Grid ADS-B SDR** and that the decoder is running (`docker compose --profile adsb ps`). If the decoder log says it is streaming but accepts 0 messages, the problem is the antenna or signal, not Sentinel.
- **"No data source configured."** Air is online but **Online Data Source** is empty. Put the default back, or switch to **OFF GRID**.
- **No emergency alerts when the map is closed.** Check that **Sentinel Location** is set (online) or that **Off Grid ADS-B SDR** is set (off grid), and that the `air` service is running.
- **AIR is greyed out.** The Air service has stopped. Run `docker compose ps air` and `docker compose logs air`.
