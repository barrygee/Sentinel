# 3D Globe

An optional section: a 3D globe of the world with live aircraft, satellites, vessels and APRS stations on it, and a switch for each kind. It is being built in steps: aircraft, vessels and APRS stations are shown now, and satellites come next.

## Switch the globe on

The globe starts switched off.

1. **Settings › App Settings › SECTIONS › 3D Globe**: turn the switch on.
2. **APPLY CHANGES**. **GLOBE** appears in the nav.

Turn the switch off and apply to hide it again. The setting is `globe.enabled` in the [config file](settings.md).

## What it shows

- **Aircraft** around your location (Settings › My Location), within 250 nautical miles: the same aircraft, from the same source, as AIR's map. They are coloured by altitude, as on AIR's map, and turn red for an emergency squawk.
- **Vessels** in the part of the globe you're looking at, from SEA: coloured by type, as on SEA's map. At most 5,000 are shown at once; zoom in to see the rest of a busy area.
- **APRS stations** heard by LAND's APRS decoder. There are none until a radio runs the decoder (Settings › LAND › Off Grid APRS SDR).

The globe doesn't fetch anything itself: AIR, SEA and LAND answer it from the data they already hold, so it uses no extra online quota. If one of those sections isn't running or can't answer, a notice says so and the other layers carry on.

## Use the globe

- **Turn and zoom**: drag to turn, scroll or pinch to zoom, or use **+** and **−**. With the globe focused, the arrow keys turn it, **+** and **−** zoom, and **Home** goes back to your location.
- **Layers**: the **AIR**, **SEA** and **APRS** buttons show or hide each layer, with how many objects it holds. The choice is saved at once (`globe.layers` in the [config file](settings.md)).
- **Details**: click or tap an aircraft, vessel or station for its details. The centre button turns the globe to it; **×** or **Escape** closes the panel.

## Run without the globe

The globe has its own small service, `globe`, which runs even while the switch is off. To not run it at all, set `SENTINEL_GLOBE_REPLICAS=0` in `.env` (see [Environment variables](../configuration.md)); the switch then disappears from Settings.
