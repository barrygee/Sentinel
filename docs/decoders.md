# Install and run decoders

This page is about installing and running the decoder containers. To use a decoder once it runs, see [Decode digital signals](use/sdr/decode.md). To see how decoding works inside Sentinel, see [Decoding](architecture/decoding.md).

A **decoder** turns a digital radio signal into something Sentinel can show or play. Each one is an optional container in its own [compose profile](reference/glossary.md#developer-terms) (a named group of optional containers), so it starts only when you ask for it.

| Decoder | Profile | What you get | Program inside |
|---|---|---|---|
| Digital voice | `voice-decoder` | DMR, P25, NXDN, D-STAR, YSF and M17 voice and call details in the SDR panel | dsd-fme |
| APRS | `aprs` | APRS stations on the Land map | Direwolf |
| AIS | `ais` | Ships on the Sea map with no internet | Direwolf 1.8 |
| ADS-B | `adsb` | Aircraft on the Air map with no internet | readsb |

## Before you start

- **One dongle per decoder.** Each decoder holds its own connection to its dongle and tunes it, so they can't share. `--profile all` means four dongles. What to buy is in [Choose radios and hardware](hardware.md).
- **A radio added to Sentinel** for each decoder ([Add a radio](use/sdr/add-a-radio.md)). For ADS-B it must be a Sentry dongle.
- **Time for the first build.** Building every decoder takes several minutes the first time, because the voice decoder compiles its vocoder library and the AIS decoder compiles Direwolf.

Decoders need no passwords or keys: Sentinel gives each one its own login when it starts.

## Start decoders

Start the ones you want:

```bash
docker compose --profile aprs up -d --build                         # one
docker compose --profile aprs --profile ais up -d --build           # several
docker compose --profile all up -d --build                          # all four
```

The profile names are `voice-decoder`, `aprs`, `ais` and `adsb`.

Each decoder logs one line when it reaches the radio hub. Check it with:

```bash
docker compose --profile all logs aprs-decoder
```

You should see `[aprs] connected to the radio hub through http://gateway:8080`. If the hub is still starting, you'll first see one `waiting for the radio hub through …; retrying quietly`.

## Start them every time

A decoder started with `--profile` is left out the next time you run a plain `docker compose up -d`. To start decoders every time, set them in `.env`:

```bash
COMPOSE_PROFILES=aprs,ais        # or all
```

This applies to every compose command, including `down` and `logs`, so you no longer need `--profile`. See [Environment variables](configuration.md#choose-what-starts).

## Give each decoder its radio

Once a decoder runs, tell Sentinel which radio it uses: **Off Grid APRS SDR** in Settings › LAND, **Off Grid AIS SDR** in Settings › SEA, **Off Grid ADS-B SDR** in Settings › AIR, or the **DMR** button in the SDR panel for digital voice. What each one then does is in [Decode digital signals](use/sdr/decode.md).

## Update or rebuild a decoder

After an upgrade, rebuild only the decoders, without restarting the rest of Sentinel:

```bash
docker compose up -d --build --no-deps aprs-decoder ais-decoder
```

Without `--no-deps`, `--build` rebuilds and restarts the app too, and for a few seconds the sections log errors for requests that needed it.

## Stop decoders

Stop one, and leave the rest of Sentinel running:

```bash
docker compose stop aprs-decoder
```

It starts again with the next `docker compose --profile aprs up -d`, or with every `docker compose up -d` if `COMPOSE_PROFILES` names it; remove it from `COMPOSE_PROFILES` to keep it stopped.

## On a second computer

The radio hub and the voice, APRS and AIS decoders can run on a computer next to the antennas, while the browser keeps using this one. See [Run the radios on a second machine](radio-host.md). The ADS-B decoder stays on the main computer.

A decoder you run outside Docker, or on a computer of its own, needs `SENTINEL_GATEWAY_URL` set to `http://<sentinel-host>:8080`. Off-grid Air then needs `ADSB_OFFGRID_URL`; see [Environment variables](configuration.md#data-sources).

## Troubleshooting

These are problems with the decoder containers themselves. If a decoder runs but its map stays empty, see that section's page: [Air](use/air.md#troubleshooting), [Sea](use/sea.md#troubleshooting) or [Land](use/land.md#troubleshooting).

| What you see | What to do |
|---|---|
| The decoder log repeats `waiting for the radio hub` | The radio hub isn't running: `docker compose ps radio`. |
| `decode-config fetch failed: HTTP Error 401` on every poll | The decoder's login is out of date, usually after credentials were recreated. Restart it, for example `docker compose restart aprs-decoder`. |
| ADS-B log: `no ADS-B source configured` | No dongle is chosen in **Off Grid ADS-B SDR**, or the chosen one no longer appears on the Sentry host (unplugged, or its id changed). Choose it again. |
| A radio reads **RESERVED** in the SDR panel | A decoder holds it. That is on purpose, so the decoder isn't knocked off its channel. |

## For developers

More on each decoder's container: [`decoder/README.md`](../decoder/README.md) (voice), [`decoder/aprs/README.md`](../decoder/aprs/README.md), [`decoder/ais/README.md`](../decoder/ais/README.md), [`decoder/adsb/README.md`](../decoder/adsb/README.md).

**Never push the decoder images to a public registry.** The voice decoder's image includes a patent-encumbered library (mbelib), so it is built on the computer that uses it.
