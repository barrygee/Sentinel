# Decode

Turn digital signals into voice, positions and messages. Each decoder is an optional container and needs **its own dongle** while it runs. Install them first: [Decoders](../../decoders.md).

## Decoders

| Decoder | You get | Shows in | Start it from |
|---|---|---|---|
| **Digital voice** | DMR, P25, NXDN, D-STAR, YSF and M17 voice and call details | SDR panel | **CONTROLS › DIGITAL MODE › DMR** |
| **APRS** | Amateur positions, weather, messages | Land map | **Settings › LAND › Off Grid APRS SDR** |
| **AIS** | Ships, no internet | Sea map | **Settings › SEA › Off Grid AIS SDR** |
| **ADS-B** | Aircraft, no internet | Air map | **Settings › AIR › Off Grid ADS-B SDR** |

## Digital voice

1. `docker compose --profile voice-decoder up -d --build` (first build takes minutes).
2. Tune to a digital voice channel and press **Tune** (▶).
3. **CONTROLS › DIGITAL MODE › DMR**. The decoder opens below the waterfall.

- Decoded voice plays; call details (talk group, radio ID) appear as calls arrive.
- Two views: decoded messages, and the raw decoder log. **Clear** empties them.
- Press **DMR** again to stop. Despite the label it decodes every mode in the table.

## APRS, AIS and ADS-B

Start these from their section's settings: [Land](../land.md#hear-aprs-stations), [Sea](../sea.md#off-grid), [Air](../air.md#off-grid).

- APRS and AIS keep their dongle on channel and decode in the background, even after a restart.
- ADS-B holds its dongle while the Air map is open.
- A held dongle reads **RESERVED** in the SDR panel.

## Tips

- Channels: APRS 144.800 MHz (Europe), AIS 161.975 and 162.025 MHz, ADS-B 1090 MHz. One dongle can't cover two.
- No sync before a call starts is normal.
- **Mute Audio While Decoding** hides the raw digital noise.
