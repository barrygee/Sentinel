# Radios

The SDR section turns cheap RTL-SDR dongles into a wide-band receiver you control from the browser. Sentinel reaches every dongle over your network, so it can sit by the antenna on another computer.

## Features

- **rtl_tcp radios**: one dongle per `rtl_tcp` program.
- **SDR Manager dongles**: dongles on this computer or on an SDR host (a Raspberry Pi sharing several), listed under **DEVICES** to add in one click. Sentinel can claim one, tune it and hand it back. [SDR Manager](../sdr-manager.md) looks after them.
- **Plug and unplug alerts** when an SDR host's dongle appears or disappears.
- **Host sites** on every map, usable as range-ring centres and overhead-alert places.
- **RESERVED** marks a radio held by a decoder, so nothing knocks it off its channel.

## Add an rtl_tcp radio

1. On the computer with the dongle: `rtl_tcp -a 0.0.0.0 -p 1234`.
2. **Settings › SDR › SDR Devices › + ADD SDR**: **NAME**, **IP ADDRESS**, **PORT** (usually `1234`), **SAVE**.
3. Open **SDR** and pick it at the top of the radio panel. It shows **CONNECTED** and the waterfall starts.

![The add-radio form in Settings › SDR › SDR Devices, with NAME, IP ADDRESS, PORT and STATUS, and CANCEL and SAVE buttons.](../../images/settings-add-radio.png)

## Add an SDR host

1. **Settings › SDR Manager › + ADD SDR HOST**: **IP ADDRESS**, **LABEL**, **PORT** (usually `8000`), **CONSOLE PASSWORD**, **ADD** ([more](../sdr-manager.md#remote-sdr-hosts)). This computer's own dongles need no host: they are listed as **This machine**.
2. **Settings › SDR › DEVICES** lists each host's dongles under its name. **ADD** the ones you want.

![Settings › SDR: DEVICES with an SDR host's dongles and + ADD SDR, and SDR OPTIONS below. Docs sits under the section buttons in the left rail.](../../images/settings-sdr.png)

**ADD** is greyed out for a dongle that is private, switched off or has no port on its host: change it in [SDR Manager](../sdr-manager.md#device-settings). **SDR MANAGER** beside a host's name opens it there.

## The radio panel

| Tab | For |
|---|---|
| **RADIO** | Pick a radio, tune, listen, record; **FAVOURITES**, **SCANNER**, **SEARCH** |
| **FREQUENCY MANAGER** | Saved frequencies |
| **GROUPS** | Colour-coded groups |
| **SEARCH RANGES** | Saved ranges to sweep |
| **RECORDINGS** | Play, download, note and delete recordings |

## Tips

- Each dongle serves one program at a time. Another connection shows **DISCONNECTED** here.
- `rtl_tcp` has no password; only share it on a network you trust.
- Without the radio hub (`radio`), saved frequencies and recordings still show, but no waterfall or audio.

## If it's not working

- **DISCONNECTED:** check `rtl_tcp` or the dongle's stream in SDR Manager is on, the address and port, and that nothing else is connected.
- **"USB buffer" errors on a Linux radio computer:** as root there, `echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb`.
- **An SDR host won't connect:** `docker compose logs sdr-manager-remote`. **unauthenticated** means a wrong console password, or a host still running the old Sentry program ([replace it](../../sdr-manager-linux.md#replace-sentry)).
- **RESERVED and can't be picked:** a decoder holds it. Choose another radio in that section's settings.
