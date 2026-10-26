# Glossary

## Radio

| Word | Means |
|---|---|
| **ADS-B** | Aircraft broadcasting position, height, speed and callsign on 1090 MHz |
| **AIS** | Ships broadcasting position, course and name on 161.975 and 162.025 MHz |
| **AISStream** | A free online AIS feed; one connection per key |
| **APRS** | Amateur stations sharing positions and messages (144.800 MHz in Europe) |
| **Band plan** | Which signals live where; drawn along the waterfall |
| **Dongle** | A USB radio stick (RTL-SDR) |
| **Decoder** | A container that turns a digital signal into data or voice |
| **IQ** | The raw signal: the whole band the radio receives |
| **Pass** | A satellite crossing your sky, rise (AOS) to set (LOS) |
| **Repeater** | A hilltop station that retransmits, so handhelds reach further |
| **rtl_tcp** | A program that shares one dongle over the network |
| **SDR** | Software-defined radio; also Sentinel's radio section |
| **SDR Manager** | The part of Sentinel that looks after dongles: this computer's (`sdr-manager-local`) and other computers' (`sdr-manager-remote`) |
| **SDR host** | A computer running SDR Manager that shares its dongles, such as a Raspberry Pi by the antenna |
| **Sentry** | SDR Manager's old name, as a separate program; replace it with SDR Manager |
| **Squawk** | A transponder code; 7700, 7600 and 7500 raise alerts |
| **TLE** | Public orbit data for a satellite |
| **Waterfall** | Signal strength across a band, scrolling over time |

## Sentinel

| Word | Means |
|---|---|
| **Core** | The `app` service: settings, alerts, offline maps, the service list |
| **Gateway** | The one address a browser uses (port 8080) |
| **Off Grid** | Using only your radios, downloaded maps and stored data |
| **Radio** | One dongle added to Sentinel |
| **Radio host** | A second computer running the radio hub and decoders |
| **Radio hub** | The `radio` service, the only part that talks to radios |
| **Section** | AIR, SPACE, SEA, LAND or SDR |
| **Sentinel Location** | Your position, set in Settings |

## Developer

| Word | Means |
|---|---|
| **Capability** | A service one section offers others through the shell, such as SDR's `radio` |
| **Event bus** | Short messages between services on named subjects, over NATS |
| **Lifecycle** | A module's `prepare`, `start`, `wake` and `stop` hooks |
| **Manifest** | What a service tells core when it registers: id, address, paths |
| **Module Federation** | How the shell loads each section's UI at run time |
| **Profile** | An optional group of containers, started with `--profile` |
| **Remote** | A section's UI bundle, loaded by the shell |
| **Settings client** | How a service reads and writes settings through core |
| **Shell** | The Vue app hosting every section's UI |
