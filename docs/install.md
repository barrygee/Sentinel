# Quick start

You need [Docker](https://www.docker.com/products/docker-desktop/) (with Docker Compose) and Git. Nothing else.

## Start everything

```bash
git clone https://github.com/barrygee/Sentinel.git
cd Sentinel
cp .env.example .env
docker compose up --build -d
```

Open **http://localhost:8080**. The first build takes a few minutes; after that, start Sentinel with `docker compose up -d`.

## Start some sections

Name the sections you want, plus `gateway`:

```bash
docker compose up -d gateway air               # one section
docker compose up -d gateway air sea space     # several
docker compose up -d gateway sdr radio         # SDR needs the radio hub too
docker compose up -d --scale land=0            # everything except one
```

The section names are `air`, `space`, `sea`, `land` and `sdr`.

## Add decoders

Decoders read signals from your own radio. Each needs its own dongle.

```bash
docker compose --profile all up -d --build     # all of them
docker compose --profile adsb up -d --build    # or one: adsb, ais, aprs, voice-decoder
```

## Stop

```bash
docker compose down
```

Your data is kept.

## The config file

Every setting lives in one file, which Sentinel keeps up to date and reads back when you save it:

```text
backend/data/sentinel_config.json
```

Edit it in a text editor, or in the browser at **Settings › App Settings › Application Config** (**EDIT**, then **APPLY CHANGES**). For example, Land starts switched off; set `"enabled": true` under `"land"` to switch it on. More in [Edit the config file](use/config-file.md).

Settings about how Sentinel runs on this computer, such as where recordings are saved, are in `.env` instead. Each one is described in `.env.example`.

## First things to set

In **Settings** (the gear, bottom right):

1. **App Settings › Sentinel Location**: your latitude and longitude, then **APPLY CHANGES**.
2. **SPACE › Online Data Source**: pick a category, then **UPDATE TLE** to load satellites.
3. **SEA › AIS Data API Key**: a free key from AISStream, for ships ([how](use/sea.md#add-your-aisstream-key)).
4. **SDR › SDR Devices**: your radio, if you have one ([how](use/sdr/add-a-radio.md)).

Air works straight away.

## Next

- [Find your way around the screen](use/interface.md)
- [Run Sentinel with no internet](tasks/no-internet.md)
- [Troubleshooting](troubleshooting.md), if something doesn't start
