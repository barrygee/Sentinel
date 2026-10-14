# Decoder sidecars

Each decoder is a separate container behind its own compose **profile** — never built by default or in CI. They can all run at once, but **each needs its own dongle**: Sentinel takes an enforced lease on the receiver it is using. No configuration is needed: on every `docker compose up` the one-shot `service-credentials` service gives each decoder its own credential, which the radio hub accepts for that decoder's kind only.

They can't share a receiver: every one holds its own `rtl_tcp` connection and tunes it, so `--profile all` means four radios. With one stick, start the single profile you want. The first `--profile all` build takes several minutes, because it compiles `mbelib` for the voice decoder and Direwolf from source for AIS.

```bash
docker compose --profile all up -d --build         # ALL decoders in one command
docker compose --profile voice-decoder up -d --build     # digital voice (dsd-fme)
docker compose --profile aprs up -d --build        # APRS (Direwolf)
docker compose --profile ais up -d --build         # Off Grid AIS (Direwolf)
docker compose --profile adsb up -d --build        # Off Grid ADS-B (readsb)
docker compose --profile voice-decoder --profile aprs up -d --build   # or combine profiles freely
docker compose --profile <name> logs -f <service>  # voice-decoder · aprs-decoder · ais-decoder · adsb-decoder
docker compose --profile <name> down && docker compose up -d    # back to no decoders
```

To make a bare `docker compose up` start them without the flag, set
`COMPOSE_PROFILES=all` in your `.env` (see `.env.example`) — it applies to every
compose command in the project, including `down` and `logs`.

## On a second host (radio host)

The radio hub and the voice, APRS and AIS decoders can run on another machine next to
the dongles, while the browser keeps using this one: `compose.radio-host.yaml`. All
traffic between the hosts is TLS with a CA generated for your deployment. The steps
(core host `.env`, exporting the radio host's credentials, starting it) are in
[docs/radio-host.md](radio-host.md).

## Digital voice decoding

P25, DMR, NXDN, D-STAR, YSF, M17 via **`dsd-fme`**. Opt-in because it compiles the patent-encumbered **`mbelib`** vocoder on your machine; the first build takes several minutes. In the SDR view: start a radio, tune a digital channel, click **DIGITAL** — call metadata appears in the decode panel and voice plays. "No sync" with nothing tuned in is expected. Details: [`decoder/README.md`](../decoder/README.md).

## APRS decoding

1200-baud AFSK/AX.25 via **Direwolf** (144.800 MHz Europe, 144.390 MHz North America). Select the radio on your APRS frequency and click **APRS**; packets list below the waterfall and stations plot on the Land map (Land domain must be enabled). Decode keeps running in the background and resumes on restart. Details: [`decoder/aprs/README.md`](../decoder/aprs/README.md).

## Off Grid AIS

Decodes ship AIS off the air with **Direwolf**, so the Sea map works with no internet connection — the off-grid alternative to AISStream.io. Vessels land in the same store as the online feed, so the map, tracks, ship-type icons and warm-start cache behave identically either way.

Both AIS channels are decoded at once. Ships alternate between **A (161.975 MHz)** and **B (162.025 MHz)**, so the backend parks the dongle on their midpoint, demodulates each channel from the same I/Q and interleaves them as stereo into a two-channel Direwolf — decoding one would lose roughly half the traffic.

1. **Settings › SEA › AIS › Off Grid AIS SDR** — pick the radio on your marine antenna.
2. Switch SEA off grid (globally, or via the SEA source override).
3. Open **SEA**. The radio is tuned and decoding starts; it keeps running in the background and resumes on restart.

Needs a VHF marine antenna and line of sight — AIS is line-of-sight, so height beats gain. Note this container **builds Direwolf from source**: the AIS modem only works correctly from 1.8 onward, and Debian's 1.6 package decodes nothing. Details: [`decoder/ais/README.md`](../decoder/ais/README.md).

## Off Grid ADS-B

Decodes 1090 MHz locally with **readsb** fed raw I/Q from a Sentry Pi's `rtl_tcp` — roughly **38 Mbps sustained** on your LAN, so not for constrained links. Setup:

1. **Settings › SDR** — add the Sentry host with its console password.
2. **Settings › AIR › Off Grid ADS-B SDR** — pick the dongle.
3. Switch to **Off Grid** and open **AIR**.

AIR reads aircraft from the `adsb-decoder` sidecar automatically. If the decoder runs outside the compose network, set `ADSB_OFFGRID_URL` in `.env` (e.g. `http://<host>:8090/data/aircraft.json`). Port 8090 is published on 127.0.0.1 only; set `SENTINEL_ADSB_DECODER_ADDRESS=0.0.0.0:8090` to reach it from another machine.

Opening AIR claims the dongle, tunes it to 1090 MHz and holds a TTL lease that self-heals after a replug or Sentry restart and releases when the tab closes. If the map stays empty, the notice at the top of AIR says why. Details: [`decoder/adsb/README.md`](../decoder/adsb/README.md), [ADR 0003](adr/0003-sentry-sdr-lock-and-tune.md).
