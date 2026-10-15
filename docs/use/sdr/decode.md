# Decode digital signals

This page is about using decoders. To install them, see [Install and run decoders](../../decoders.md).

A **decoder** turns a digital radio signal into something you can read or hear: voice, ship and aircraft positions, or packet messages. Each decoder runs alongside Sentinel as its own optional service, and each one needs **its own dongle** while it runs.

## Which decoder does what

| Decoder | What you get | Where it shows | Start it from |
|---|---|---|---|
| **Digital voice** | Speech and call details from DMR, P25, NXDN, D-STAR, YSF and M17 radio | The SDR radio panel | The **DMR** button in the SDR radio panel (it decodes all these modes, not only DMR) |
| **APRS** | Positions, weather and messages from radio amateurs | The Land map | **Settings › LAND › Off Grid APRS SDR** |
| **AIS** | Ship positions, with no internet | The Sea map | **Settings › SEA › Off Grid AIS SDR**, then Sea off grid |
| **ADS-B** | Aircraft positions, with no internet | The Air map | **Settings › AIR › Off Grid ADS-B SDR**, then Air off grid |

Each decoder must be installed before it can be started; [Install and run decoders](../../decoders.md) has the commands.

## Decode digital voice

1. Install the voice decoder: `docker compose --profile voice-decoder up -d --build`. The first build takes several minutes.
2. In **SDR**, tune to a digital voice channel and select **Tune** (▶).
3. Under **CONTROLS › DIGITAL MODE**, select **DMR**. The decoder opens below the waterfall.

Call details (talk group, radio ID and so on) appear in the decoder panel as calls come in, and the voice plays. Before a call starts, the decoder shows no sync; that is expected. Select **DMR** again to stop decoding and hide the panel. Despite its label, the button decodes every mode in the table above.

Turn on **Settings › SDR › SDR Options › Mute Audio While Decoding** if the raw digital noise under the decoded voice bothers you.

## Decode APRS, AIS and ADS-B

These three decoders work for another section, so you start them from that section's settings, not from the SDR panel. Once started, APRS and AIS keep the dongle tuned to their channel, and keep decoding in the background with no browser open, even after a restart. ADS-B holds its dongle while the Air map is open.

- APRS: see [Land: Hear APRS stations](../land.md#hear-aprs-stations).
- AIS: see [Track ships off grid with your own radio](../../tasks/track-ships-off-grid.md).
- ADS-B: see [Air: Off grid](../air.md#off-grid).

A dongle held by one of these decoders reads **RESERVED** in the SDR radio panel and can't be tuned there, so the decoder isn't knocked off its channel.

## Why each decoder needs its own dongle

A dongle can only listen to one slice of the band at a time, and each decoder needs a particular channel: 144.800 MHz for APRS in Europe, 161.975 and 162.025 MHz for AIS, 1090 MHz for ADS-B. So running all four decoders at once needs four dongles. With one dongle, run one decoder at a time.
