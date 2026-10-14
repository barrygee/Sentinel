# Stub decoder

A stand-in decoder container. It decodes nothing; it follows the **decoder
contract** a manifest-declared kind uses with the radio hub, so that contract can
be tested end to end without `mbelib` (dsd-fme) or a real over-the-air signal
(Direwolf).

| Step | Call | Notes |
|---|---|---|
| Register | `POST /api/sdr/decoders/register` | manifest with `decoderKind: "stub"`, PCM on `PCM_PORT` |
| Wait | `GET /api/sdr/decoders/stub/config` | idles until `active`; a **404** means the hub forgot the kind (it restarted), so the stub registers again |
| Read | TCP `pcmFeed` from the config reply | 48 kHz s16 LE PCM, mono (or stereo for two absolute channels), on the host the hub registered |
| Ingest | `POST /api/sdr/decoders/stub/ingest` | one `{frames, rms, peak}` summary per `REPORT_SECONDS` of PCM |

HTTP goes through Sentinel's gateway, so the stub reaches the hub wherever the
`radio` service runs. All calls carry the stub's own decoder credential
(`X-Decode-Secret`), which the hub accepts for the `stub` kind only, as the
voice, APRS and AIS sidecars carry theirs. The hub publishes each event on the bus as
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

Without Docker, `tests/backend/test_decoder_stub_contract.py` runs the stub
against the test suite's in-process app (no radio, no mbelib); CI runs it on
every PR:

```bash
uv run --project backend pytest tests/backend/test_decoder_stub_contract.py
```

## Configuration

| Variable | Default | |
|---|---|---|
| `SENTINEL_GATEWAY_URL` | `http://gateway:8080` | Sentinel's gateway, which routes to the radio hub |
| `PCM_PORT` | `7370` | the PCM port the manifest declares (the hub listens on it) |
| `STUB_CHANNELS_HZ` | empty | empty = `ownership: relative` mono; one frequency = `absolute` mono; two = `absolute` stereo |
| `REPORT_SECONDS` | `1.0` | PCM per summary event |
| `POLL_SECONDS` | `2.0` | config poll interval |
| `DECODER_CREDENTIALS_FILE` | `/run/service-credentials/http-credentials.json` (compose) | its own credential, accepted for the `stub` kind only |
