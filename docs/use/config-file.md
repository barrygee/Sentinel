# Edit the config file

Every setting in Sentinel is also kept in one file, `sentinel_config.json`. Use it to change many settings at once, to copy settings to another Sentinel, or to change a setting that has no control in Settings yet, such as [switching Land on](land.md#switch-land-on).

## Where the file is

On the computer running Sentinel, in the folder you installed it in:

```text
backend/data/sentinel_config.json
```

It is a live copy. Whenever a setting changes, in Settings or anywhere else, Sentinel rewrites the file within a second.

## Edit it by hand

1. Open `backend/data/sentinel_config.json` in a text editor.
2. Change what you need and save the file.

Sentinel notices the saved file within a second or two and applies it. Open browsers update in place, with no reload.

If the file isn't valid (a missing comma, say, or a value of the wrong kind), Sentinel ignores it and logs why in the app's log (`docker compose logs app`). Your running settings don't change, and the next change made in Settings overwrites the broken file, so fix it promptly.

## Edit it in Settings

You can make the same edits from the browser, which suits a machine you can't sit at:

1. Open **Settings › App Settings › Application Config** and select **EDIT**. The whole file appears as text.
2. Make your changes.
3. Select **APPLY CHANGES**.

**EXPORT** downloads the file.

## Copy settings to another Sentinel

1. On the first Sentinel, select **EXPORT** under **Application Config** (or use **Export All Configuration** to include frequencies and the band plan).
2. On the other Sentinel, open **Application Config**, select **EDIT**, replace the text with the exported file's contents, and select **APPLY CHANGES**. Or replace its `backend/data/sentinel_config.json` with the exported file.

Frequencies and the band plan load the same way, from **Settings › SDR › Frequencies & Groups (JSON)** and **Band Plan (JSON)**.

## What the file looks like

The file has one block per part of Sentinel: `app` for the whole app, then `air`, `space`, `sea`, `land` and `sdr`. Each block holds that part's settings as `"name": value`. This is the start of a fresh install's file (the full set of defaults is `backend/default_config.json` in the code):

```json
{
  "app": {
    "connectivityMode": "online",
    "location": { "latitude": "", "longitude": "" },
    "rangeRingOrigin": { "kind": "user", "sentryHostId": null },
    "notificationSound": false,
    "mapTheme": "dark",
    "mapLayers": { "roads": false, "names": false, "borders": true, "terrain": false }
  },
  "air": {
    "enabled": true,
    "sourceOverride": "online",
    "onlineDataSourceURL": "https://api.adsb.lol/v2",
    "squawkWatchOnlineIntervalSec": 20,
    "offgridSdrSource": null,
    "squawkWatchOffgridIntervalSec": 20,
    "overheadAlerts": { "civil": false, "mil": false, "radiusNm": 10 }
  },
  "sea": {
    "enabled": true,
    "sourceOverride": "online",
    "aisBoundingBoxes": [[[-90, -180], [90, 180]]],
    "aisSdrRadioId": null
  },
  "land": {
    "enabled": false,
    "aprsChannelHz": 144800000,
    "aprsRetentionMinutes": 5
  },
  "sdr": {
    "recordRawIq": false,
    "recordingMaxDurationMinutes": 360,
    "recordingsFolder": "",
    "radios": [],
    "aprs_radio_id": null,
    "ais_radio_id": null
  }
}
```

The real file has more keys in each block (labels, layers and so on); the ones above are those you are most likely to change.

| Key | Values |
|---|---|
| `app.connectivityMode`, `<section>.sourceOverride` | `"online"` or `"offgrid"` |
| `app.location` | `latitude` and `longitude` as decimal degrees, both set or both empty |
| `app.mapTheme` | `"dark"` or `"light"` |
| `<section>.enabled` | `true` or `false`: whether the section appears |
| `sea.aisBoundingBoxes` | A list of boxes, each `[[south, west], [north, east]]` |
| `sea.aisSdrRadioId`, `sdr.aprs_radio_id`, `air.offgridSdrSource` | The `id` of a radio in `sdr.radios`, or `null` for none |
| `land.aprsChannelHz` | A frequency in hertz: `144800000` is 144.800 MHz |

## Example changes

You don't have to send the whole file. In **Application Config**, a document with only some keys changes only those keys and leaves everything else as it is. Each key you send is replaced as a whole, though: to change one field of a nested value such as `"overheadAlerts"` or `"location"`, send all of its fields. Paste one of these in place of the text, then select **APPLY CHANGES**.

**Set your location and take everything off grid:**

```json
{
  "app": {
    "location": { "latitude": 51.5072, "longitude": -0.1276 },
    "connectivityMode": "offgrid"
  },
  "air": { "sourceOverride": "offgrid" },
  "space": { "sourceOverride": "offgrid" },
  "sea": { "sourceOverride": "offgrid" }
}
```

**Switch Land on, for North America's APRS channel:**

```json
{
  "land": { "enabled": true, "aprsChannelHz": 144390000 }
}
```

**Receive ships only around Great Britain and Ireland:**

```json
{
  "sea": { "aisBoundingBoxes": [[[49.5, -11.0], [61.0, 2.5]]] }
}
```

**Add two rtl_tcp radios.** Sentinel gives each one an `id` when it is saved; look them up afterwards in **Settings › SDR › SDR Devices** or in the file. Sending `radios` replaces the whole list, so include any radios you already have:

```json
{
  "sdr": {
    "radios": [
      { "name": "Roof RTL-SDR", "host": "192.168.1.45", "port": 1234, "enabled": true },
      { "name": "Marine RTL-SDR", "host": "192.168.1.46", "port": 1234, "enabled": true }
    ]
  }
}
```

**Use radio 2 for AIS and save recordings into a subfolder.** After adding the two radios above to an empty list, they have ids 1 and 2:

```json
{
  "sea": { "aisSdrRadioId": 2 },
  "sdr": { "recordingsFolder": "marine", "recordRawIq": true }
}
```

If a document is invalid, nothing in it is saved: for example a `location` with only a latitude, or a latitude above 90.

## What isn't in the file

Secrets are never written to the file: the AISStream key is kept out of it and out of every export. Set it again on each Sentinel under **Settings › SEA › AIS Data API Key**.

Saved frequencies, groups, search ranges, the band plan and satellite frequencies aren't in this file either: they have their own JSON editors in Settings (see [Save and scan frequencies](sdr/frequencies.md#edit-many-at-once)).

Settings in `.env`, such as the recordings root, are not in this file either. They are about how Sentinel runs on that computer, and need a restart to change. [Environment variables](../configuration.md#example-env-files) has example `.env` files.
