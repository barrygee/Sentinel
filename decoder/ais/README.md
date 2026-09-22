# Off-grid AIS decoder sidecar (Direwolf)

Decodes ship AIS transmissions straight off the air with an RTL-SDR, so the Sea
map shows vessels with **no internet connection**. It is the off-grid
alternative to the online [AISStream.io](https://aisstream.io) feed — decoded
vessels land in the same store, so the map, vessel tracks, ship-type icons and
the warm-start cache behave identically whichever source is live.

This is the Sea twin of [`decoder/aprs`](../aprs/README.md): same Debian base,
same supervisor shape. Direwolf is plain GPL software with no patent-encumbered
vocoder, so unlike the digital-voice decoder nothing here is legally gated — it
is opt-in purely so it is only built when wanted. Unlike the APRS sidecar, this
image **compiles Direwolf from source**; see Requirements for why.

## How it works

```
rtl_tcp ──IQ──> backend RadioBroadcaster ──> AisDecodeBridge
                                                │
                     demodulate the SAME chunk twice, at two offsets
                                                │
                            ┌───────────────────┴───────────────────┐
                    A 161.975 MHz                            B 162.025 MHz
                            └──────── interleaved stereo ───────────┘
                                                │
                              48 kHz s16 stereo PCM over TCP :7358
                                                │
                                    direwolf (ACHANNELS 2, MODEM AIS)
                                                │
                            stdout: [0]/[1] AIS>APDW16,NOGATE:{DA!AIVDM,…
                                                │
                                  entrypoint.py → pyais → POST
                                                │
                            /api/sdr/ais/ingest → AIS vessel store → Sea map
```

**Why stereo.** AIS ships alternate between two 25 kHz channels 50 kHz apart, so
a single-channel decoder misses roughly half of all transmissions. Both channels
fall inside one RTL-SDR span, so the backend parks the dongle on their midpoint
(162.000 MHz), demodulates each channel from the same IQ, and interleaves the
results. Direwolf reads stdin as `ACHANNELS`-wide interleaved audio: left
becomes channel 0 (AIS A), right becomes channel 1 (AIS B). Measured isolation
between the two is ~57 dB.

**Why the backend does the demodulation.** The physical dongle is reached over a
single-client `rtl_tcp` connection, so the sidecar cannot open its own. It
subscribes to nothing and dials nothing but the backend: the bridge fans out the
IQ it already has.

## Running it

The container is opt-in behind a compose profile, so it is never built by
default or in CI:

```bash
docker compose --profile ais up -d --build      # off-grid AIS only
docker compose --profile ais --profile aprs up -d   # AIS + APRS together
```

Voice, APRS and AIS decode independently, so all three profiles can run at once
given a dongle each.

Then, in the app:

1. **Settings › SEA › AIS › Off Grid AIS SDR** — pick the radio that is on the
   marine antenna.
2. Set the Sea domain to off grid (globally via connectivity mode, or per-domain
   via the SEA source override).
3. Open the **Sea** section. The radio is tuned to 162.000 MHz and decoding
   starts; it then keeps running in the background, and resumes after a restart.

Decode stops when you clear the radio in Settings.

## Requirements

- **Direwolf 1.8+, built from source** (the image does this; nothing to install).
  The AIS modem arrived in 1.6, but it did not actually *work* until 1.8:
  1.6 and 1.7 flag AIS with a sentinel baud rate (39999) and never reset it to
  the real 9600, so the demodulator is initialised with the wrong symbol rate
  and decodes nothing. Direwolf announces the problem itself at startup —

  ```
  Channel 0: 39999 baud, AIS, +, 48000 sample rate x 4.
  The ratio of audio samples per sec (48000) to data rate in baud (39999) is 1.2
  There is little hope of success with such a low ratio.
  ```

  — which is worth knowing, because Debian bookworm's packaged `direwolf`
  (1.6+dfsg-3) has exactly this bug. A correct startup says `9600 baud, AIS` on
  both channels. That is why this image builds 1.8.1 rather than using the
  distro package the APRS sidecar happily relies on.
- **A VHF marine antenna.** AIS is at 162 MHz; a 2 m ham or scanner whip will
  hear strong nearby traffic but little else. Range is line-of-sight, so height
  matters far more than gain — expect ~10–20 NM at ground level, much more from
  a mast or a hill.
- **Bandwidth.** The dongle must sample wide enough to cover both channels:
  anything at or above ~1 Msps does, and Sentinel's default 2.048 Msps is
  comfortable.

A note on audio rate: the PCM spine serves 48 kHz, giving 5 samples per symbol
at 9600 baud. Direwolf accepts this (it upsamples x3 internally) but reports
"Increasing the sample rate should improve decoder performance" — so marginal
signals may decode slightly better if the spine's output rate is raised later.
Nothing needs changing for normal use.

## Configuration

Everything is wired by compose defaults; these are the overrides.

| Variable | Default | Purpose |
| --- | --- | --- |
| `IQ_PCM_HOST` / `IQ_PCM_PORT` | `app` / `7358` | Backend stereo PCM feed |
| `INGEST_URL` | `http://app:8000/api/sdr/ais/ingest` | Where decoded events are POSTed |
| `CONFIG_URL` | `http://app:8000/api/sdr/ais/config` | Polled `active` gate |
| `INGEST_SECRET` | — | Explicit shared secret (overrides the file) |
| `INGEST_SECRET_FILE` | `/run/decoder/secret` | Auto-generated secret, shared volume |
| `DIREWOLF_CONFIG` | `/app/direwolf.conf` | Direwolf config (two-channel AIS) |
| `AIS_EXTRA_ARGS` | — | Extra `direwolf` args, space-separated |

The channel frequencies and demod bandwidth are backend settings
(`ais_channel_a_hz`, `ais_channel_b_hz`, `ais_decoder_default_bw_hz`), not
container env — the bridge owns the tuning.

## Troubleshooting

**Nothing decodes, and the log shows Direwolf relaunching every few seconds.**
It is exiting during startup. The supervisor prints an explicit line when a run
ends in under 5 seconds; the cause is almost always the config file (Direwolf
has no built-in defaults and exits if it cannot open one) or the audio output
device (it opens one even receive-only, which is why the image points ALSA at
`null`).

**Direwolf runs, but no vessels appear.** Check `on_channel` in
`GET /api/sdr/ais/status/{radio_id}`. False means something moved the dongle off
162 MHz — a viewer sweeping the band, or a satellite auto-tune — and the bridge
is decoding silence; it pulls the radio back within ~15 seconds. If it is true
and traffic is still absent, suspect the antenna: AIS at 162 MHz needs a marine
antenna and line of sight to the water.

**Vessels on one channel only.** The log labels each frame `[A]` or `[B]`. All
traffic on one side usually means the span has drifted so only one channel is
inside the usable portion, or the dongle's tuner is rolling off one edge.

**`ingest POST failed: HTTP Error 409`.** Expected while idle: it means no AIS
decode session is active, so the backend has nothing to route events to. The
supervisor does not log 409s; if you see one it came from somewhere else.
