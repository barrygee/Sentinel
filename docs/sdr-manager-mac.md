# SDR Manager on a Mac

Plug an RTL-SDR dongle into your Mac and use it in Sentinel. This guide assumes you have never used Terminal: do one step at a time, and check you see what each step says before going on. It takes about 45 minutes, most of it waiting for downloads.

You need:

- A Mac with an Apple chip (M1 or newer) or an Intel chip, on one of the three newest versions of macOS.
- An RTL-SDR dongle and its antenna.
- An internet connection, and your Mac's login password.

Words you may not know are explained in the [glossary](#glossary) at the end.

## 1. Check your Mac

1. Click the **Apple menu** (top left of the screen), then **About This Mac**.
2. Note the **Chip** (or **Processor**) and the **macOS** version.

**You should see:** a chip such as "Apple M2" or "Intel Core i5", and a macOS name and number. If your macOS is older than the three newest, update it first in **System Settings › General › Software Update**.

## 2. Install Docker Desktop

1. Go to [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) and download **Docker Desktop for Mac**: pick **Apple Silicon** for an Apple chip, **Intel Chip** for an Intel one.
2. Open the downloaded file, then drag the **Docker** whale into **Applications**.
3. Open **Docker** from Applications. Accept the terms, and choose the recommended settings. You don't need a Docker account: skip signing in.
4. Wait.

**You should see:** "Engine running" at the bottom left of the Docker Desktop window, and a whale in the menu bar at the top of the screen.

Keep Docker Desktop running whenever you use Sentinel. To have it start by itself: in Docker Desktop, **Settings** (the gear) › **General** › **Start Docker Desktop when you sign in to your computer**.

## 3. Open Terminal

1. Press **Command (⌘) + Space**, type `Terminal`, and press **Return**.

**You should see:** a window with a line ending in `%`. That is where you type commands. To run a command from this guide, copy it from its grey box, paste it into Terminal (**⌘ + V**) and press **Return**. Wait for the `%` line to come back before the next one.

## 4. Install Homebrew

Homebrew installs the programs the dongle needs. Paste this into Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

1. When it asks for your **Password**, type your Mac's login password and press **Return**. Nothing shows while you type: that is normal.
2. Press **Return** when it asks you to continue. It may install Apple's Command Line Tools first; that can take 10 minutes.
3. At the end, if it shows **Next steps** with lines to run, copy those lines (they start with `echo` and `eval`) and run them. Intel Macs may have no next steps.
4. Close Terminal (**⌘ + Q**) and open it again (step 3).

**You should see:** `Installation successful!` near the end. Then this prints a version number such as `Homebrew 4.6.0`:

```bash
brew --version
```

## 5. Install the dongle's programs

```bash
brew install librtlsdr uv git
```

**You should see:** several downloads, then the `%` line again, with no line starting `Error`.

## 6. Check the dongle

1. Plug the dongle into your Mac, straight in or through a powered USB hub.
2. Run:

```bash
rtl_test -t
```

**You should see:** `Found 1 device(s):` and your dongle's name. A line such as `No E4000 tuner found, aborting.` after it is fine. If it says `No supported devices found`, unplug the dongle, plug it into another USB port, and try again.

## 7. Download Sentinel

```bash
git clone https://github.com/barrygee/Sentinel.git ~/Sentinel
cd ~/Sentinel
```

**You should see:** `Receiving objects: 100%` and the `%` line again. Every command from here on runs in this folder: if you close Terminal, run `cd ~/Sentinel` first when you open it again.

## 8. Choose your setup

1. Make your settings file and open it in TextEdit:

```bash
cp .env.example .env
open -e .env
```

2. Near the top, find this line:

```
SDR_MANAGER_LOCAL_NATIVE=0
```

3. Change the `0` to `1`:

```
SDR_MANAGER_LOCAL_NATIVE=1
```

4. **Only if you want SDR Manager without the rest of Sentinel** (no maps, just sharing this Mac's dongles with other Sentinels): find the line `# COMPOSE_FILE=compose.sdr-manager-local-only.yaml` and delete the `#` and the space at its start.
5. Save (**⌘ + S**) and close TextEdit.

**You should see:** nothing in Terminal; this step only changes the file.

## 9. Start Sentinel

```bash
docker compose up --build -d
```

The first time, this takes 10 to 20 minutes.

**You should see:** a list of lines ending `Started` or `Healthy`, such as `✔ Container sentinel-app  Healthy`, and no line saying `Error`.

## 10. Start SDR Manager

This starts SDR Manager now, and every time you log in to your Mac:

```bash
uv run --project backend sdr-manager-local install
```

The first time, it spends a minute or two setting itself up.

**You should see:** `SDR Manager now starts at login, and is starting now.` macOS may also show a notification, **Background Items Added**: that is SDR Manager. If macOS asks whether to **accept incoming network connections**, click **Allow**.

## 11. Check everything

```bash
uv run --project backend sdr-manager-local status
```

**You should see:** a ✓ beside every line, and `Everything looks right.` at the end:

```
SDR Manager on this Mac

  ✓ This computer   a Mac
  ✓ librtlsdr       loaded from /opt/homebrew/lib/librtlsdr.dylib
  ✓ rtl_tcp         /opt/homebrew/bin/rtl_tcp
  ✓ rtl_eeprom      /opt/homebrew/bin/rtl_eeprom
  ✓ RTL-SDRs        1 RTL-SDR plugged in
  ✓ .env            SDR_MANAGER_LOCAL_NATIVE=1
  ✓ Start at login  running (process 4242)
  ✓ SDR Manager     answering on port 8000

Everything looks right.
```

A ✗ comes with a **Fix:** line under it: do what it says, then run `status` again. For more detail, run the same command with `doctor` instead of `status`.

## 12. Open SDR Manager

1. Open Safari (or Chrome) and go to **http://localhost:8080/settings/sdr**.

**You should see:** **Settings › SDR**, with your dongle under **SENTINEL HOSTS › This machine**, marked **NOT SET UP**. If it asks for a console password, set one first (**SET A PASSWORD**).

## 13. Set a console password

1. In **Console Password**, type a password of 8 characters or more in **NEW PASSWORD** and again in **REPEAT IT**.
2. Click **SAVE PASSWORD**.

**You should see:** "Last changed" and the time. Keep the password: other Sentinels that use this Mac's dongles need it.

## 14. Name and switch on the dongle

1. Under **Devices**, click the pencil beside the dongle.
2. Type a **NAME**, such as `Mac RTL-SDR`. Leave **OUTPUT PORT** as suggested.
3. Under **VISIBILITY**, click **PUBLIC**.
4. Click **APPLY CHANGES** (bottom right). It shows **READY**.
5. Click the switch beside the dongle, then **APPLY CHANGES** again.

**You should see:** **STREAMING** beside the dongle.

## 15. Set Sentinel's location

1. Go to **Settings › App Settings › Sentinel Location**.
2. Type your latitude and longitude, then **APPLY CHANGES**. To find them, right-click your home in Google Maps in your browser: the first line of the menu is the latitude, then the longitude.

**You should see:** the "location is not set" notice gone from **Settings › SDR**.

**Done.** To listen to the dongle in Sentinel: **Settings › SDR › DEVICES**, then **ADD** beside it, and open **SDR** ([Radios](use/sdr/add-a-radio.md)). Everything else SDR Manager does: [SDR Manager](use/sdr-manager.md).

## Everyday use

- SDR Manager starts by itself when you log in. Sentinel starts when Docker Desktop does.
- Open Sentinel at **http://localhost:8080**.
- Plug a dongle in or out at any time: it appears or shows **NOT PLUGGED IN** within a few seconds.
- Stop Sentinel: `docker compose down` (in `~/Sentinel`). Your settings are kept.

## Update

```bash
cd ~/Sentinel
git pull
docker compose up --build -d
uv run --project backend sdr-manager-local install
```

The last line restarts SDR Manager on the new version.

## Remove

```bash
cd ~/Sentinel
uv run --project backend sdr-manager-local uninstall
docker compose down -v
```

`-v` deletes Sentinel's data and settings. Then drag the `Sentinel` folder (in your home folder) to the Bin, and, if you like, the `Sentinel` folders in `~/Library/Application Support` and `~/Library/Logs`.

## If it's not working

| You see                                     | Do                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `command not found: brew`                   | Run Homebrew's **Next steps** (step 4), then close and reopen Terminal                                                              |
| `command not found: uv` or `rtl_test`       | `brew install librtlsdr uv git`                                                                                                     |
| `Cannot connect to the Docker daemon`       | Open Docker Desktop and wait for "Engine running"                                                                                   |
| `no configuration file provided`            | You aren't in the Sentinel folder: `cd ~/Sentinel`                                                                                  |
| `status`: **RTL-SDRs** none plugged in      | Plug the dongle in again, or into another port                                                                                      |
| `status`: **.env** is not 1                 | Step 8, then `docker compose up -d`                                                                                                 |
| `status`: **SDR Manager** not answering     | `uv run --project backend sdr-manager-local install`; still not? Read the log: `open ~/Library/Logs/Sentinel/sdr-manager-local.log` |
| `doctor`: **Port 8000** used by another app | Quit that app, or add `SDR_MANAGER_LOCAL_HTTP_PORT=8001` to `.env`, then run the **Update** commands                                |
| No dongles under **This machine** in Settings › SDR | Run `status`; when it is all ticked, wait 10 seconds and reload the page                                                            |
| "SDR MANAGER IS NOT RUNNING"                | The same                                                                                                                            |
| The dongle never shows **STREAMING**        | Its **OUTPUT PORT** is in use: pick another, then **APPLY CHANGES**                                                                 |
| The page doesn't open                       | Docker Desktop isn't running, or step 9 failed: run it again                                                                        |

Still stuck? Run `uv run --project backend sdr-manager-local doctor` and `docker compose logs --since 15m > sentinel-logs.txt`, and send both with your question on [GitHub](https://github.com/barrygee/Sentinel/issues).

## Glossary

| Word                  | Means                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| **Terminal**          | The Mac app where you type commands                                   |
| **Command**           | A line of text you paste into Terminal and run with **Return**        |
| **Homebrew** (`brew`) | A free installer for programs like the dongle's                       |
| **Docker Desktop**    | The app that runs Sentinel's parts in containers                      |
| **Container**         | One part of Sentinel, running in Docker                               |
| **Dongle**            | The USB radio receiver (RTL-SDR)                                      |
| **librtlsdr**         | The program that talks to the dongle                                  |
| **SDR Manager**       | The part of Sentinel that looks after your dongles                    |
| **`.env`**            | Sentinel's settings file for this computer                            |
| **localhost**         | This computer, in a web address                                       |
| **Port**              | A numbered door on a computer that a program listens on, such as 8080 |
| **Console password**  | The password that protects SDR Manager                                |
