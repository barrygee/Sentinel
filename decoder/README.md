# Digital-voice decoder sidecar (dsd-fme)

This optional container decodes **digital voice** protocols — P25, DMR,
NXDN, D-STAR, YSF, M17, EDACS — from the SDR stream and surfaces decoded **call
metadata** (mode, talkgroup, source ID, colour code, sync) plus **decoded voice
audio** in the Sentinel SDR UI.

It runs as a **separate, opt-in container**. The main app never depends on it.

## How it fits together

The physical RTL-SDR is reached over a single-client `rtl_tcp` connection, so the
decoder can't open its own. Instead the backend:

1. fans the existing IQ stream to a server-side FM demodulator,
2. serves the demodulated **48 kHz mono PCM over TCP** (the SDR++ "TCP audio
   sink" convention) on the internal compose network,
3. `dsd-fme` (this container) connects to that PCM feed, decodes it, sends
   **decoded voice back over UDP**, and this container's supervisor parses
   dsd-fme's log and **POSTs decoded events** to the backend, which relays both
   to the browser.

```
rtl_tcp ─► backend (FM demod) ─PCM/TCP─► decoder (dsd-fme) ─voice/UDP─► backend ─► browser
                                              └─events/HTTP─────────────► backend ─► browser
```

## ⚠️ Patent / licensing note — read before building

`dsd-fme` **requires** `mbelib` to compile (`find_package(MBE REQUIRED)`).
`mbelib` implements the **AMBE/IMBE vocoders**, which are **patent-encumbered** —
its own README states it is "provided for educational purposes only" and that
compiled objects "may be covered by one or more patents."

Consequences, by design:

- There is **no metadata-only build** of dsd-fme that omits mbelib.
- This image is therefore **opt-in only**: gated behind the compose `voice-decoder`
  profile, **never built by default, never built in CI, never published**.
- **Building it is a deliberate local action that compiles mbelib on your own
  machine.** The resulting image layers stay local. `.gitignore` / the build
  context's `.dockerignore` block any compiled `*.so`/mbelib artifact from being
  committed.

You are responsible for confirming your right to build and use these codecs in
your jurisdiction. A **license-clean alternative** is a hardware AMBE dongle —
see "Hardware AMBE dongle" below.

## Step-by-step: enabling digital decode

All commands run from the **repo root**. No configuration is required — the
ingest secret is auto-generated (see "Security" below).

### 1. Build and start the app **with** the decoder

The decoder only builds/starts when you pass `--profile voice-decoder`:

```bash
docker compose --profile voice-decoder up --build -d
```

This builds the decoder image — i.e. **compiles mbelib + dsd-fme locally** (the
opt-in step) — and starts it alongside the app on the internal network. Your
normal `docker compose up --build` is unchanged and never touches the decoder.

### 2. Use it

1. Open the app (http://localhost:8080), go to **SDR**, and start a radio.
2. Tune to a known digital channel (e.g. a DMR/P25 control or voice channel).
3. Click the **DIGITAL** button (next to REC). The decoded-events panel fills
   with mode/talkgroup/IDs/sync, and decoded **voice audio** plays.

### 3. Stop / revert

```bash
docker compose --profile voice-decoder down        # stop everything incl. decoder
docker compose up -d                          # back to app-only (no decoder)
```

Because the decoder is profile-gated, plain `docker compose up` never starts it.

## Hardware AMBE dongle (license-clean alternative)

Instead of the software mbelib vocoder, dsd-fme can use a hardware **DVSI
AMBE-3000 / USB-3000** dongle (ThumbDV, DVstick 30). The vocoder license lives in
the chip, so no patented software is relied on at runtime.

1. Plug the dongle in and find its device path (e.g. `/dev/ttyUSB0`).
2. In `docker-compose.yml`, uncomment the `devices:` mapping under the `voice-decoder`
   service and point it at your dongle.
3. Add the matching dsd-fme dongle flag via the environment, e.g.
   `DSD_EXTRA_ARGS=-D /dev/ttyUSB0` (consult `dsd-fme -h` for your version).
4. Rebuild/restart: `docker compose --profile voice-decoder up --build -d`.

(Note: mbelib is still compiled because dsd-fme requires it to build; the dongle
simply takes over the actual vocoding at runtime.)

## Security

The decoder authenticates its config polls and event POSTs to the radio hub
with its own credential, so nothing else on the network can inject fake decoded
calls — not even another decoder, since the hub accepts each decoder's
credential for its own kind only. **You don't set it:** on every `docker compose
up` the one-shot `service-credentials` service generates it into the
`service_credentials` volume, and the decoder mounts only its own folder
(`services/voice-decoder/`) read-only and reads it on launch
(`DECODER_CREDENTIALS_FILE`). The hub knows it only by its SHA-256 hash; see
`backend/platform/service_access.py`.

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `DSD_EXTRA_ARGS` | `decoder` env | Extra `dsd-fme` flags (e.g. dongle) |
| `SENTINEL_GATEWAY_URL` | `.env` (optional) | Sentinel's gateway (default `http://gateway:8080`); config and ingest go through it |
| `MBELIB_REF` / `DSDFME_REF` | build args | Pin the upstream git refs for reproducibility |

The backend ports (`DECODER_PCM_PORT` 7355, `DECODER_AUDIO_UDP_PORT` 7356) are
set in `docker-compose.yml` and only need changing if they clash on your host.
The decoder doesn't need to be told them, or which container hosts the radio
hub: the hub's decode-config reply names both sockets (`pcmFeed`,
`voiceAudioReturn`) by the address the hub registered with Sentinel.

## Troubleshooting

- **DIGITAL on but no decoded events / "decoder offline":** the decoder isn't
  reachable. Confirm you started with `--profile voice-decoder` and check
  `docker compose --profile voice-decoder logs voice-decoder`. A `401` or `403` there
  means its credential doesn't match the hub's list (the `service_credentials`
  volume was recreated after the decoder started):
  `docker compose --profile voice-decoder up -d --force-recreate voice-decoder`.
- **No voice audio but metadata appears:** the channel may be encrypted, or the
  decoder may need a hardware dongle/specific flags for that protocol.
- **Log format yields no events:** dsd-fme's wording varies by version. Pin
  `DSDFME_REF` and adjust the patterns in `entrypoint.py` (`parse_dsd_line`).

## End-to-end verification (manual)

Automated tests cover the backend DSP/bridge and the event parser, but a true
end-to-end check needs a **real digital signal** and cannot run in CI:

1. `docker compose --profile voice-decoder up --build -d`
2. Tune to a known DMR/P25 control channel, enable **DIGITAL**.
3. Confirm decoded-event rows populate and (for unencrypted voice) audio plays.
