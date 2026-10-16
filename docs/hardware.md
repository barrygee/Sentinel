# Choose radios and hardware

Use this page to work out what to buy and how to connect it before you add radios to Sentinel. Online, you need no radio at all: Air, Space, Sea and Land's repeater list all work from internet sources. A radio adds listening, recording, decoding, and everything off grid.

## What you need for each job

Each dongle does one job at a time. A decoder holds its dongle for as long as it runs, so plan **one dongle per decoder** plus one for listening.

| You want to | Dongle | Antenna | Also needs |
|---|---|---|---|
| Listen to, record and scan frequencies | One, any RTL-SDR | One that suits the band you listen to | — |
| Follow satellite passes and record them | Shares the listening dongle | Ideally a satellite antenna (V-dipole or turnstile for 137 MHz weather satellites) | — |
| See aircraft off grid | One, on a [Sentry](reference/glossary.md#radio-and-signals) host (see below) | 1090 MHz | The `adsb` decoder |
| See ships off grid | One, full time | Marine VHF, about 162 MHz, mounted high | The `ais` decoder |
| See APRS stations | One, full time | 2 m (144 MHz) | The `aprs` decoder |
| Hear digital voice (DMR, P25 and others) | One, while decoding | One that suits the band | The `voice-decoder` decoder |

So listening plus every decoder is five dongles. Start with one for listening and add others when you want a decoder.

## Dongles

Sentinel works with **RTL-SDR** USB dongles, which receive roughly 25 MHz to 1.7 GHz. Prefer one with a TCXO (a temperature-compensated crystal oscillator), such as the RTL-SDR Blog V3 or V4: its frequency doesn't drift as it warms up, which matters for narrow digital signals.

## Antennas

The antenna matters more than the dongle.

- **Match the band.** An antenna cut for 1090 MHz hears aircraft well and little else. A wide-band discone suits general listening.
- **Height beats gain.** AIS, ADS-B and APRS are all line of sight: a modest antenna on the roof hears much further than a good one indoors.
- **Keep the cable short**, or use low-loss cable. At 1090 MHz, a few metres of thin cable loses much of the signal.

## Sharing a dongle over the network

Sentinel never plugs into a dongle directly. It reaches each one over your network, so a dongle can sit next to its antenna on another computer, such as a Raspberry Pi in the loft. That computer shares it in one of two ways:

| | rtl_tcp | Sentry |
|---|---|---|
| What it is | A small program that comes with the RTL-SDR drivers | A program for a Raspberry Pi that shares several dongles |
| Dongles per program | One (run one copy per dongle, each on its own port) | Several |
| Sentinel can claim it for a job and hand it back | No | Yes |
| Use it for | Listening, recording, APRS, AIS, voice | All of those, and off-grid aircraft (ADS-B), which needs a dongle Sentinel can claim |

To share a dongle with rtl_tcp, run this on the computer it is plugged into:

```bash
rtl_tcp -a 0.0.0.0 -p 1234
```

rtl_tcp has no password: anyone on your network can use the dongle, so only do this on a network you trust.

Then add it in Sentinel: [Add a radio](use/sdr/add-a-radio.md).

**One program at a time.** rtl_tcp serves one connection. While another program (or a second Sentinel) is connected, Sentinel can't use that dongle, and the radio shows **DISCONNECTED**. Close the other program, or restart `rtl_tcp`.

## The network

There are two links to think about:

- **Dongle to Sentinel.** The radio hub reads the raw signal from each connected dongle: about **33 Mbps** per dongle at the usual rate of 2.048 million samples a second, and about **38 Mbps** for off-grid ADS-B. Use a wired connection, or good Wi-Fi, between the computer with the dongles and the one running the radio hub. If that is a problem, run the radio hub [on the computer with the dongles](radio-host.md).
- **Sentinel to your browser.** This one is light: the browser receives a picture of the band and the audio, not the raw signal.

## The computer Sentinel runs on

Any computer that runs Docker: macOS, Windows or Linux, on Intel/AMD or 64-bit ARM (such as a Raspberry Pi 4 or 5). Allow a few gigabytes of disk for Sentinel itself, plus:

- **Recordings:** a WAV is small, but raw [IQ](reference/glossary.md#radio-and-signals) grows about 4 MB a second at the dongle's usual rate, about 14 GB an hour. See [Record what you hear](use/sdr/record.md).
- **Offline maps:** from a few megabytes for a town to many gigabytes for a country at full detail. The download page shows the size before you start; see [Download maps for offline use](use/offline-maps.md).

### Build for another kind of computer

To build Sentinel's backend image for both Intel/AMD (`linux/amd64`) and ARM (`linux/arm64`), for example to build on a PC for a Raspberry Pi, use `docker buildx bake`. It needs `docker buildx` (included with Docker Desktop) and, on Linux, QEMU for the other architecture: `docker run --privileged --rm tonistiigi/binfmt --install all`.

```bash
docker buildx bake --print                                               # show what it will build
IMAGE_REPOSITORY=registry.lan:5000/sentinel docker buildx bake --push    # both kinds, to your registry
docker buildx bake --set '*.platform=linux/arm64' --load                 # one kind, to this computer
docker buildx bake decoders --set '*.platform=linux/arm64' --load        # the decoders, this computer only
```

An image for two kinds of computer can't be loaded locally, so push it or choose one platform with `--load`. The variables are `IMAGE_REPOSITORY` (default `sentinel`), `IMAGE_TAG` (default `latest`) and `IMAGE_PLATFORMS` (default `linux/amd64,linux/arm64`).

**Never push the decoder images to a public registry**; [Install and run decoders](decoders.md#for-developers) says why.

## Linux: "USB buffer" errors

On a Linux computer with a dongle plugged in, repeated errors about a **USB buffer** or `usbfs` come from Linux's limit on USB memory. Remove the limit, as root, on the computer the dongle is plugged into:

```bash
echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb
```

This lasts until the next reboot. To keep it, add `usbcore.usbfs_memory_mb=0` to the kernel command line (on a Raspberry Pi, `/boot/firmware/cmdline.txt`).

## Receiving responsibly

What you may listen to depends on your country. Read [Receiving responsibly](use/receiving-responsibly.md) before you start.
