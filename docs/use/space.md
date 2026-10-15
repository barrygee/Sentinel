# Space: satellites

## What it's for

The **SPACE** section shows satellites on a globe: where each one is now, where it is going, and when it will next pass over you. Use Space to:

- find a satellite and follow it;
- see which satellites will pass over you, and how high in the sky;
- get an alert a few minutes before a pass;
- have your radio tune itself to a satellite as it rises, and record it;
- see where on Earth it is day and night.

Sentinel works out every position itself from each satellite's **TLE** (two-line element set), a short public description of its orbit. Online, it downloads TLEs from [CelesTrak](https://celestrak.org). Once they are downloaded, Space works with no internet.

## Start it

Space starts with the rest of Sentinel. To run it on its own:

```bash
docker compose up -d gateway space
```

## Before you start

- Set **Settings › App Settings › Sentinel Location**. Passes are worked out for that spot.
- Load some satellites: **Settings › SPACE › Online Data Source**, pick a category such as **Amateur Radio**, then select **UPDATE TLE**. Until there are satellites, the map says "No satellite data available."
- To listen to or record a pass, [add a radio](sdr/add-a-radio.md).

## Using it

### Find a satellite

Open **FILTER** in the sidebar and type a name, a NORAD ID (the catalogue number every satellite has) or a category. The buttons under **FILTER** show one category at a time. Select a satellite to show it on the map with its path over the next orbits (**GROUND TRACK**) and the area of Earth that can see it (**FOOTPRINT**). Its details include its radio frequencies, if known, and its **UPCOMING PASSES**.

Select **Track satellite** to keep the map following it. It also appears under **TRACKING** in the sidebar.

### See passes over you

Open **PASSES** in the sidebar. It lists the next passes of the satellites you have loaded, soonest first, with the time it rises, its highest point in the sky and how long it lasts. Select a pass to see its path across your sky as a polar plot: the middle is straight overhead and the edge is the horizon. Passes with a high maximum elevation give the clearest signal.

![The PASSES pane: three upcoming passes, soonest first, each with its rise time, length and highest elevation, and category buttons above to filter them.](../images/space-passes.png)

### Get an alert before a pass

Select **Enable pass alerts** (the bell) on a pass. About five minutes before the satellite rises, an alert says it is coming. You can turn pass alerts off again from the pass or from **Settings › App Settings › Alerts**.

### Tune and record a pass automatically

For a satellite with a known downlink frequency, a pass also offers:

- **Auto-tune SDR**: when the satellite rises, your radio tunes to its downlink in the right mode. When it sets, the radio goes back to what it was doing.
- **Record pass**: records the pass while it is tuned. This needs **Auto-tune SDR** on too.

Sentinel must be open in a browser tab for these to happen, because the browser does the tuning and plays the audio. [Catch a satellite pass and record it](../tasks/record-a-satellite-pass.md) goes through it step by step.

### Day and night

**DAY / NIGHT** in the map controls shades the half of the Earth in darkness. **LOCATION NAMES** adds place names.

## Off grid

Space needs no internet once satellites are loaded: every position and pass is worked out on your computer. TLEs go out of date as orbits change, though. Positions drift by a few kilometres a day, so update them before you go off grid and at least weekly while you can.

With no internet at all, load TLEs from a file: **Settings › SPACE › TLE Import** takes a `.txt` file of TLEs (three lines per satellite: name, then the two element lines).

## Settings

All under **Settings › SPACE**:

| Setting | What it does | When to change it |
|---|---|---|
| **Online Data Source** | Where to download TLEs from, by category. **UPDATE TLE** downloads them now. | To load satellites, or to refresh them. |
| **TLE Import** | Loads TLEs from a `.txt` file. | When you have no internet, or your own TLEs. |
| **TLE Database** | How many satellites are stored, from where, and when each category was updated. Clears all of them or one category. | To tidy up, or to start again. |
| **Satellite Frequencies (JSON)** | Every satellite's radio frequencies, which auto-tune uses. | To add or correct a frequency. |
| **Filter Hover Behaviour** | Whether the map stays put or flies to a satellite when you hover over it in the **FILTER** list. | If the map moving about distracts you. |

## Troubleshooting

- **"No satellite data available."** No TLEs are stored. Load some (see [Before you start](#before-you-start)).
- **Auto-tune isn't offered for a satellite.** Sentinel doesn't know its downlink. Add it to **Satellite Frequencies (JSON)**.
- **The pass came and went, but nothing tuned.** Check that a browser had Sentinel open, that the SDR section has a radio connected, and that no other job (such as an APRS decoder) holds that radio.
- **Positions look wrong.** The TLEs are old. Select **UPDATE TLE**.
