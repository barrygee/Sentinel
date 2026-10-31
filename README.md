<img width="1891" height="1063" alt="sentinel-contour-logo-background-large" src="https://github.com/user-attachments/assets/98d0566d-fde8-42ca-bb24-9cc06ce8f882" />

# Sentinel

Sentinel is a real-time, offline-capable surveillance dashboard that puts five sections on one interactive map:

- **Air** — aircraft (ADS-B)
- **Space** — satellites (SGP4), passes and the day/night terminator
- **Sea** — ships (AIS)
- **Land** — APRS stations and the UK repeater directory
- **SDR** — your RTL-SDR radios: spectrum, waterfall, audio and recording

plus **SDR Manager**, which sets up the dongles plugged into this computer and others and shares them with other Sentinels.

Every section has an online and an off-grid data source (switch with **Online / Off Grid** in Settings), and maps you download keep working without internet. How to install it and use each section: [the documentation](docs/index.md), also shown inside the app under **Settings › Docs**.

## Start Sentinel

You need **Docker with Docker Compose**. Nothing else is required to run it.

```bash
git clone https://github.com/barrygee/Sentinel.git && cd Sentinel
docker compose up --build -d
```

Open **http://localhost:8080**. The first build takes a few minutes. Starting only some sections, adding radio decoders and the first settings to make are in [Quick start](docs/install.md).

### Without the in-app docs

The in-app docs (**Settings › Docs**) run in their own container, `docs`, which starts by default. To run Sentinel without it:

```bash
docker compose up --build -d --scale docs=0
```

To leave it out for good, set this in `.env` and use plain `docker compose up -d` from then on:

```bash
SENTINEL_DOCS_REPLICAS=0
```

Without it, Sentinel works the same but the **Docs** entry and the **LEARN MORE** links in Settings are hidden. The same pages are still in [`docs/`](docs/index.md). To bring the docs back, run `docker compose up -d --scale docs=1` (or set `SENTINEL_DOCS_REPLICAS=1`).

## SDR Manager: your dongles

**Settings › SDR** looks after RTL-SDR dongles: the ones plugged into this computer and the ones on other computers, such as a Raspberry Pi by the antenna, all under **SENTINEL HOSTS**. Managing other computers works out of the box. For this computer's own dongles, pick one setup in `.env` (the top of `.env.example` lists them) and start Sentinel as usual:

| Setup                                     | `.env`                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Linux: Sentinel + this computer's dongles | `COMPOSE_PROFILES=sdr-manager-local`                                                        |
| Linux or Pi: SDR Manager only (no map)    | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml` and `COMPOSE_PROFILES=sdr-manager-local` |
| Mac: Sentinel + this Mac's dongles        | `SDR_MANAGER_LOCAL_NATIVE=1`                                                                |
| Mac: SDR Manager only (no map)            | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml` and `SDR_MANAGER_LOCAL_NATIVE=1`         |

With Docker (Linux, or the rest of Sentinel on a Mac):

```bash
docker compose up --build -d
```

Without Docker: on a Mac, Docker Desktop can't reach USB, so SDR Manager runs as a Mac program beside it (`brew install librtlsdr uv` first):

```bash
uv run --project backend sdr-manager-local install    # start now and at every login
uv run --project backend sdr-manager-local status     # check it, with a fix for each problem
```

Guides: [SDR Manager](docs/use/sdr-manager.md) · [Mac, step by step](docs/sdr-manager-mac.md) · [Linux and Pi](docs/sdr-manager-linux.md) · [SDR Manager only](docs/sdr-manager-local-only.md). For developers: [services/sdr-manager-local](services/sdr-manager-local/README.md) and [services/sdr-manager-remote](services/sdr-manager-remote/README.md).

## SDR recordings

The **Record** button (●) in the SDR radio panel saves what you're listening
to: a WAV of the audio and, with **Settings › SDR › Record Raw IQ with
Recordings** on, a raw IQ file of the whole band the radio was receiving. Play,
download and delete them from the panel's **RECORDINGS** tab.

By default they're kept inside Docker, in the `sdr_recordings` volume, where
you can only reach them through the app. To save them to a folder on this
computer instead (to open them in other software, keep them on a bigger disk,
or back them up), set the folder in `.env` and restart the SDR service:

```bash
SENTINEL_RECORDINGS_DIRECTORY=~/SentinelRecordings
docker compose up -d sdr
```

To sort recordings into subfolders such as `satellites/noaa`, set
**Settings › SDR › SDR Options › Recordings Folder**. Changing either setting affects only
new recordings, and nothing already saved is moved. The details are in
[Record](docs/use/sdr/record.md#where-files-go).

## Documentation

The docs are in [`docs/`](docs/index.md), and inside the app under **Settings › Docs**.

| To                                               | Read                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Install Sentinel and make the first settings     | [Quick start](docs/install.md)                                                                                                                                           |
| Use each section                                 | [The screen](docs/use/interface.md), then each section's page                                                                                                            |
| Configure, run and look after it                 | [Environment variables](docs/configuration.md) · [Run and maintain](docs/operations.md) · [Troubleshooting](docs/troubleshooting.md) · [Upgrade](docs/upgrading.md)      |
| Manage your dongles, here and on other computers | [SDR Manager](docs/use/sdr-manager.md) · [Mac](docs/sdr-manager-mac.md) · [Linux and Pi](docs/sdr-manager-linux.md) · [SDR Manager only](docs/sdr-manager-local-only.md) |
| Run the radios on a second machine               | [docs/radio-host.md](docs/radio-host.md)                                                                                                                                 |
| Understand how it works                          | [How it works](docs/architecture/overview.md)                                                                                                                            |
| Work on the code                                 | [Set up for development](docs/development/setup.md) · [CONTRIBUTING.md](CONTRIBUTING.md)                                                                                 |
| See the design decisions                         | [docs/adr/](docs/adr/)                                                                                                                                                   |
