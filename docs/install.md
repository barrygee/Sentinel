# Quick start

You need [Docker](https://www.docker.com/products/docker-desktop/) (with Docker Compose) and Git.

## Start

```bash
git clone https://github.com/barrygee/Sentinel.git
cd Sentinel
cp .env.example .env
docker compose up --build -d
```

Open **http://localhost:8080**. The first build takes a few minutes; after that, `docker compose up -d` starts it.

## First things to set

In **Settings** (the gear, bottom right), then **APPLY CHANGES**:

1. **App Settings › Sentinel Location**: your latitude and longitude.
2. **SPACE › Online Data Source**: pick a category, then **UPDATE TLE**.
3. **SEA › AIS Data API Key**: a free key ([how](use/sea.md#add-your-aisstream-key)).
4. **SDR › SDR Devices**: your radio, if you have one ([how](use/sdr/add-a-radio.md)).

Air works straight away. Land starts switched off ([switch it on](use/land.md#switch-land-on)).

## Run only some sections

```bash
docker compose up -d gateway air sea           # just these
docker compose up -d gateway sdr radio         # SDR needs the radio hub
docker compose up -d --scale land=0            # everything but one
docker compose up -d --scale docs=0            # without the in-app docs
```

The in-app docs (Settings › DOCS) are their own service, `docs`, started by default. Leave it out and Sentinel runs without them: no DOCS entry and no LEARN MORE links. To leave it out for good, set `SENTINEL_DOCS_REPLICAS=0` in `.env`.

## Add decoders

Each decoder needs its own dongle. See [Decoders](decoders.md).

```bash
docker compose --profile all up -d --build     # or: adsb, ais, aprs, voice-decoder
```

## Stop

```bash
docker compose down     # your data is kept
```
