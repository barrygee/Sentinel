# APRS decoder sidecar (Direwolf)

This optional container decodes **APRS** — the 1200-baud AFSK / AX.25 packet mode
(144.800 MHz in Europe, 144.390 MHz in North America) — from the SDR stream and
surfaces received **stations** on the Land map plus **structured packet rows** and
a **raw packet log** in the SDR waterfall panels.

It runs as a **separate, opt-in container**. The main app never depends on it, and
it decodes independently of the digital-voice decoder — so both can run at once
for **concurrent voice + APRS on two dongles**.

## How it fits together

The physical RTL-SDR is reached over a single-client `rtl_tcp` connection, so the
decoder can't open its own. Instead the backend:

1. fans the existing IQ stream to a server-side FM demodulator (the same
   discriminator chain the voice decoder uses — flat audio, no de-emphasis),
2. serves the demodulated **48 kHz mono s16 PCM over TCP** on the internal compose
   network (port **7357**, distinct from the voice feed's 7355 so both listen at
   once),
3. this container's supervisor connects to that PCM feed and **pipes it into
   Direwolf's stdin**; Direwolf decodes the AFSK1200 packets and prints them in
   TNC2 format, which the supervisor parses with **aprslib** and **POSTs** to the
   backend, which stores plottable stations and relays every packet to the
   browser.

```
rtl_tcp ─► backend (FM demod) ─PCM/TCP─► aprs-decoder (Direwolf) ─stdout─► aprslib
                                                                              │
                                          events/HTTP ◄─────────────────────┘
                                              └─► backend ─► Land map + SDR panels
```

Unlike the voice decoder, Direwolf is plain **GPL** software with **no
patent-encumbered vocoder**, so there is nothing legally special about building
this image. It is still opt-in (compose `aprs` profile) so it is only built/run
when APRS decode is actually wanted, and never built in CI.

## Running

```bash
# Build + start the backend and the APRS decoder together:
docker compose --profile aprs up --build -d

# Concurrent voice + APRS (two dongles):
docker compose --profile decoder --profile aprs up --build -d
```

Then, in the SDR UI, enable **APRS** on the radio/dongle tuned to your local APRS
frequency. APRS runs in the background (independent of which radio you are
viewing), continuously feeding the Land map; the choice is persisted and resumes
on restart.

## Environment

| Variable             | Default                                   | Purpose                                      |
| -------------------- | ----------------------------------------- | -------------------------------------------- |
| `IQ_PCM_HOST`        | `app`                                     | Backend PCM feed host                        |
| `IQ_PCM_PORT`        | `7357`                                    | Backend PCM feed port (APRS)                 |
| `INGEST_URL`         | `http://app:8000/api/sdr/aprs/ingest`     | Where decoded packets are POSTed             |
| `CONFIG_URL`         | `http://app:8000/api/sdr/aprs/config`     | Polled `active` gate before launching        |
| `INGEST_SECRET_FILE` | `/run/decoder/secret`                     | Shared auto-generated ingest secret (volume) |
| `APRS_EXTRA_ARGS`    | _(unset)_                                 | Extra `direwolf` flags (space-separated)     |
| `DIREWOLF_CONFIG`    | `/app/direwolf.conf`                      | Direwolf config file passed as `-c`          |

## Troubleshooting

- **No packets, and the container log repeats `launching: direwolf …` every few
  seconds.** Direwolf is exiting during startup; the supervisor now says so
  explicitly (`direwolf exited with status 1 …`) and Direwolf's own error is in
  the lines above. The usual cause is a missing or unreadable config file —
  Direwolf has no built-in defaults and calls `exit(1)` when it cannot open one,
  so `-c` (see `DIREWOLF_CONFIG`) must point at a real file.
- **`Audio input level is too low. Increase so most stations are around 50.`**
  Expected, and harmless. The backend's FM discriminator normalises to ±π
  radians, which puts a 3 kHz-deviation APRS signal around −46 dBFS. Direwolf's
  AFSK demodulator is scale-invariant (its slicers work on ratios), so decode
  performance is unaffected — only the reported level is.
- **Packets in Direwolf's output but nothing on the Land map.** The Land map
  plots position-bearing packets only; status, message and telemetry frames show
  in the SDR panels' raw log but have no fix to plot. Check
  `GET /api/land/aprs/stations`, and that the station was heard within
  Settings › LAND › APRS retention.
