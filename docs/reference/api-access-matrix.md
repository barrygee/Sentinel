# API access matrix

Who may call each route of each Sentinel service, and which protection group
it is in. **Generated** from `backend/security/guard-policy.json` and the
services' real apps by `backend/scripts/guard_policy_artifacts.py`: edit the
policy, then regenerate; CI fails while this page is stale.

Caller classes and groups are explained in [the request guard guide](../security-guard.md).
A caller outside a route's classes gets a 404, as for a route that doesn't exist.

## core (`app`)

Profile `core`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/openapi.json` | `operator` | `default` | API reference pages and schema: the operator's machine only. |
| GET | `/api/docs` | `operator` | `default` | API reference pages and schema: the operator's machine only. |
| GET | `/docs/oauth2-redirect` | `operator` | `default` | API reference pages and schema: the operator's machine only. |
| GET | `/api/redoc` | `operator` | `default` | API reference pages and schema: the operator's machine only. |
| GET | `/api/air/messages` | `browser` | `body_free_action` | Notifications: list, raise from the SPA, dismiss. |
| GET | `/api/air/messages/stream` | `browser` | `streams` | Notifications: the SSE stream, opened once per tab. |
| POST | `/api/air/messages` | `browser` | `body_free_action` | Notifications: list, raise from the SPA, dismiss. |
| DELETE | `/api/air/messages/{msg_id}` | `browser` | `body_free_action` | Notifications: list, raise from the SPA, dismiss. |
| DELETE | `/api/air/messages` | `browser` | `body_free_action` | Notifications: list, raise from the SPA, dismiss. |
| GET | `/api/settings` | `browser`, `internal` | `default` | Settings: the SPA, and every section through the settings client (no credential). |
| GET | `/api/settings/config/preview` | `browser` | `default` | Config file preview and the live file's status (polled every 2 s). |
| POST | `/api/settings/config/upload` | `browser` | `config_upload` | Config file upload (Settings › Upload). |
| GET | `/api/settings/config/file-status` | `browser` | `default` | Config file preview and the live file's status (polled every 2 s). |
| GET | `/api/settings/{namespace}` | `browser`, `internal` | `default` | Settings: the SPA, and every section through the settings client (no credential). |
| PUT | `/api/settings/{namespace}/{key}` | `browser`, `internal` | `settings_write` | Writing a setting: the SPA, and sections through the settings client. |
| DELETE | `/api/settings/{namespace}/{key}` | `browser`, `internal` | `body_free_action` | Resetting a setting to its default (no body). |
| GET | `/api/offline-map/basemap/{zoom}/{tile_x}/{tile_y}` | `browser` | `map_tiles` | Offline map tiles (MapLibre fetches them from the page). |
| GET | `/api/offline-map/terrain/{zoom}/{tile_x}/{tile_y}` | `browser` | `map_tiles` | Offline map tiles (MapLibre fetches them from the page). |
| GET | `/api/offline-map/status` | `browser` | `default` | Offline map status and regions (polled every 1.5 s during a download). |
| POST | `/api/offline-map/estimate` | `browser` | `expensive_jobs` | Offline map downloads: estimating, starting and deleting a region. |
| POST | `/api/offline-map/regions` | `browser` | `expensive_jobs` | Offline map downloads: estimating, starting and deleting a region. |
| GET | `/api/offline-map/regions` | `browser` | `default` | Offline map status and regions (polled every 1.5 s during a download). |
| GET | `/api/offline-map/regions/{region_id}` | `browser` | `default` | Offline map status and regions (polled every 1.5 s during a download). |
| DELETE | `/api/offline-map/regions/{region_id}` | `browser` | `expensive_jobs` | Offline map downloads: estimating, starting and deleting a region. |
| GET | `/api/app/sections` | `browser` | `default` | The shell's boot data: sections, docs deployment, app mode. |
| GET | `/api/app/docs` | `browser` | `default` | The shell's boot data: sections, docs deployment, app mode. |
| GET | `/api/app/mode` | `browser` | `default` | The shell's boot data: sections, docs deployment, app mode. |
| POST | `/internal/registry/register` | `service` | `internal` | Service registration and discovery (every service; sdr-manager-remote discovers sdr-manager-local). |
| GET | `/internal/registry/services` | `service` | `internal` | Service registration and discovery (every service; sdr-manager-remote discovers sdr-manager-local). |
| GET | `/internal/settings/secrets/{namespace}/{key}` | `service` | `secrets` | Secret settings: Sea's AISStream key, read by the Sea service only. |
| PUT | `/internal/settings/secrets/{namespace}/{key}` | `service` | `secrets` | Secret settings: Sea's AISStream key, read by the Sea service only. |
| DELETE | `/internal/settings/secrets/{namespace}/{key}` | `service` | `secrets` | Secret settings: Sea's AISStream key, read by the Sea service only. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/favicon.ico` | `page` | `spa_shell` | Map assets, fonts, the hashed Vue bundle, the favicon. |
| GET | `/assets/**` | `page` | `spa_shell` | Map assets, fonts, the hashed Vue bundle, the favicon. |
| GET | `/fonts/**` | `page` | `spa_shell` | Map assets, fonts, the hashed Vue bundle, the favicon. |
| GET | `/spa-assets/**` | `page` | `spa_shell` | Map assets, fonts, the hashed Vue bundle, the favicon. |
| GET | `/remotes/{remote_path:path}` | `page` | `spa_shell` | Section UI remotes (Module Federation), served by each section; core answers 404. |
| GET | `/{full_path:path}` | `page` | `spa_shell` | The SPA shell for every client-side route (vue-router). Last: it matches every GET. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## Space (`space`)

Profile `section`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/space/iss` | `browser` | `default` | Space: positions, day/night, TLE lists, the radio file. |
| GET | `/api/space/satellite/{norad_id}` | `browser` | `default` | Space: positions, day/night, TLE lists, the radio file. |
| GET | `/api/space/iss/passes` | `browser` | `pass_prediction` | Space: satellite pass prediction. |
| GET | `/api/space/satellite/{norad_id}/passes` | `browser` | `pass_prediction` | Space: satellite pass prediction. |
| GET | `/api/space/passes` | `browser` | `pass_prediction` | Space: satellite pass prediction. |
| GET | `/api/space/daynight` | `browser` | `default` | Space: positions, day/night, TLE lists, the radio file. |
| GET | `/api/space/tle/status` | `browser` | `default` | Space: positions, day/night, TLE lists, the radio file. |
| GET | `/api/space/tle/list` | `browser` | `default` | Space: positions, day/night, TLE lists, the radio file. |
| GET | `/api/space/tle/uncategorised` | `browser` | `default` | Space: positions, day/night, TLE lists, the radio file. |
| POST | `/api/space/tle/fetch` | `browser` | `tle_input` | Space: pasted TLE text and TLE fetches from a source URL. |
| POST | `/api/space/tle/manual` | `browser` | `tle_input` | Space: pasted TLE text and TLE fetches from a source URL. |
| PATCH | `/api/space/tle/category` | `browser` | `json_write` | Space: recategorising and clearing TLEs. |
| PATCH | `/api/space/tle/satellite` | `browser` | `json_write` | Space: recategorising and clearing TLEs. |
| GET | `/api/space/radio/file` | `browser` | `default` | Space: positions, day/night, TLE lists, the radio file. |
| POST | `/api/space/radio/file` | `browser` | `data_file_upload` | Space: the satellite-radio data file. |
| DELETE | `/api/space/tle` | `browser` | `json_write` | Space: recategorising and clearing TLEs. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/remotes/space/**` | `page` | `spa_shell` | Section UI remotes (Module Federation), served by each section; core answers 404. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## Land (`land`)

Profile `section`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/land/aprs/stations` | `browser` | `default` | Land: APRS stations (polled every 5 s), repeaters. |
| GET | `/api/land/repeaters` | `browser` | `default` | Land: APRS stations (polled every 5 s), repeaters. |
| GET | `/api/land/repeaters/file` | `browser` | `default` | Land: APRS stations (polled every 5 s), repeaters. |
| POST | `/api/land/repeaters/file` | `browser` | `data_file_upload` | Land: the repeater data file. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/remotes/land/**` | `page` | `spa_shell` | Section UI remotes (Module Federation), served by each section; core answers 404. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## Air (`air`)

Profile `section`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/air/adsb/point/{lat}/{lon}/{radius}` | `browser` | `default` | Air: aircraft (polled every 10 s), the online feed's quota, tracked aircraft. |
| GET | `/api/air/adsb/online-quota` | `browser` | `default` | Air: aircraft (polled every 10 s), the online feed's quota, tracked aircraft. |
| GET | `/api/air/tracking` | `browser` | `default` | Air: aircraft (polled every 10 s), the online feed's quota, tracked aircraft. |
| POST | `/api/air/tracking` | `browser` | `json_write` | Air: tracked aircraft. |
| DELETE | `/api/air/tracking/{hex}` | `browser` | `json_write` | Air: tracked aircraft. |
| GET | `/api/sdr/adsb/source` | `browser` | `default` | Air: the configured ADS-B source. |
| PUT | `/api/sdr/adsb/source` | `browser` | `json_write` | Air: choosing the ADS-B source and leasing it. |
| DELETE | `/api/sdr/adsb/source` | `browser` | `json_write` | Air: choosing the ADS-B source and leasing it. |
| POST | `/api/sdr/adsb/claim` | `browser` | `json_write` | Air: choosing the ADS-B source and leasing it. |
| DELETE | `/api/sdr/adsb/claim` | `browser` | `json_write` | Air: choosing the ADS-B source and leasing it. |
| GET | `/api/sdr/adsb/config` | `internal` | `decoder_control` | Air: the ADS-B decoder polls its config through the gateway, without a credential. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/remotes/air/**` | `page` | `spa_shell` | Section UI remotes (Module Federation), served by each section; core answers 404. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## Sea (`sea`)

Profile `section`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/sea/vessels` | `browser` | `default` | Sea: vessels (polled every 10 s), tracks, feed status, whether a key is set. |
| GET | `/api/sea/vessels/{mmsi}/track` | `browser` | `default` | Sea: vessels (polled every 10 s), tracks, feed status, whether a key is set. |
| GET | `/api/sea/status` | `browser` | `default` | Sea: vessels (polled every 10 s), tracks, feed status, whether a key is set. |
| GET | `/api/sea/ais-key` | `browser` | `default` | Sea: vessels (polled every 10 s), tracks, feed status, whether a key is set. |
| PUT | `/api/sea/ais-key` | `browser` | `secret_write` | Sea: setting or clearing the AISStream key. |
| DELETE | `/api/sea/ais-key` | `browser` | `secret_write` | Sea: setting or clearing the AISStream key. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/remotes/sea/**` | `page` | `spa_shell` | Section UI remotes (Module Federation), served by each section; core answers 404. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## SDR (`sdr`)

Profile `section`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/sdr/groups` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| POST | `/api/sdr/groups` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| PUT | `/api/sdr/groups/{group_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| DELETE | `/api/sdr/groups/{group_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| GET | `/api/sdr/frequencies` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| POST | `/api/sdr/frequencies` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| PUT | `/api/sdr/frequencies/{freq_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| PATCH | `/api/sdr/frequencies/{freq_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| DELETE | `/api/sdr/frequencies/{freq_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| GET | `/api/sdr/search-ranges` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| POST | `/api/sdr/search-ranges` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| PUT | `/api/sdr/search-ranges/{range_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| DELETE | `/api/sdr/search-ranges/{range_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| GET | `/api/sdr/data/frequencies` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| POST | `/api/sdr/data/frequencies` | `browser` | `data_file_upload` | SDR: the frequency and band-plan data files. |
| GET | `/api/sdr/data/bandplan` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| POST | `/api/sdr/data/bandplan` | `browser` | `data_file_upload` | SDR: the frequency and band-plan data files. |
| GET | `/api/sdr/recordings` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| POST | `/api/sdr/recordings/start` | `browser` | `radio_control` | SDR: starting and stopping recordings. |
| POST | `/api/sdr/recordings/stop` | `browser` | `radio_control` | SDR: starting and stopping recordings. |
| PATCH | `/api/sdr/recordings/{rec_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| DELETE | `/api/sdr/recordings/{rec_id}` | `browser` | `json_write` | SDR: editing groups, frequencies, search ranges and recordings. |
| GET | `/api/sdr/recordings/{rec_id}/file` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| GET | `/api/sdr/recordings/{rec_id}/iq` | `browser` | `default` | SDR: groups, frequencies, search ranges, band plan, recordings and their files. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/remotes/sdr/**` | `page` | `spa_shell` | Section UI remotes (Module Federation), served by each section; core answers 404. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## Radio hub (`radio`)

Profile `radio_hub`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/sdr/radios` | `browser` | `default` | Radio hub: radios, their status (polled every 3 s), decoder kinds and status. |
| POST | `/api/sdr/radios` | `browser` | `json_write` | Radio hub: adding, editing and removing radios. |
| PUT | `/api/sdr/radios/{radio_id}` | `browser` | `json_write` | Radio hub: adding, editing and removing radios. |
| DELETE | `/api/sdr/radios/{radio_id}` | `browser` | `json_write` | Radio hub: adding, editing and removing radios. |
| POST | `/api/sdr/connect` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| POST | `/api/sdr/disconnect` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| GET | `/api/sdr/status/{radio_id}` | `browser` | `default` | Radio hub: radios, their status (polled every 3 s), decoder kinds and status. |
| WEBSOCKET | `/ws/sdr/{radio_id}/iq` | `browser` | `default` | Radio hub: spectrum, IQ, control and decoded-audio sockets. |
| WEBSOCKET | `/ws/sdr/{radio_id}` | `browser` | `default` | Radio hub: spectrum, IQ, control and decoded-audio sockets. |
| POST | `/api/sdr/decode/ingest` | `decoder` | `decoder_ingest` | Radio hub: decoded events from decoders. |
| GET | `/api/sdr/decode/config` | `decoder` | `decoder_control` | Radio hub: decoders polling their config and registering their manifest. |
| POST | `/api/sdr/aprs/start` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| POST | `/api/sdr/aprs/stop` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| GET | `/api/sdr/aprs/status/{radio_id}` | `browser` | `default` | Radio hub: radios, their status (polled every 3 s), decoder kinds and status. |
| POST | `/api/sdr/aprs/ingest` | `decoder` | `decoder_ingest` | Radio hub: decoded events from decoders. |
| GET | `/api/sdr/aprs/config` | `decoder` | `decoder_control` | Radio hub: decoders polling their config and registering their manifest. |
| POST | `/api/sdr/ais/start` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| POST | `/api/sdr/ais/stop` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| GET | `/api/sdr/ais/status/{radio_id}` | `browser` | `default` | Radio hub: radios, their status (polled every 3 s), decoder kinds and status. |
| POST | `/api/sdr/ais/ingest` | `decoder` | `decoder_ingest` | Radio hub: decoded events from decoders. |
| GET | `/api/sdr/ais/config` | `decoder` | `decoder_control` | Radio hub: decoders polling their config and registering their manifest. |
| GET | `/api/sdr/decode/status/{radio_id}` | `browser` | `default` | Radio hub: radios, their status (polled every 3 s), decoder kinds and status. |
| WEBSOCKET | `/ws/sdr/{radio_id}/decode` | `browser` | `default` | Radio hub: spectrum, IQ, control and decoded-audio sockets. |
| WEBSOCKET | `/ws/sdr/{radio_id}/decode/audio` | `browser` | `default` | Radio hub: spectrum, IQ, control and decoded-audio sockets. |
| GET | `/api/sdr/decoders` | `browser` | `default` | Radio hub: radios, their status (polled every 3 s), decoder kinds and status. |
| POST | `/api/sdr/decoders/register` | `decoder` | `decoder_control` | Radio hub: decoders polling their config and registering their manifest. |
| POST | `/api/sdr/decoders/{kind}/start` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| POST | `/api/sdr/decoders/{kind}/stop` | `browser` | `radio_control` | Radio hub: starting and stopping decoders, connecting radios. |
| GET | `/api/sdr/decoders/{kind}/status/{radio_id}` | `browser` | `default` | Radio hub: radios, their status (polled every 3 s), decoder kinds and status. |
| POST | `/api/sdr/decoders/{kind}/ingest` | `decoder` | `decoder_ingest` | Radio hub: decoded events from decoders. |
| GET | `/api/sdr/decoders/{kind}/config` | `decoder` | `decoder_control` | Radio hub: decoders polling their config and registering their manifest. |
| GET | `/internal/radio-hub/iq-captures/{capture_id}` | `service` | `internal` | Staged IQ captures, collected by the SDR section from the hub. |
| DELETE | `/internal/radio-hub/iq-captures/{capture_id}` | `service` | `internal` | Staged IQ captures, collected by the SDR section from the hub. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## Docs (`docs`)

Profile `docs`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/documentation/library` | `browser` | `default` | Docs: the library and its images. |
| GET | `/api/documentation/images/{image_path:path}` | `browser` | `default` | Docs: the library and its images. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## SDR Manager, other machines (`sdr-manager-remote`)

Profile `sdr_manager_remote`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/api/sdr-manager/remote/hosts` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| POST | `/api/sdr-manager/remote/hosts` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| GET | `/api/sdr-manager/remote/hosts/locations` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| GET | `/api/sdr-manager/remote/hosts/{host_id}` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| PUT | `/api/sdr-manager/remote/hosts/{host_id}` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| DELETE | `/api/sdr-manager/remote/hosts/{host_id}` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| POST | `/api/sdr-manager/remote/hosts/{host_id}/test` | `browser` | `expensive_jobs` | SDR Manager (other machines): host connection tests reach out over the LAN. |
| GET | `/api/sdr-manager/remote/hosts/{host_id}/info` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| GET | `/api/sdr-manager/remote/hosts/{host_id}/devices` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| GET | `/api/sdr-manager/remote/hosts/{host_id}/devices/records` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| PATCH | `/api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| DELETE | `/api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| POST | `/api/sdr-manager/remote/hosts/{host_id}/devices/{device_id}/serial` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| GET | `/api/sdr-manager/remote/hosts/{host_id}/wifi` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| PUT | `/api/sdr-manager/remote/hosts/{host_id}/wifi` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| DELETE | `/api/sdr-manager/remote/hosts/{host_id}/wifi` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| POST | `/api/sdr-manager/remote/hosts/{host_id}/wifi/enable` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| POST | `/api/sdr-manager/remote/hosts/{host_id}/wifi/disable` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| POST | `/api/sdr-manager/remote/hosts/{host_id}/wifi/confirm` | `browser` | `json_write` | SDR Manager (other machines): adding hosts, managing their devices and Wi-Fi. |
| GET | `/api/sdr-manager/remote/hosts/{host_id}/wifi/interfaces` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| GET | `/api/sdr-manager/remote/hosts/{host_id}/wifi/clients` | `browser` | `default` | SDR Manager (other machines): hosts, their devices, Wi-Fi state and locations. |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/remotes/sdr-manager-remote/**` | `page` | `spa_shell` | Section UI remotes (Module Federation), served by each section; core answers 404. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |

## SDR Manager, this machine (`sdr-manager-local`)

Profile `sdr_manager_local`.

| Method | Path | Who may call | Group | What it is |
| --- | --- | --- | --- | --- |
| GET | `/health` | `internal`, `operator` | `health` | Health probes: Docker's HEALTHCHECK (loopback), core's registry probes (internal), the operator. |
| GET | `/internal/security/status` | `service` | `internal` | Guard status: GET it with a service credential (or use the CLI). |
| GET | `/api/sdr-manager/local/openapi.json` | `peer`, `operator` | `default` | SDR Manager (this machine): its API schema, published for managers built against it. |
| GET | `/api/sdr-manager/local/health` | `browser`, `peer`, `internal`, `operator` | `health` | SDR Manager (this machine): health, at both mounts (the gateway's and other machines'). |
| GET | `/api/sdr-manager/local/auth/state` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| POST | `/api/sdr-manager/local/auth/login` | `browser`, `peer`, `internal` | `console_login` | SDR Manager (this machine): console sign-in and password change. |
| POST | `/api/sdr-manager/local/auth/logout` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/sdr-manager/local/auth/password` | `browser`, `peer`, `internal` | `console_login` | SDR Manager (this machine): console sign-in and password change. |
| GET | `/api/sdr-manager/local/status` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/sdr-manager/local/events` | `browser`, `peer`, `internal` | `streams` | SDR Manager (this machine): its event stream. |
| GET | `/api/sdr-manager/local/devices` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| PATCH | `/api/sdr-manager/local/devices/{device_id}` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/sdr-manager/local/devices/{device_id}` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/sdr-manager/local/devices/{device_id}/serial` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| GET | `/api/sdr-manager/local/devices/{device_id}/reservation` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| POST | `/api/sdr-manager/local/devices/{device_id}/reservation` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/sdr-manager/local/devices/{device_id}/reservation` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| GET | `/api/sdr-manager/local/v1/sdrs` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/sdr-manager/local/sdrs` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/sdr-manager/local/hotspot` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/sdr-manager/local/hotspot/interfaces` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/sdr-manager/local/hotspot/clients` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| PUT | `/api/sdr-manager/local/hotspot` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/sdr-manager/local/hotspot/enable` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/sdr-manager/local/hotspot/disable` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/sdr-manager/local/hotspot/clients/{mac_address}` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/sdr-manager/local/hotspot/confirm` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/sdr-manager/local/hotspot` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| PUT | `/api/sdr-manager/local/hotspot/control` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| GET | `/api/sdr-manager/local/config` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/sdr-manager/local/config/download` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| POST | `/api/sdr-manager/local/config` | `browser`, `peer`, `internal` | `data_file_upload` | SDR Manager (this machine): importing a config. |
| GET | `/api/openapi.json` | `operator` | `default` | API reference pages and schema: the operator's machine only. |
| GET | `/api/health` | `browser`, `peer`, `internal`, `operator` | `health` | SDR Manager (this machine): health, at both mounts (the gateway's and other machines'). |
| GET | `/api/auth/state` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| POST | `/api/auth/login` | `browser`, `peer`, `internal` | `console_login` | SDR Manager (this machine): console sign-in and password change. |
| POST | `/api/auth/logout` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/auth/password` | `browser`, `peer`, `internal` | `console_login` | SDR Manager (this machine): console sign-in and password change. |
| GET | `/api/status` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/events` | `browser`, `peer`, `internal` | `streams` | SDR Manager (this machine): its event stream. |
| GET | `/api/devices` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| PATCH | `/api/devices/{device_id}` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/devices/{device_id}` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/devices/{device_id}/serial` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| GET | `/api/devices/{device_id}/reservation` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| POST | `/api/devices/{device_id}/reservation` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/devices/{device_id}/reservation` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| GET | `/api/v1/sdrs` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/sdrs` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/hotspot` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/hotspot/interfaces` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/hotspot/clients` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| PUT | `/api/hotspot` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/hotspot/enable` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/hotspot/disable` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/hotspot/clients/{mac_address}` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| POST | `/api/hotspot/confirm` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| DELETE | `/api/hotspot` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| PUT | `/api/hotspot/control` | `browser`, `peer`, `internal` | `json_write` | SDR Manager (this machine): signing out, managing devices, reservations and the hotspot. |
| GET | `/api/config` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| GET | `/api/config/download` | `browser`, `peer`, `internal` | `default` | SDR Manager (this machine): state, status, devices, SDRs, hotspot, config export. |
| POST | `/api/config` | `browser`, `peer`, `internal` | `data_file_upload` | SDR Manager (this machine): importing a config. |
