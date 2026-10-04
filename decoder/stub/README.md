# Stub decoder

A stand-in decoder container. It decodes nothing; it follows the **decoder
contract** a manifest-declared kind uses with the radio hub, so that contract can
be tested end to end without `mbelib` (dsd-fme) or a real over-the-air signal
(Direwolf).

| Step | Call | Notes |
|---|---|---|
| Register | `POST /api/sdr/decoders/register` | manifest with `decoderKind: "stub"`, PCM on `PCM_PORT` |
| Wait | `GET /api/sdr/decoders/stub/config` | idles until `active`; a **404** means the hub forgot the kind (it restarted), so the stub registers again |
| Read | TCP `PCM_HOST:PCM_PORT` | 48 kHz s16 LE PCM, mono (or stereo for two absolute channels) |
| Ingest | `POST /api/sdr/decoders/stub/ingest` | one `{frames, rms, peak}` summary per `REPORT_SECONDS` of PCM |

All calls carry the shared decoder secret (`X-Decode-Secret`), the same one the
voice, APRS and AIS sidecars use. The hub publishes each event on the bus as
`decode.stub.<radioId>` and relays it to the SDR panel's `/ws/sdr/{id}/decode`
socket.

## Run it

```bash
docker compose --profile decoder-stub up --build -d
# start the stub kind on a radio (radio id 1 here); relative kinds take an offset
curl -X POST localhost:8080/api/sdr/decoders/stub/start \
     -H 'content-type: application/json' -d '{"radio_id": 1}'
docker compose logs -f stub-decoder
```

Without Docker, from the repo root (the secret is whatever the backend uses —
set `DECODER_INGEST_SECRET` on the backend to pin it):

```bash
HUB_URL=http://localhost:8080 PCM_HOST=localhost INGEST_SECRET=… python decoder/stub/entrypoint.py
```

## Configuration

| Variable | Default | |
|---|---|---|
| `HUB_URL` | `http://app:8000` | the radio hub (today: the app) |
| `PCM_HOST` / `PCM_PORT` | `app` / `7370` | where the hub serves this kind's PCM |
| `STUB_CHANNELS_HZ` | empty | empty = `ownership: relative` mono; one frequency = `absolute` mono; two = `absolute` stereo |
| `REPORT_SECONDS` | `1.0` | PCM per summary event |
| `POLL_SECONDS` | `2.0` | config poll interval |
| `INGEST_SECRET` / `INGEST_SECRET_FILE` | — / `/run/decoder/secret` | the shared decoder secret |
