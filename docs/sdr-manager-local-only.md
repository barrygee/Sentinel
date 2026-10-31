# SDR Manager only

A lightweight Sentinel that only manages the dongles plugged into this computer and shares them with other Sentinels: no map, no sections, no radio hub. For a Raspberry Pi by the antenna, or a spare Mac.

## Features

- **One page:** Settings › SDR Manager, with this computer's SDRs and **THIS MACHINE** only, and App Settings trimmed to **Sentinel Location** and **Application Config**.
- **Light:** four containers (credentials, core, gateway, SDR Manager). Map code and tiles are never downloaded.
- **Same settings:** switching to or from the full app keeps your settings and data.
- **Managed from your main Sentinel** as a Sentinel host.

## Switch it on

In `.env`:

| Computer              | Lines                                                                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux or Raspberry Pi | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml` and `COMPOSE_PROFILES=sdr-manager-local`                                                         |
| Mac                   | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml` and `SDR_MANAGER_LOCAL_NATIVE=1`, then `uv run --project backend sdr-manager-local install` once |

Then:

```bash
docker compose up -d --remove-orphans
```

`--remove-orphans` stops the full app's other containers when you switch. Open **http://\<this computer\>:8080**: it opens on Settings › SDR Manager.

First time on this computer? Prepare it first: [Linux and Pi](sdr-manager-linux.md) or [Mac](sdr-manager-mac.md).

## Use it from your main Sentinel

1. Here: set up each dongle (**PUBLIC**, stream on), a **Console Password** and **Sentinel Location** ([how](use/sdr-manager.md#set-up-a-dongle)).
2. On the main Sentinel: **Settings › SDR › + ADD A NEW SENTINEL HOST**, this computer's address, port `8000`, the console password, **ADD**.
3. On the main Sentinel: **Settings › SDR › DEVICES**, **ADD** each dongle you want to listen to.

## Back to the full app

Delete or comment out the `COMPOSE_FILE` line in `.env` (on Linux, keep `COMPOSE_PROFILES=sdr-manager-local` to keep managing this computer's dongles), then `docker compose up -d --remove-orphans`.

## Things to know

- Core logs `core: starting in sdr-manager-local-only mode` (`docker compose logs app`).
- No radio hub here: you can't listen on this computer. Listen from the main Sentinel.
- Without a dongle, try it with two simulated ones: `docker compose -f compose.sdr-manager-local-only.yaml -f compose.sdr-manager-local-mock.yaml --profile sdr-manager-local up -d --build`.

## If it's not working

- **"SDR MANAGER IS NOT RUNNING":** Linux: `COMPOSE_PROFILES` must include `sdr-manager-local`, then `docker compose up -d`. Mac: `uv run --project backend sdr-manager-local status` must be all ticked. Then reload the page.
- **The full app still shows:** `COMPOSE_FILE` isn't set, or you ran `docker compose -f docker-compose.yml …`, which ignores it.
- **The main Sentinel can't reach it:** check port `8000` isn't blocked by a firewall, and the console password.
