# Land: repeaters and APRS

## What it's for

The **LAND** section is for radio amateurs. It has two map layers, shown one at a time:

- **REPEATERS**: every UK amateur radio repeater, from the [ukrepeater.net](https://ukrepeater.net/) directory, with its frequencies, modes and access tones. Select a frequency to listen to it.
- **APRS STATIONS**: stations your own radio hears on APRS (the Automatic Packet Reporting System), a radio network amateurs use to share positions, weather and short messages.

Use Land to find the repeaters you can reach, plan a route through repeater coverage, listen to a local repeater, or see who is active on APRS around you.

## Start it

Land starts with the rest of Sentinel, but it is **switched off** until you [switch it on](#switch-land-on). To run its service on its own:

```bash
docker compose up -d gateway land
```

APRS also needs the radio hub and the APRS decoder:

```bash
docker compose --profile aprs up -d --build
```

## Before you start

- **Repeaters:** nothing. The directory updates itself daily when online, and a built-in copy works offline.
- **APRS:** an RTL-SDR dongle you can give to APRS full time, a 2 m antenna, and the APRS decoder. See [Hear APRS stations](#hear-aprs-stations).

## Using it

### Switch Land on

Land has no on/off switch in Settings yet. Switch it on in the configuration:

1. Open **Settings › App Settings › Application Config** and select **EDIT**. The configuration appears as text.
2. In the text, find the line `"land": {`. A line or two below it is:

   ```json
   "enabled": false,
   ```

   Change `false` to `true`, keeping the comma.
3. Select **APPLY CHANGES**.

**LAND** appears in the section menu. If it doesn't, reload the page. You can also make the same change in the config file; see [Edit the config file](config-file.md).

### Find a repeater

Open **LAND**. The map shows the repeaters. Open **FILTER** in the sidebar to search by callsign, town, band or mode, and use the **Band**, **Mode** and **Status** filters to narrow the list, for example to 2 m FM repeaters that are on air.

Select a repeater to see its **SITE** (location, Maidenhead locator, region and the keeper who looks after it) and each of its channels: **OUTPUT** and **INPUT** frequencies, **OFFSET**, the access tone or colour code (**CTCSS / CC**), **STATUS**, aerial **HEIGHT**, power (**ERP**) and **MODES**.

![A repeater's details: SITE information, then its 2 m channel with OUTPUT and INPUT frequencies (each with a save button), offset, CTCSS tone, status, height, power and mode.](../images/land-repeater-details.png)

### Listen to a repeater

Select a repeater's **OUTPUT** frequency. Your radio tunes to it in the right mode and starts playing. Select **SAVE FREQUENCY** to add it to your saved frequencies in the SDR section. You need a radio set up; see [Add a radio](sdr/add-a-radio.md). [Find and listen to a local repeater](../tasks/listen-to-a-repeater.md) goes through it step by step.

### Hear APRS stations

1. Start the APRS decoder: `docker compose --profile aprs up -d --build`.
2. Pick the radio in **Settings › LAND › Off Grid APRS SDR** and select **APPLY CHANGES**. That radio is now kept for APRS and can't be used in the SDR section.
3. Open **LAND** and choose **APRS STATIONS** under **FILTER**. Until a radio is set, this button reads **APRS STATIONS — NO SDR SET**.

Stations appear as the radio hears them, with their APRS symbol. Select one to see its details; **RAW** shows the packet exactly as it was received. Decoding carries on in the background with no browser open, and starts again after a restart.

## Off grid

Land works fully off grid. The repeater directory falls back to the copy built into Sentinel, and APRS comes from your own radio in any case.

## Settings

All under **Settings › LAND**:

| Setting | What it does | When to change it |
|---|---|---|
| **Off Grid APRS SDR** | The radio that decodes APRS. Until one is set, the APRS layer is off. | When you set up APRS. |
| **APRS Channel** | The frequency the APRS radio is kept on. Default 144.800 MHz (Europe and the UK); use 144.390 MHz in North America. If anything moves the radio, it retunes itself here. | When you are outside Europe. |
| **APRS Label Fields** | What each station's label on the map shows. | To show more or less on the map. |
| **APRS Retention** | Minutes a station stays on the map after it was last heard. Default 5. | Raise it to see quieter stations for longer. |
| **Repeater Label Fields** | What each repeater's label shows. | To show more or less on the map. |
| **Repeater Directory (JSON)** | The repeater directory itself. You can edit or replace it; a replacement is kept for 30 days before the daily update starts again. | To correct an entry or load your own list. |

## Troubleshooting

- **LAND isn't in the menu.** It is switched off; see [Switch Land on](#switch-land-on).
- **APRS STATIONS can't be selected.** No radio is set in **Off Grid APRS SDR**.
- **APRS hears nothing.** Check that the decoder is running (`docker compose --profile aprs ps`) and that the radio is on the APRS channel: a satellite auto-tune can move it, and it moves back within about 15 seconds. Check the antenna suits 2 m.
- **A repeater's details look out of date.** Online, the directory updates daily. Offline, it is the built-in copy from when your version of Sentinel was made.
