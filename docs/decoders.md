# Decoders

Optional containers that turn a radio signal into data. Each runs in its own compose profile and needs its own dongle. Using them: [Decode](use/sdr/decode.md).

| Decoder | Profile | Gives | Program |
|---|---|---|---|
| Digital voice | `voice-decoder` | DMR, P25, NXDN, D-STAR, YSF, M17 in the SDR panel | dsd-fme |
| APRS | `aprs` | Stations on the Land map | Direwolf |
| AIS | `ais` | Ships on the Sea map, no internet | Direwolf 1.8 |
| ADS-B | `adsb` | Aircraft on the Air map, no internet | readsb |

## Start

```bash
docker compose --profile all up -d --build                 # every decoder
docker compose --profile aprs --profile ais up -d --build  # some
```

The first build takes several minutes. Then give each its radio in Settings (**Off Grid … SDR** for Air, Sea and Land; the **DMR** button for voice).

A healthy decoder logs `[aprs] connected to the radio hub through http://gateway:8080`.

## Everyday

```bash
COMPOSE_PROFILES=aprs,ais                                  # in .env: start them every time
docker compose up -d --build --no-deps aprs-decoder        # rebuild one, leave the rest running
docker compose stop aprs-decoder                           # stop one
```

## On another computer

The radio hub and the voice, APRS and AIS decoders can run by the antennas: [Radio host](radio-host.md). ADS-B stays on the main computer. A decoder outside Docker needs `SENTINEL_GATEWAY_URL`.

## If it's not working

| You see | Do |
|---|---|
| `waiting for the radio hub` repeats | `docker compose ps radio` |
| `decode-config fetch failed: HTTP Error 401` | `docker compose restart <decoder>` |
| ADS-B: `no ADS-B source configured` | Pick the dongle again in **Off Grid ADS-B SDR** |
| A radio reads **RESERVED** | On purpose: a decoder holds it |

## For developers

Each decoder's README: [`decoder/README.md`](../decoder/README.md) (voice), [`aprs`](../decoder/aprs/README.md), [`ais`](../decoder/ais/README.md), [`adsb`](../decoder/adsb/README.md). Never push decoder images to a public registry: the voice image includes the patent-encumbered mbelib.
