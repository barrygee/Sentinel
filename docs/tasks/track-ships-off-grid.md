# Track ships off grid with your own radio

Receive ships' AIS broadcasts with your own radio, so the Sea map works with no internet and no AISStream key. If you can see the sea, or a busy river or estuary, you can usually hear ships within 10 to 30 miles, and further with a high antenna.

## Before you start

- An RTL-SDR dongle you can give to AIS full time. While AIS is running, that dongle isn't available for anything else.
- A marine VHF antenna, mounted as high as you can. AIS is line of sight, so height matters more than gain.
- The dongle shared on your network and added to Sentinel: [Add a radio](../use/sdr/add-a-radio.md).

## Steps

1. **Build and start the AIS decoder.** It builds its own decoder from source, so the first build takes several minutes:

   ```bash
   docker compose --profile ais up -d --build
   ```

   When it finishes, `docker compose --profile ais ps` lists `ais-decoder` as running.

2. **Choose the radio.** Open **Settings › SEA › Off Grid AIS SDR** and pick the dongle on your marine antenna.
3. **Switch Sea off grid.** Set **Settings › SEA › Source Override** to **OFF GRID**. (To take all of Sentinel off grid instead, use **Settings › App Settings › Connectivity Mode**.)
4. **Select APPLY CHANGES.**
5. **Open SEA.** Sentinel tunes the radio and starts decoding. Ships appear as they are heard; a busy area fills in within a few minutes.

Decoding keeps running in the background with no browser open, and starts again after a restart.

## How it works

Ships send AIS on two channels, **A (161.975 MHz)** and **B (162.025 MHz)**, taking turns between them. Sentinel tunes the dongle between the two and decodes both at once, so it doesn't miss half the traffic. Ships heard this way go into the same store as the online feed, so the map, tracks and ship types work the same either way.

## Troubleshooting

The notice at the top of the Sea map says what is wrong; [Sea: Troubleshooting](../use/sea.md#troubleshooting) explains each one. To see what the decoder itself reports, run `docker compose --profile ais logs ais-decoder`. More on the decoder is in [Install and run decoders](../decoders.md#off-grid-ais).
