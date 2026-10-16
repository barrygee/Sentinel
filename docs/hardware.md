# Hardware

Online you need no radio. A radio adds listening, recording, decoding and everything off grid.

## One dongle per job

| Job | Dongle | Antenna | Decoder |
|---|---|---|---|
| Listen, record, scan | Any RTL-SDR | Suits the band | — |
| Satellite passes | Shares the listening dongle | V-dipole or turnstile for 137 MHz | — |
| Aircraft off grid | One on a Sentry host | 1090 MHz | `adsb` |
| Ships off grid | One, full time | Marine VHF (162 MHz), high | `ais` |
| APRS | One, full time | 2 m (144 MHz) | `aprs` |
| Digital voice | One, while decoding | Suits the band | `voice-decoder` |

## Tips

- **Dongle:** RTL-SDR (25 MHz to 1.7 GHz). Pick one with a TCXO, such as the RTL-SDR Blog V3 or V4, so it doesn't drift.
- **Antenna matters most.** Match the band. Height beats gain. Keep cable short.
- **rtl_tcp** shares one dongle, no password: `rtl_tcp -a 0.0.0.0 -p 1234`. **Sentry** shares several and lets Sentinel claim and tune them (needed for off-grid ADS-B).
- **Network:** about 33 Mbps per dongle to the radio hub (38 Mbps for ADS-B). Wire it, or run the [radio hub by the dongles](radio-host.md). The browser link is light.
- **Computer:** anything that runs Docker (macOS, Windows, Linux; Intel/AMD or 64-bit ARM such as a Pi 4 or 5).
- **Disk:** a few GB for Sentinel, plus recordings (raw IQ is about 14 GB an hour) and offline maps (shown before you download).

## Build for another computer

`docker buildx bake` builds the backend image for `linux/amd64` and `linux/arm64` (on Linux, first `docker run --privileged --rm tonistiigi/binfmt --install all`):

```bash
IMAGE_REPOSITORY=registry.lan:5000/sentinel docker buildx bake --push   # both, to your registry
docker buildx bake --set '*.platform=linux/arm64' --load                # one, to this computer
docker buildx bake decoders --set '*.platform=linux/arm64' --load       # decoders, local only
```

Never push decoder images to a public registry (the voice decoder includes mbelib).

## Linux "USB buffer" errors

As root on the computer with the dongle: `echo 0 > /sys/module/usbcore/parameters/usbfs_memory_mb`. To keep it after a reboot, add `usbcore.usbfs_memory_mb=0` to the kernel command line (Pi: `/boot/firmware/cmdline.txt`).
