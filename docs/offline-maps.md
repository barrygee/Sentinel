# Offline maps

Offline map data has two tiers, and either works on its own:

1. **Bundled base archive** — [PMTiles](https://protomaps.com) files placed in `frontend/assets/tiles/`, extracted once by hand:

    | File                   | Coverage                                                                                                    |
    | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
    | `surroundings.pmtiles` | Global overview (zoom 0–6)                                                                                  |
    | `uk.pmtiles`           | Regional detail (zoom 0–14)                                                                                 |
    | `uk-terrain.pmtiles`   | Optional Terrarium DEM for the **TERRAIN** layer (hillshade + contours); the button is disabled when absent |

    ```bash
    brew install pmtiles    # or a binary from https://github.com/protomaps/go-pmtiles/releases
    mkdir -p frontend/assets/tiles
    pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/surroundings.pmtiles --maxzoom=6
    pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles frontend/assets/tiles/uk.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=14
    pmtiles extract https://download.mapterhorn.com/planet.pmtiles frontend/assets/tiles/uk-terrain.pmtiles --bbox=-8.65,49.84,1.77,60.86 --maxzoom=12
    ```

    `--bbox` is `west,south,east,north`; add `--dry-run` to see the download size first.

2. **In-app downloads** — **Settings › App Settings › Offline Maps** lets you pick any area, no rebuild or restart needed. Draw a dashed rectangle on the settings map or click **Use current view**, fine-tune the N/S/E/W fields, pick a depth (max zoom 6–14), and tick **Basemap** and/or **Terrain** (both on by default; at least one required). A live estimate shows size and tile count against free disk space as you adjust the selection, and Download is disabled if it won't fit. Progress and Cancel are shown while a job runs (one at a time), and downloaded regions appear in a list below with size/date and a delete action. Downloaded areas work offline in both map palettes (**DARK** and **LIGHT**) and go through the same TERRAIN button — terrain downloads to z12 and MapLibre overzooms beyond that, same as the bundled archive. This requires connectivity to reach the source archives, so it's disabled in **Off Grid** connectivity mode.

    Regions are stored server-side: in Docker under `/app/data/tiles` (the existing `sentinel_db` volume, so no new volume is needed); outside Docker under `<directory of the SQLite db>/tiles` unless `OFFLINE_TILES_DIR` overrides it. Extraction uses the `pmtiles` (go-pmtiles) CLI, bundled in the Docker image; for non-Docker dev, install it yourself (`brew install pmtiles` or a binary from the [releases page](https://github.com/protomaps/go-pmtiles/releases)) and make sure it's on `PATH`, or point `PMTILES_BIN` at it. The basemap is cut from the newest Protomaps planet build, which the backend finds automatically. Protomaps deletes each dated build after about a week, so there is nothing to keep updated. Set `OFFLINE_BASEMAP_SOURCE_URL` only to force a specific build (see `.env.example`). The terrain source (`OFFLINE_TERRAIN_SOURCE_URL`) rarely changes.

Both tiers feed the same map: the offline basemap styles read tiles through `GET /api/offline-map/basemap/{z}/{x}/{y}` and terrain through `GET /api/offline-map/terrain/{z}/{x}/{y}`, which check downloaded regions newest-first, then fall back to the bundled base archive, then return an empty tile (204) if neither has it.

The offline map data has no national park boundaries, so the offline styles draw them from a bundled file, `frontend/assets/national-parks.geojson`: the 15 national parks of Great Britain, from the ONS _National Parks (December 2022) Boundaries GB BGC_. Source: Office for National Statistics, licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/); contains OS data © Crown copyright and database right 2022.

Switch to offline map rendering with **Settings › Connectivity Mode › Off Grid**.
