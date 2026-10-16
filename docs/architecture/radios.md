# Radios and decoding

From the dongle to the waterfall, the speakers, a recording and a decoder. Code: the radio hub (`services/radio/backend/sentinel_radio/`) and the SDR frontend (`services/sections/sdr/frontend/`).

## Dongle to screen and speakers

*Figure: One radio's samples: one reader in the hub, spectrum frames and raw IQ to the browser.*

```mermaid
flowchart LR
    dongle["RTL-SDR"] --> rtl["rtl_tcp"]
    rtl -- "TCP: IQ" --> bc["radio hub:<br/>one broadcaster per radio"]
    bc --> fft["FFT every ~40 ms"]
    fft -- "/ws/sdr/{id}" --> wf["Browser: spectrum + waterfall"]
    bc -- "/ws/sdr/{id}/iq" --> worklet["Browser audio worklet:<br/>shift, filter, demodulate"]
    worklet --> speakers["Speakers"]
    wf -- "tune, gain, rate" --> bc
    bc -- "5-byte commands" --> rtl
```

- **One broadcaster task per radio** reads the TCP stream and fans out to every subscriber. Several readers on one socket would fail.
- Reads are sized **by time** (~40 ms, ~25 fps), so the frame rate holds when the sample rate changes. FFT size 1024–32768.
- `rtl_tcp` commands are 5 bytes: command byte plus a big-endian uint32.
- The browser demodulates (NFM, WFM, AM, USB, LSB, CW). The worklet's channel filter must always run, or the whole band plays.
- The SDR engine is mounted outside the page, so audio survives navigation.
- Two more sockets: `/ws/sdr/{id}/decode` (events, logs) and `/decode/audio` (decoded voice).

**Sentry:** the hub uses Sentry's HTTP API to list, claim, tune and release dongles, then streams IQ from that dongle's `rtl_tcp` port. Sentry hosts live in `radio.db`; radios are core's `sdr.radios` setting. Design: [ADR 0003](../adr/0003-sentry-sdr-lock-and-tune.md).

## Recordings

- The browser records the WAV (it has the audio, only while squelch is open); the hub captures IQ (it has the samples).
- On stop the browser uploads the WAV; the SDR service then fetches the `.u8` from the hub's `/internal/radio-hub/iq-captures/<id>` (only SDR's credential may) and clears **COPYING IQ…**.
- A 60 s reconcile loop retries copies, stops stray captures and discards uncollected ones. No shared volume, so the hub can run elsewhere.
- Always build paths with `sentinel_sdr.services.recording_folders`; each recording stores its own folder.

## Decoders

The hub demodulates and serves decoders **audio**, like a scanner's speaker output; decoders never touch the dongle.

| Decoder | Program | Hub port | Audio |
|---|---|---|---|
| Voice | dsd-fme | 7355 (+7356 UDP back) | 48 kHz mono |
| APRS | Direwolf | 7357 | 48 kHz mono |
| AIS | Direwolf 1.8 | 7358 | 48 kHz stereo: A left, B right |
| ADS-B | readsb | — | Reads Sentry IQ directly, serves JSON |

*Figure: An APRS decoder from start-up to a station on the Land map.*

```mermaid
sequenceDiagram
    participant Dec as aprs-decoder
    participant Hub as radio hub
    participant Land as land
    Dec->>Hub: GET /api/sdr/aprs/config (X-Decode-Secret)
    Hub-->>Dec: radio, pcmFeed host:port
    Dec->>Hub: connect to pcmFeed
    Hub->>Dec: 48 kHz PCM
    Dec->>Hub: POST /api/sdr/aprs/ingest
    Hub->>Land: decode.aprs.<radioId> (NATS)
```

- Decoders reach the hub through the gateway and learn the PCM socket from `/config`, so nothing hard-codes where the hub runs.
- **APRS and AIS own an absolute channel**: they tune on start, demodulate at the offset for each chunk's real capture frequency, and pull the radio back after ~15 s if moved.
- AIS decodes both channels 50 kHz apart as stereo; one channel loses half the traffic.

## A new decoder kind

No hub code. The container registers a manifest (`POST /api/sdr/decoders/register`): kind, channels, whether it owns them. The hub runs a generic bridge (`manifest_decode.py`) and publishes `decode.<kind>.<radioId>`. A 404 on `/config` means the hub restarted: register again.

You still add: a row in `service_access.py` plus a compose mount of `credentials/<kind>-decoder/`, and a subscriber with its subject in `nats_permissions.py`. Template: `decoder/stub/`, tested in CI by `tests/backend/test_decoder_stub_contract.py`.
