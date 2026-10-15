# Download maps for offline use

Online, Sentinel draws its maps from the internet. To keep the maps working with no internet, download the area you need while you still have a connection. This page shows you how, and how much space it takes.

> [!IMPORTANT]
> Download your maps **before** you go off grid. Downloading needs an internet connection, so it is turned off while Sentinel is in **OFF GRID** mode.

## Download an area

1. Open **Settings › App Settings › Offline Maps**.
2. Choose the area in one of these ways:
   - select **DRAW AREA** and drag a rectangle on the small map;
   - move the small map to your area and select **USE CURRENT VIEW**;
   - type the **NORTH**, **SOUTH**, **EAST** and **WEST** edges in decimal degrees.

   Drag the rectangle's corners or edges to adjust it. **CLEAR AREA** starts again.

   ![Settings › App Settings › Offline Maps: a small world map to choose the area on, with DRAW AREA and USE CURRENT VIEW beneath.](../images/settings-offline-maps.png)
3. Choose the **DEPTH**: how far you can zoom in offline, from 6 (whole countries) to 14 (individual streets). Each step deeper can take up to four times the space.
4. Tick what to download: **Basemap** (land, roads, places, borders) and **Terrain** (hills and contour lines). Both are ticked to start with.
5. Check the estimate. It shows the size, the number of tiles and the **Free space** on the computer running Sentinel. If the download won't fit, **DOWNLOAD** is turned off.
6. Select **DOWNLOAD**.

The download runs on the Sentinel computer, so you can close Settings or the browser while it runs. One download runs at a time; others wait as **QUEUED**. **CANCEL** stops one.

When it finishes, the area appears in the list below with its size and date. Maps of that area now work offline, in both **DARK** and **LIGHT** map styles, and **TERRAIN** works there too.

## How much space it takes

Size depends on the area and depth, and on how much is in it: a city takes far more than the same area of sea. Go by the estimate, which is worked out for your exact area before you download. To keep downloads small, choose a large area at a low depth for the region and a small area at a high depth for where you are. Terrain stops adding detail at depth 12, so above that only the basemap grows.

## Remove an area

Select the delete button next to an area in the list. Its files are deleted straight away.

## Use the offline maps

Switch to **OFF GRID** in **Settings › App Settings › Connectivity Mode** and select **APPLY CHANGES**. The maps then come from your downloaded areas, newest first. Outside them the map is blank.

[Run Sentinel with no internet](../tasks/no-internet.md) puts this together with the rest of the off-grid set-up.

## Where the maps are stored

Downloaded areas are kept on the Sentinel computer, in the `sentinel_db` Docker volume, so they survive restarts and upgrades. You don't need to restart anything after a download.

## Advanced: install a base map by hand

As well as downloaded areas, Sentinel can use a **base archive**: [PMTiles](https://protomaps.com) files placed in `frontend/assets/tiles/`. They are used wherever no downloaded area covers the map. You might do this to prepare a machine before it goes somewhere with no internet. You need the `pmtiles` program:

```bash
brew install pmtiles    # or a binary from https://github.com/protomaps/go-pmtiles/releases
```

Then cut the files you want. `--bbox` is `west,south,east,north`; add `--dry-run` to see the size first. Replace `YYYYMMDD` with the date of a current build listed at [build.protomaps.com](https://build.protomaps.com):

```bash
mkdir -p frontend/assets/tiles
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/surroundings.pmtiles --maxzoom=6
pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/uk.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=14
pmtiles extract https://download.mapterhorn.com/planet.pmtiles frontend/assets/tiles/uk-terrain.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=12
```

| File | What it covers |
|---|---|
| `surroundings.pmtiles` | The whole world, zoom 0 to 6 |
| `uk.pmtiles` | Your region in detail, zoom 0 to 14 (the example is the UK) |
| `uk-terrain.pmtiles` | Terrain for your region, for **TERRAIN** |

## About the map data

Downloaded basemaps are cut from the newest [Protomaps](https://protomaps.com) world build, which Sentinel finds by itself. Protomaps deletes each dated build after about a week, so there is nothing to keep up to date. Terrain comes from [Mapterhorn](https://mapterhorn.com). The `.env` settings `OFFLINE_BASEMAP_SOURCE_URL` and `OFFLINE_TERRAIN_SOURCE_URL` change these sources; you rarely need them.

The offline map data has no national park boundaries, so the offline styles draw them from a file built into Sentinel, `frontend/assets/national-parks.geojson`: the 15 national parks of Great Britain, from the ONS _National Parks (December 2022) Boundaries GB BGC_. Source: Office for National Statistics, licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/); contains OS data © Crown copyright and database right 2022.
