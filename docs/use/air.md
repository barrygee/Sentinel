# Air

Live aircraft near you, from ADS-B. Online from [adsb.lol](https://adsb.lol); off grid from your own radio.

## Features

- **Live map** of aircraft within 250 nautical miles of the map centre: off grid every few seconds, online every **Online Refresh Interval** (3 minutes by default).
- **Aircraft details**: height, speed, heading, climb, type, registration, category and squawk. **SIGNAL LOST** when it stops reporting.
- **Track aircraft**: keep the map on it; it is listed under **TRACKING**.
- **Landing and take-off alerts** for an aircraft you choose (**Enable alerts**).
- **Emergency alerts** for squawks 7700 (emergency), 7600 (radio failure) and 7500 (hijack), even with no browser open.
- **Overhead alerts** when civil or military aircraft come near your location or a Sentry site.
- **Search** by callsign, ICAO address or squawk in **FILTER**.
- **Show** all, civil or military aircraft, airports or military bases.
- **Airport frequencies**: select one to tune your radio to it in AM.
- **Layers**: **RANGE RING**, **A2A REFUELING**, **AWACS**, **TERRAIN**, more under **MAP LAYERS**.

![An aircraft's details in the FILTER pane: POSITION and IDENTIFICATION, squawk 7700, and the track, alert and centre buttons beneath; its headings are red for the emergency. On the map the aircraft is red too, with its recent trail behind it.](../images/air-aircraft-details.png)

## Off grid

You need a dongle with a 1090 MHz antenna on a [Sentry host](sdr/add-a-radio.md#add-a-sentry-host), and the ADS-B decoder.

1. `docker compose --profile adsb up -d --build`
2. Set **OFF GRID** (app-wide **Connectivity Mode**, or Air's **Source Override**).
3. **Settings › AIR › Off Grid ADS-B SDR**: pick the dongle, then **APPLY CHANGES**.

Opening Air claims the dongle and tunes it to 1090 MHz; closing it lets it go. It uses about 38 Mbps on your network while open.

## Settings

All in **Settings › AIR**.

| Setting | What it does |
|---|---|
| **Source Override** | **ONLINE** or **OFF GRID** for Air only. The settings below show for the mode picked |
| **Off Grid ADS-B SDR** | The Sentry dongle used off grid |
| **Online Data Source** | The online feed. Default `https://api.adsb.lol/v2` |
| **Online Refresh Interval** | Seconds between calls to the online feed, 5 to 280. Default 180. adsb.lol allows 500 calls a day, so under 173 runs out |
| **Online Squawk Checks** / **Off Grid Squawk Checks** | Seconds between emergency checks while no Air map is open. Default 20. Online, never more often than **Online Refresh Interval** |
| **Map Layers** | Layers on when the map opens |
| **Label Data Points** | What each aircraft label shows |
| **Overhead Aircraft Alerts** | Places to watch, civil or military, and how close |

## Tips

- Set **Sentinel Location** first: emergency checks and range rings centre on it.
- Off grid, the map centres on your receiver; it only hears around itself.

## If it's not working

- **Empty off grid:** read the notice at the top of the map. Check **Off Grid ADS-B SDR** and `docker compose --profile adsb ps`. A decoder that streams but accepts 0 messages is an antenna or signal problem.
- **"No data source configured":** **Online Data Source** is empty.
- **Empty online, `503` in the browser console:** adsb.lol's 500 calls a day are used up. `docker compose logs air` says `rate limited us (HTTP 429)`; it resets within a day. Raise **Online Refresh Interval** if it happens again.
- **AIR greyed out:** `docker compose logs air`.
