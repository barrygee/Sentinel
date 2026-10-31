# SDR Manager on Linux and Raspberry Pi

Manage the RTL-SDR dongles plugged into a Linux computer or a Raspberry Pi. SDR Manager runs in its own container, `sdr-manager-local`, and each dongle streams over `rtl_tcp` for this Sentinel and for others.

## Features

- **Two setups**, picked once in `.env`: the whole of Sentinel plus this computer's dongles, or [SDR Manager only](sdr-manager-local-only.md) for a Pi by the antenna.
- **Plug and play**: dongles appear in **Settings › SDR › SDRS ON THIS MACHINE** as you plug them in.
- **Keeps streaming** while the rest of Sentinel restarts.
- Any 64-bit Linux with Docker: a PC, or a Raspberry Pi 4 or 5 on 64-bit Raspberry Pi OS.

## Prepare the computer (once)

1. **Stop Linux claiming the dongle.** Linux treats an RTL-SDR as a TV tuner unless told not to:

    ```bash
    echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtl-sdr.conf
    sudo modprobe -r dvb_usb_rtl28xxu
    ```

    SDR Manager also detaches the TV driver itself when it can, but the blacklist makes it reliable.

2. **Give USB enough buffer** for several dongles:

    ```bash
    echo 0 | sudo tee /sys/module/usbcore/parameters/usbfs_memory_mb
    ```

    To keep it after a reboot, add `usbcore.usbfs_memory_mb=0` to the kernel command line (Pi: the one line of `/boot/firmware/cmdline.txt`).

3. **Power:** a Pi can't power several dongles. Use a powered USB hub, and the Pi's official power supply.

4. **Install** Docker ([docs.docker.com/engine/install](https://docs.docker.com/engine/install/)) and Git, then add yourself to the `docker` group and log in again:

    ```bash
    sudo usermod -aG docker "$USER"
    ```

## Set it up

```bash
git clone https://github.com/barrygee/Sentinel.git && cd Sentinel
cp .env.example .env
```

In `.env`, set the lines for your setup:

| Setup                              | `.env`                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| Sentinel + this computer's dongles | `COMPOSE_PROFILES=sdr-manager-local` (add decoders after a comma: `sdr-manager-local,adsb`) |
| SDR Manager only                   | `COMPOSE_FILE=compose.sdr-manager-local-only.yaml` and `COMPOSE_PROFILES=sdr-manager-local` |

If `id -u` isn't `1000`, also set `SENTINEL_RUNTIME_USER_ID` and `SENTINEL_RUNTIME_GROUP_ID` to your `id -u` and `id -g`. Then:

```bash
docker compose up --build -d
```

Open **http://\<this computer\>:8080/settings/sdr**. Set a console password if it asks for one; your dongles are then under **SDRS ON THIS MACHINE**. Set them up as in [SDR Manager](use/sdr-manager.md#set-up-a-dongle).

## Replace Sentry

A Pi still running the old Sentry program can't be managed by this Sentinel (it shows **unauthenticated**). Its radios keep streaming meanwhile. To move it to SDR Manager:

1. On the Pi, stop Sentry (in its folder: `docker compose down`).
2. Set up SDR Manager only on the Pi (above).
3. Set the dongles up again in its **SDRS ON THIS MACHINE**, with the same output ports, so existing radios keep working.
4. On your main Sentinel: edit the Pi under **SENTINEL HOSTS** with the new console password, then **APPLY CHANGES**.

## Things to know

- **Ports:** `8000` for SDR Manager, and two per dongle (its output port and the one two above it). Other Sentinels need to reach them; nothing else should.
- **Privileged:** `sdr-manager-local` is the one container that runs as root, privileged and on the host's network, because it drives USB devices and opens a port per dongle. It starts only with its profile.
- **Linux only:** a Mac runs SDR Manager as a Mac program instead ([Mac guide](sdr-manager-mac.md)); Windows can't manage its own dongles.
- **After editing its code:** `docker compose restart sdr-manager-local` (it doesn't reload by itself, which would restart every stream).
- **No dongle?** Try it with two simulated ones: `docker compose -f docker-compose.yml -f compose.sdr-manager-local-mock.yaml --profile sdr-manager-local up -d --build`.
- **Forgotten console password:** `docker compose exec sdr-manager-local python -m sentinel_sdr_manager_local.reset_password`.

## If it's not working

Start with `docker compose logs sdr-manager-local`.

| You see                                                       | Do                                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `port 8000 on 0.0.0.0 is already in use`                      | Something else has port 8000 (Sentry?). Stop it, or set `SDR_MANAGER_LOCAL_HTTP_PORT` |
| `usb_claim_interface error -6`                                | The TV driver has the dongle: step 1 above, then unplug and replug it                 |
| "USB buffer" or "Failed to submit transfer" errors            | Step 2 above                                                                          |
| A dongle comes and goes                                       | Power: use a powered hub                                                              |
| `waiting for core to answer`                                  | Normal while the rest of Sentinel starts                                              |
| `location: core unreachable, keeping the last known position` | Normal while core restarts                                                            |
| Other Sentinels can't reach it                                | A firewall blocks port 8000 or the dongle's ports                                     |
| This Sentinel shows "— not running" for this machine          | A firewall blocks Docker's containers reaching this computer on port 8000             |
