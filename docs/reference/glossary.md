# Glossary

The words these docs use, in three groups, each in alphabetical order: radio terms, the words for Sentinel's own parts, and the developer terms used in **How it works** and **Develop**.

## Radio and signals

| Word | Means |
|---|---|
| **ADS-B** | Automatic Dependent Surveillance–Broadcast. Aircraft broadcast their position, height, speed and callsign on 1090 MHz about once a second. The **AIR** section shows them. |
| **AIS** | Automatic Identification System. Ships broadcast their position, course and name on two marine VHF channels (161.975 and 162.025 MHz). The **SEA** section shows them. |
| **AISStream** | [aisstream.io](https://aisstream.io), a free online service that relays AIS from receivers around the world. Sea uses it online; it needs a key, and allows one connection per key. |
| **APRS** | Automatic Packet Reporting System: amateur radio stations sharing positions, weather and short messages on one channel (144.800 MHz in Europe). The **LAND** section shows the stations your radio hears. |
| **Band plan** | Which kinds of signal live in which frequency ranges. The SDR waterfall labels bands from it. |
| **Dongle** | A USB radio stick. Sentinel uses **RTL-SDR** dongles. |
| **Decoder** | A program that turns a digital signal into something you can read or hear. Each runs in its own optional container and needs its own dongle. |
| **Footprint** | The area of Earth that can see a satellite at a given moment. |
| **IQ** | The raw signal from a radio: a stream of sample pairs that holds the whole band it is receiving. Sentinel can save it alongside a recording. |
| **Pass** | One trip of a satellite across your sky, from rising (AOS) to setting (LOS). |
| **Repeater** | A radio station on a hill or mast that retransmits what it hears, so handheld radios can reach further. Land lists every UK amateur repeater. |
| **RTL-SDR** | A family of cheap USB dongles that can receive roughly 25 MHz to 1.7 GHz. |
| **rtl_tcp** | A small program, part of the RTL-SDR drivers, that shares one dongle over the network. One program can use it at a time. |
| **SDR** | Software-defined radio: a radio whose tuning and demodulation are done in software. Also the name of Sentinel's radio section. |
| **Sentry** | A program that runs on a Raspberry Pi and shares several dongles over the network. Sentinel can claim a Sentry dongle, tune it and hand it back. |
| **Squawk** | The four-digit code an aircraft's transponder sends. 7700 (emergency), 7600 (radio failure) and 7500 (hijack) raise an alert. |
| **TLE** | Two-line element set: a short public description of a satellite's orbit. Space works out every position from it. |
| **Waterfall** | A picture of signal strength across a band, scrolling down over time. |

## Sentinel's parts

| Word | Means |
|---|---|
| **Alert** | A message Sentinel raises for something that needs your attention, such as an emergency squawk or a satellite pass. |
| **Config file** | `backend/data/sentinel_config.json`: every setting in one file, kept up to date as settings change and read back when you edit it. |
| **Core** | The `app` service: what every section depends on (settings, alerts, offline maps, the list of running services). It is always running. |
| **Gateway** | The `gateway` container, the one address a browser uses (port 8080). It passes each request to the service that answers it. |
| **Off Grid** | The mode in which every section uses sources that need no internet: your own radios, downloaded maps, saved satellite data. Its opposite is **Online**. |
| **Offline maps** | Map tiles saved on your computer, so maps work with no internet. Some are bundled; you can download more. |
| **Radio** | One dongle you have added to Sentinel. |
| **Radio host** | A second computer that runs the radio hub and decoders, next to the antennas. |
| **Radio hub** | The `radio` service, the only part of Sentinel that talks to radios. |
| **Section** | One of **AIR**, **SPACE**, **SEA**, **LAND** and **SDR**: a backend service plus its part of the screen. |
| **Sentinel Location** | Your position, set in Settings. Distances, passes and searches use it. |
| **Tile** | A square piece of a map at one zoom level. Sentinel keeps tiles in `.pmtiles` files. |

## Developer terms

| Word | Means |
|---|---|
| **Caddy** | The web server the gateway runs. |
| **Capability** | A service one section's UI offers the others through the shell, such as SDR's `radio`, so they can use it without importing SDR. |
| **Compose profile** | A named group of optional containers in `docker-compose.yml`, started with `--profile <name>`. The decoders are profiles. |
| **Event bus** | How services send each other short messages, on named **subjects** such as `settings.changed.sdr`. It runs over **NATS**. |
| **FastAPI** | The Python web framework every backend service is written in. |
| **Hook** | A function a module hands over to be called at a set moment, such as start-up. |
| **Lifecycle** | A module's start-up and shut-down hooks: `prepare`, `start`, `wake` and `stop`. |
| **Manifest** | What a service tells core about itself when it registers: its id, address and the paths it serves. |
| **Module Federation** | The build feature that lets the shell load each section's UI at run time. |
| **NATS** | A small message broker that carries the event bus between containers. |
| **Pinia** | Vue's state library. A **store** holds state that several components share. |
| **Remote** | A section's UI, built as its own bundle and loaded by the shell. |
| **Service** | One backend process in its own container: core, a section, or the radio hub. |
| **Settings client** | The code a service uses to read and write settings through core, instead of opening the settings table itself. |
| **Shell** | The Vue app that loads in the browser and hosts every section's UI. |
| **SIGTERM** | The signal Docker sends a process to ask it to stop. |
| **SQLAlchemy** | The Python library that reads and writes the SQLite databases. Its **ORM models** are Python classes that describe tables. |
| **SQLite** | A database that is a single file, with no database server. Every service has one. |
| **SSE** | Server-sent events: a one-way stream of updates from server to browser over ordinary HTTP. Alerts reach the browser this way. |
| **Uvicorn** | The program that runs a FastAPI service. |
| **Vite** | The tool that builds the frontend, and serves it with **hot reload** (changes appear without a page reload) while you develop. |
| **Volume** | Storage Docker keeps for a container, which survives the container being removed. Every database is on one. |
