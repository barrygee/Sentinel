# Main Sentinel and a Raspberry Pi

Run the whole of Sentinel on your computer, and put a Raspberry Pi with the dongles by the antenna. The Pi runs [SDR Manager only](sdr-manager-local-only.md), the lightweight Sentinel. Your main Sentinel uses the Pi's dongles as radios over the network, and its console password travels over HTTPS.

This guide uses `192.168.5.67` for the Pi. Use your Pi's address wherever you see it.

| Computer                      | Runs                                   | You open                 |
| ----------------------------- | -------------------------------------- | ------------------------ |
| Your computer (main)          | All of Sentinel: maps, sections, radio | http://localhost:8080    |
| Raspberry Pi (`192.168.5.67`) | SDR Manager only: the dongles          | http://192.168.5.67:8080 |

Do the parts in order. Each ends with what you should see.

## 1. Update the main Sentinel

On your computer, in your Sentinel folder:

```bash
git checkout main
git pull
docker compose up --build -d
```

New to Sentinel? Follow the [Quick start](install.md) instead, then come back.

**You should see:** Sentinel at http://localhost:8080, and `docker compose ps` listing every container as running or healthy.

## 2. Prepare the Pi (once)

You need a Raspberry Pi 4 or 5 on **64-bit** Raspberry Pi OS, a powered USB hub for more than one dongle, and the Pi's official power supply.

1. **Fix its address.** On your router, reserve `192.168.5.67` for the Pi (a DHCP reservation). When a Pi's address changes, the main Sentinel stops trusting it until you check its certificate again.
2. **Stop Linux claiming the dongles** as TV tuners:

    ```bash
    echo 'blacklist dvb_usb_rtl28xxu' | sudo tee /etc/modprobe.d/blacklist-rtl-sdr.conf
    sudo modprobe -r dvb_usb_rtl28xxu
    ```

3. **Give USB enough buffer** for several dongles:

    ```bash
    echo 0 | sudo tee /sys/module/usbcore/parameters/usbfs_memory_mb
    ```

    To keep it after a reboot, add ` usbcore.usbfs_memory_mb=0` to the end of the one line in `/boot/firmware/cmdline.txt`.

4. **Install Docker and Git**, and let yourself use Docker:

    ```bash
    curl -fsSL https://get.docker.com | sudo sh
    sudo apt install -y git
    sudo usermod -aG docker "$USER"
    ```

    Log out and in again.

**You should see:** `docker run --rm hello-world` prints "Hello from Docker!".

## 3. Stop the old programs on the Pi

Skip this on a new Pi. If the Pi runs Sentry or another `rtl_tcp` stack, it holds the dongles and port `8000`. In each of their folders:

```bash
docker compose down
```

Note each dongle's port first: give it the same **OUTPUT PORT** in part 5, and radios that already use it keep working.

**You should see:** `docker ps` lists nothing that uses the dongles.

## 4. Install SDR Manager only on the Pi

```bash
git clone https://github.com/barrygee/Sentinel.git && cd Sentinel
cp .env.example .env
```

In `.env`, set:

```
COMPOSE_FILE=compose.sdr-manager-local-only.yaml
COMPOSE_PROFILES=sdr-manager-local
```

If `id -u` or `id -g` isn't `1000`, also set `SENTINEL_RUNTIME_USER_ID` and `SENTINEL_RUNTIME_GROUP_ID` to them. Then:

```bash
docker compose up --build -d
docker compose ps
```

The first build takes a while on a Pi.

**You should see:** `app`, `gateway`, `redis` and `sdr-manager-local` running and healthy, and `docker compose logs sdr-manager-local | grep fingerprint` showing `serving HTTPS on port 8000` and the certificate fingerprint.

## 5. Set up the Pi

From any computer on your network, open **http://192.168.5.67:8080**. It opens on **Settings › SDR Manager**.

1. **Console Password** (**Settings › App Settings › THIS MACHINE**): set one. The main Sentinel signs in with it.
2. **Sentinel Location** (under App Settings): where the Pi is, so maps place it.
3. **Each dongle:** plug it in, then on its row:
    1. the pencil: a **NAME**, its **OUTPUT PORT** (the old port from part 3, or the one suggested), **VISIBILITY: PUBLIC**;
    2. **APPLY CHANGES**;
    3. switch its stream on, **APPLY CHANGES** again.
4. **Certificate** (**App Settings › THIS MACHINE**): open the card and keep the **fingerprint** in view for part 6.

**You should see:** a green dot (**Streaming**) on each dongle.

## 6. Link the Pi to the main Sentinel

On the main Sentinel (http://localhost:8080), **Settings › SDR › DEVICES**.

**If the Pi isn't listed under SENTINEL HOSTS:**

1. **+ ADD A NEW SENTINEL HOST**:

    | Field                | Enter                                                                  |
    | -------------------- | ---------------------------------------------------------------------- |
    | **IP ADDRESS**       | `192.168.5.67`                                                         |
    | **LABEL**            | `Pi`                                                                   |
    | **PORT**             | `8000`                                                                 |
    | **CONSOLE PASSWORD** | the one from part 5                                                    |
    | **ADD SDRS**         | **MANUALLY**, or **AUTOMATICALLY** to make every public dongle a radio |

2. **ADD**. It shows the Pi's **FINGERPRINT**.
3. Compare it with the Pi's Certificate card (its **App Settings › THIS MACHINE**). If they match, **TRUST AND ADD**. If not, stop: something else answers at that address.

**If the Pi is already listed** (from Sentry):

1. Its pencil, then the new **CONSOLE PASSWORD** and **APPLY CHANGES**.
2. **CHECK CERTIFICATE**, compare the fingerprint as above, and trust it.

**You should see:** the Pi under **SENTINEL HOSTS**, with **ENCRYPTED** in its connection security and its dongles below it.

## 7. Use the Pi's dongles

1. On the main Sentinel, **ADD** beside each Pi dongle you want (none with **AUTOMATICALLY**: they are radios already). See [Use a dongle as a radio](use/sdr-manager.md#use-a-dongle-as-a-radio).
2. Pick them where you need them: the SDR panel, and the decoders' sources in **Settings › AIR**, **LAND** and **SEA** ([Decoders](use/sdr/decode.md)).

**You should see:** each Pi dongle as a radio in the SDR panel, with a waterfall when you open it.

## If it's not working

| You see                                         | Do                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| The Pi page doesn't open                        | On the Pi: `docker compose ps`; `COMPOSE_FILE` must be set as in part 4                                                           |
| "SDR MANAGER IS NOT RUNNING" on the Pi          | `COMPOSE_PROFILES=sdr-manager-local` in the Pi's `.env`, then `docker compose up -d`                                              |
| `port 8000 … is already in use` in the Pi's log | An old program still runs: part 3                                                                                                 |
| The main Sentinel can't reach the Pi            | From your computer: `nc -vz 192.168.5.67 8000`. If refused, a firewall blocks port `8000` or SDR Manager isn't running            |
| "doesn't offer HTTPS"                           | The Pi's Sentinel is from before November 2026: on the Pi, `git pull && docker compose up --build -d`, then **CHECK CERTIFICATE** |
| **CERTIFICATE CHANGED**                         | The Pi's credentials were made again (its Docker volumes removed). Compare fingerprints, **CHECK CERTIFICATE**, trust it          |
| **NOT TRUSTED YET**                             | The Pi's address changed: reserve it (part 2), then **CHECK CERTIFICATE**                                                         |
| A dongle's radio connects but stays silent      | Its port: the dongle's **OUTPUT PORT** and the one two above it must be reachable from the main Sentinel                          |
| A dongle comes and goes                         | Power: use a powered hub                                                                                                          |
| A dongle never appears                          | Part 2, steps 2 and 3, then unplug and replug it ([Linux and Pi](sdr-manager-linux.md#if-its-not-working))                        |

Pi logs: `docker compose logs sdr-manager-local`. Forgotten console password: `docker compose exec sdr-manager-local python -m sentinel_sdr_manager_local.reset_password`.

## Update later

On each computer, in its Sentinel folder: `git pull && docker compose up --build -d`. Update both, and check [Upgrade](upgrading.md) for one-off steps.
