# Add a radio

## What it's for

The **SDR** section turns a cheap USB radio, an **RTL-SDR dongle**, into a wide-band receiver you control from the browser. With a radio added you can:

- see a live picture of a whole band at once: the **spectrum** (signal strength across the band) and the **waterfall** (the same over time, scrolling down);
- tune to any signal and listen ([Listen to a frequency](listen.md));
- save, sort and scan frequencies ([Save and scan frequencies](frequencies.md));
- record what you hear ([Record what you hear](record.md));
- decode digital voice, APRS, AIS and ADS-B ([Decode digital signals](decode.md));
- let other sections use it: tune to an airport, a port or a repeater with one click, or follow a satellite pass.

In these docs, a **radio** is one dongle you have added to Sentinel; **dongle** means the physical USB stick. Sentinel reaches each dongle over your network, so the dongle can sit next to the antenna on another computer, such as a Raspberry Pi.

## Start it

SDR starts with the rest of Sentinel. To run it on its own, start it with the **radio hub**, the service that talks to your radios:

```bash
docker compose up -d gateway sdr radio
```

Without the radio hub you can still see your saved frequencies and recordings, but not the waterfall or audio.

## Before you start

You need:

- an RTL-SDR dongle and an antenna for the band you want to hear;
- a computer the dongle is plugged into, on the same network as Sentinel (it can be the same computer);
- that computer sharing the dongle in one of two ways:
  - **rtl_tcp**, a small program that comes with the RTL-SDR drivers. Start it with `rtl_tcp -a 0.0.0.0 -p 1234`. Use this for a single dongle.
  - **Sentry**, which runs on a Raspberry Pi and shares several dongles. Sentinel can claim a Sentry dongle, tune it and hand it back, which off-grid Air needs.

Each dongle serves one program at a time. If another program (or another Sentinel) is connected to it, Sentinel can't use it.

## Add an rtl_tcp radio

1. Open **Settings › SDR › SDR Devices** and select **+ ADD SDR**.
2. Fill in:
   - **NAME**: a name you'll recognise, such as `Roof RTL-SDR`;
   - **IP ADDRESS**: the address of the computer running `rtl_tcp`;
   - **PORT**: the port `rtl_tcp` listens on, usually `1234`.
3. Leave **STATUS** on **ENABLED** and select **SAVE**.

![The add-radio form in Settings › SDR › SDR Devices, with NAME, IP ADDRESS, PORT and STATUS, and CANCEL and SAVE buttons.](../../images/settings-add-radio.png)
4. Open **SDR** and pick the radio from the list at the top of the radio panel. It shows **CONNECTED** when Sentinel reaches it, and the waterfall starts.

## Add a Sentry host

1. Open **Settings › SDR › Sentry Hosts** and select **+ ADD SENTRY**.
2. Fill in its **IP ADDRESS**, a **LABEL** (such as `Roof Pi`), its **PORT** (usually `8000`) and its **CONSOLE PASSWORD**.
3. Select **SAVE**. Sentinel connects and lists the host's dongles under **Settings › SDR › SDR Devices**.
4. Add each dongle you want to use from that list. For a Sentry dongle you can also set its **OUTPUT PORT**, its **ANTENNA** and **NOTES**. Sentry keeps these, so they are the same in every program that uses it.

## The radio panel at a glance

When you open **SDR**, the radio panel on the left has five tabs:

| Tab | What it's for |
|---|---|
| **RADIO** | Choosing a radio, tuning, listening and recording. Also **FAVOURITES**, **SCANNER** and **SEARCH**. |
| **FREQUENCY MANAGER** | Your saved frequencies. |
| **GROUPS** | Colour-coded groups to sort saved frequencies. |
| **SEARCH RANGES** | Saved ranges to sweep for signals. |
| **RECORDINGS** | Playing, downloading and deleting recordings. |

The spectrum and waterfall fill the rest of the screen.

## Settings

All under **Settings › SDR**:

| Setting | What it does | When to change it |
|---|---|---|
| **Sentry Hosts** | The Sentry hosts Sentinel connects to, with their status. | When you add or move a Sentry host. |
| **SDR Devices** | Your radios. | When you add, rename or remove a radio. |
| **SDR Options** | How the waterfall and recordings behave. See [Listen to a frequency](listen.md#settings) and [Record what you hear](record.md#settings). | — |
| **Frequencies & Groups (JSON)** | Every saved frequency, group and search range in one file. | To edit many at once, or copy them to another Sentinel. |
| **Band Plan (JSON)** | The coloured strip of bands shown along the waterfall. | To match your country's band plan. |

## Troubleshooting

- **The radio says DISCONNECTED.** Check that `rtl_tcp` (or Sentry) is running, that the address and port are right, and that nothing else is connected to the dongle.
- **It connects, then drops, with "USB buffer" errors on a Linux radio computer.** Raise the Linux USB memory limit. As root on that computer: `echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb`.
- **A Sentry host won't connect.** In the radio hub log (`docker compose logs radio`), a refused login means the console password is wrong.
- **A radio in the list reads RESERVED and can't be picked.** It is held for a decoder (APRS, AIS or ADS-B) chosen in another section's settings. Choose a different radio there to free it.
- **No waterfall or sound at all, but saved frequencies show.** The radio hub isn't running: `docker compose up -d radio`.
