from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings

# Repo root, used to resolve the bundled base PMTiles archives from a relative
# default without depending on the process's current working directory.
_ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Path to the SQLite database file (relative to the project root)
    db_path: str = "backend/sentinel.db"

    # How long ADS-B aircraft data from a local decoder (off grid) is considered
    # fresh. Online snapshots stay fresh for the online refresh interval below.
    adsb_ttl_ms: int = 10000
    # How long a stale ADS-B response can still be served if the upstream fails (60 seconds)
    adsb_stale_ms: int = 60000

    # Base URL for the online ADS-B API. adsb.lol serves the same `/point/{lat}/
    # {lon}/{radius}` shape airplanes.live used to: airplanes.live closed its v2
    # endpoint behind an auth key ("403: Check auth key"), and this feed is the
    # keyless drop-in replacement — same response fields, no registration.
    adsb_upstream_base: str = "https://api.adsb.lol/v2"
    # Minimum gap between two outbound ADS-B requests to the same local decoder
    # host (5 seconds). The online feed is spaced by the refresh interval below.
    adsb_min_request_interval_ms: int = 5000
    # Default gap between two calls to the online feed, whoever makes them (the
    # map, the squawk watcher). adsb.lol allows 500 requests a day; 60 s spends
    # that in about 8 hours of continuous use, traded for a livelier map — the
    # quota tracker (sentinel_air.services.online_quota) warns as it runs out.
    # The operator sets it in Settings › AIR (`air.onlineRefreshIntervalSec`);
    # this applies while that is unset or not a number.
    adsb_online_refresh_interval_s: float = 60.0
    # The default feed's (adsb.lol's) daily call limit, used for it until its
    # own `X-RateLimit-Limit` header (the `;w=86400` policy) says otherwise.
    # Other feeds use their own header's figure, or Settings › AIR › Daily
    # Call Limit (`air.onlineDailyCallLimit`), or are counted without one.
    adsb_online_daily_quota: int = 500
    # Share of the daily limit used before Sentinel warns that it is running out.
    adsb_online_quota_warn_fraction: float = 0.8
    # Longest a request will wait for a free upstream slot before giving up and
    # serving cached data instead. Capped at one interval so a burst of callers
    # cannot pile into an ever-growing queue.
    adsb_rate_limit_max_wait_ms: int = 5000
    # Server-side squawk alerts (docs/plans/adsb-server-alerts.md). The watcher
    # fetches aircraft itself only when no browser has fetched any for this many
    # seconds, so an open Air page costs no extra upstream calls.
    adsb_watch_idle_s: float = 15.0
    # Defaults for how often the watcher fetches for itself once idle — online
    # (the public feed) and off grid (the local decoder). The operator sets
    # them in Settings › AIR (`air.squawkWatchOnlineIntervalSec` /
    # `air.squawkWatchOffgridIntervalSec`); these apply while those are unset
    # or invalid. Online, every check uses one of the feed's daily calls and
    # runs round the clock: 300 s is 288 a day, leaving adsb.lol's 500 room
    # for the map (a faster check is held to the online refresh interval
    # anyway). Off grid the local decoder has no limit: 20 s matches the
    # cadence the watcher had before these existed.
    adsb_watch_online_interval_s: float = 300.0
    adsb_watch_offgrid_interval_s: float = 20.0
    # Radius (nm) the watcher covers around the receiver (off grid) or
    # Settings › App › Location (online) — the same radius the map asks for.
    adsb_watch_radius_nm: int = 250
    # How long outbound calls to a host are suspended after it answers 429.
    # adsb.lol documents no fixed request budget ("rate limits are dynamic based
    # on the environment load"), so the fixed interval above is a floor, not a
    # guarantee: when the upstream refuses a call we stop calling it for a while
    # and serve cached data instead. 60 seconds — long enough to clear a busy
    # spell, short enough that the map recovers without a restart.
    adsb_rate_limit_penalty_ms: int = 60_000
    # Ceiling applied to an upstream `Retry-After` before it is honoured, so a
    # misconfigured or hostile header cannot park the feed for hours.
    adsb_rate_limit_max_penalty_ms: int = 600_000
    # Where Off Grid AIR reads decoded aircraft from: the compose `adsb-decoder`
    # sidecar's readsb JSON. It is the only off-grid ADS-B source Sentinel ships,
    # so this is a default rather than a Settings field; override it only for a
    # decoder running outside the compose network. A stored
    # `air.offgridDataSourceURL` (e.g. from the config JSON) still wins.
    adsb_offgrid_url: str = "http://adsb-decoder:8080/data/aircraft.json"

    # TLE data TTL — 6 hours (TLE changes slowly; Celestrak updates daily)
    tle_ttl_ms: int = 21_600_000
    # Stale window for TLE — 12 hours (serve old TLE if Celestrak is unreachable)
    tle_stale_ms: int = 43_200_000
    # TTL for manually-entered TLE data — 30 days (user explicitly provided it)
    tle_manual_ttl_ms: int = 2_592_000_000
    # Celestrak TLE URL for the ISS (NORAD ID 25544)
    celestrak_iss_url: str = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"

    # ── Sea / AIS (AISStream.io live vessels) ─────────────────────────────────
    # Private AISStream.io key for the backend's WebSocket subscription. Set it in
    # `.env` (never committed); a key saved from Settings › SEA takes precedence.
    aisstream_api_key: str = ""
    # AISStream endpoint. Overridable so the watchdog can be exercised against a
    # local stand-in without spending the one-connection-per-key slot upstream.
    aisstream_ws_url: str = "wss://stream.aisstream.io/v0/stream"
    # Drop a vessel not heard for this long (30 min — AIS Class A reports every
    # 2–10 s under way, so half an hour of silence means it has left coverage).
    sea_ais_stale_ms: int = 1_800_000
    # Hard cap on the in-memory vessel store; oldest vessels are evicted first.
    sea_ais_cache_max: int = 50_000
    # Vessel names/callsigns/types (sea_vessel_static) are remembered this long
    # after they were last heard (90 days), so a returning ship — or one heard
    # only by position off grid — is named at once. Capped, oldest dropped first.
    sea_vessel_static_retention_ms: int = 7_776_000_000
    sea_vessel_static_max: int = 250_000
    # Per-vessel recent-path ring buffer: samples kept, and the minimum time and
    # distance between stored fixes so an anchored ship collapses to one point.
    sea_ais_track_samples: int = 64
    sea_ais_track_min_gap_s: int = 30
    sea_ais_track_min_move_m: int = 25
    # Feed silence is REPORTED quickly (the map must read a dead feed as dead
    # within ~2 min) but ACTED ON slowly: the socket is only recycled after
    # `recycle_ratio` × the report threshold, because a reconnect storm would
    # trip AISStream's one-connection-per-key limit and lock the feed out.
    sea_ais_silence_report_ms: int = 120_000
    sea_ais_recycle_ratio: float = 2.5
    # Reconnect back-off ladder for transport failures, then the slow retry
    # cadence once the ladder is spent and the feed reads DOWN.
    sea_ais_backoff_ms: list[int] = [5_000, 15_000, 60_000, 300_000]
    sea_ais_down_retry_ms: int = 900_000
    # A rejected key cannot be fixed by retrying; probe hourly only so an
    # upstream-side mistake still recovers without hammering the endpoint.
    sea_ais_auth_probe_ms: int = 3_600_000
    # How often the watchdog re-evaluates the connection without request traffic.
    sea_ais_tick_ms: int = 15_000
    # How often the in-memory store is snapshotted to SQLite so a restart (or an
    # upstream outage) can serve the last-known picture as STALE.
    sea_ais_snapshot_persist_ms: int = 30_000
    # Largest bounding box list accepted from Settings › SEA (defence in depth).
    sea_ais_max_bounding_boxes: int = 10
    # ── Digital-decode sidecar (dsd-fme) ──────────────────────────────────────
    # TCP port the backend listens on to serve FM-demodulated 48 kHz mono s16 PCM
    # to the decoder container (dsd-fme connects here as a client; SDR++ "TCP
    # audio sink" convention). Only reachable on the internal compose network.
    decoder_pcm_port: int = 7355
    # UDP port the backend listens on for decoded voice audio sent back by dsd-fme.
    decoder_audio_udp_port: int = 7356
    # Default channel bandwidth (Hz) used when digital decode is enabled.
    decoder_default_bw_hz: int = 12_500
    # Offset added to a radio's rtl_tcp port to reach the fan-out relay's NDJSON
    # tuning-ownership control channel (e.g. IQ 1234 → control 1236). Must match the
    # relay's RELAY_CONTROL_PORT (which itself defaults to LISTEN_PORT + 2). When the
    # control port is unreachable (a raw rtl_tcp, or a relay without the channel) the
    # backend falls back to direct last-writer-wins tuning over the IQ socket.
    sdr_relay_control_port_offset: int = 2
    # How long to wait (seconds) for the relay to confirm a claim/ownership state
    # before treating the attempt as "not owner" and the channel probe as absent.
    sdr_relay_control_timeout_s: float = 2.0

    # ── APRS-decode sidecar (Direwolf) ────────────────────────────────────────
    # APRS packet decode shares the backend's FM-demod PCM spine but runs its own
    # sidecar (Direwolf) so it can decode concurrently with voice on a second
    # dongle. TCP port the backend serves the APRS PCM feed on (distinct from the
    # voice feed's 7355 so both can listen at once). Direwolf connects here.
    aprs_decoder_pcm_port: int = 7357
    # Default channel bandwidth (Hz) for APRS. 2 m APRS is ~15 kHz narrowband FM
    # (~5 kHz deviation), a touch wider than the 12.5 kHz voice channel so the
    # 1200/2200 Hz AFSK tones and deviation pass cleanly.
    aprs_decoder_default_bw_hz: int = 15_000
    # Fallback APRS channel (Hz) the decode bridge keeps the radio on, used when
    # no user override is set. 144.800 MHz is the 2 m APRS channel in Europe/UK
    # (North America uses 144.390 MHz). The user can override this per-install
    # via the `land`/`aprsChannelHz` setting; the bridge reads that and falls
    # back to this value. The bridge owns the channel: it tunes the dongle here
    # on start and re-derives its demod offset from the live centre frequency,
    # so a viewer's retune (or a satellite auto-tune) can't silently move APRS
    # off channel.
    aprs_channel_hz: int = 144_800_000
    # Fallback retention (ms) for a heard APRS station on the Land map before it
    # is dropped, used when no user override is set. Default 5 minutes. The user
    # can override this per-install via the `land`/`aprsRetentionMinutes` setting
    # (seeded from default_config.json); aprs_store reads that and falls back to
    # this value.
    aprs_station_ttl_ms: int = 300_000

    # ── AIS-decode sidecar (Direwolf, off-grid Sea) ───────────────────────────
    # Off-grid AIS decode is the Sea twin of APRS: the same FM-demod PCM spine
    # feeds its own Direwolf sidecar, which runs Direwolf's `AIS` modem (9600 bps
    # GMSK) instead of AFSK1200. It is the off-grid alternative to the online
    # AISStream.io feed, and decodes into the SAME vessel store so the Sea map,
    # tracks and snapshot cache work identically whichever source is live.
    #
    # TCP port the backend serves the AIS PCM feed on — distinct from the voice
    # (7355) and APRS (7357) feeds so all three can decode at once on separate
    # dongles.
    ais_decoder_pcm_port: int = 7358
    # AIS is transmitted alternately on two 25 kHz channels 50 kHz apart, so
    # decoding only one loses roughly half the traffic. The bridge demodulates
    # BOTH and interleaves them as stereo PCM (left = A, right = B) into a
    # two-channel Direwolf, which is why these are a pair rather than the single
    # channel APRS owns.
    ais_channel_a_hz: int = 161_975_000
    ais_channel_b_hz: int = 162_025_000
    # Default per-channel bandwidth (Hz). AIS 9600 GMSK occupies ~14 kHz inside
    # its 25 kHz channel, so a 16 kHz LPF passes it intact while rejecting the
    # other AIS channel 50 kHz away. Wider than APRS's 15 kHz because the symbol
    # rate is 8x higher.
    ais_decoder_default_bw_hz: int = 16_000

    # ── UK amateur-radio repeaters (ukrepeater.net / RSGB ETCC) ───────────────
    # The ETCC "voice repeaters and gateways (with status)" CSV export. The list
    # changes a few times a week at most, so it is refreshed daily and the last
    # good copy is kept for a month; a bundled snapshot (`backend/data/
    # uk_repeaters.csv`) covers a fresh install that has never been online.
    repeaters_upstream_url: str = "https://ukrepeater.net/csvcreate8.php"
    repeaters_ttl_ms: int = 86_400_000
    repeaters_stale_ms: int = 2_592_000_000
    # How long a directory uploaded from Settings › LAND › REPEATERS is served
    # before the daily upstream refresh resumes (30 days, as manual TLEs are).
    repeaters_manual_ttl_ms: int = 2_592_000_000
    # Upstream fetch timeout (seconds) — the export is ~150 KB from a small site.
    repeaters_fetch_timeout_s: float = 20.0

    # ── Live application config file ──────────────────────────────────────────
    # Every setting is mirrored to this JSON file (rewritten on each change) and
    # edits saved to it are applied to the app — see services/app_config_file.py.
    # Relative paths resolve against the repo root. The default sits under
    # backend/, which docker-compose bind-mounts, so the file can be edited from
    # the host.
    app_config_path: str = "backend/data/sentinel_config.json"

    # ── Offline map downloads (user-selected region extracts) ────────────────
    # Where extracted region archives (<uuid>.pmtiles / <uuid>.terrain.pmtiles)
    # and their in-progress .part files are stored. Empty means "next to the
    # database file" (<dir of db_path>/tiles — in Docker that's the existing
    # sentinel_db volume at /app/data/tiles, so no new compose volume is
    # required). Resolved and created on startup.
    offline_tiles_dir: str = ""
    # Planet build that basemap downloads are cut from. Empty (the default)
    # means "find the newest Protomaps Basemap v4 build automatically"
    # (services/offline_map/basemap_source.py): Protomaps deletes each dated
    # build after about a week, so a fixed address would soon stop working.
    # Set it only to use a specific build, e.g. a self-hosted copy.
    offline_basemap_source_url: str = ""
    # Where the automatic lookup reads the list of available builds from, and
    # the host the dated build files live on.
    offline_basemap_builds_index_url: str = "https://build-metadata.protomaps.dev/builds.json"
    offline_basemap_builds_base_url: str = "https://build.protomaps.com"
    # Mapterhorn's whole-planet Terrarium DEM archive (z0–12), the same source
    # our bundled uk-terrain.pmtiles was built from.
    offline_terrain_source_url: str = "https://download.mapterhorn.com/planet.pmtiles"
    # Path/name of the go-pmtiles binary (bundled in backend/Dockerfile; must be
    # on PATH or an absolute path for local, non-Docker dev).
    pmtiles_bin: str = "pmtiles"
    # Bundled base archives that every tile resolver falls back to underneath
    # any downloaded regions. Relative paths are resolved from the repo root.
    offline_basemap_base_archive: str = str(_ROOT_DIR / "frontend" / "assets" / "tiles" / "uk.pmtiles")
    offline_terrain_base_archive: str = str(_ROOT_DIR / "frontend" / "assets" / "tiles" / "uk-terrain.pmtiles")
    # Safety margin applied on top of the estimated download size when checking
    # free disk space before queuing a job (10% — matches the plan's "estimate
    # plus a 10% margin" gate).
    offline_disk_margin_ratio: float = 1.10
    # How often (seconds) the job runner samples the growing .part file(s) to
    # update a running region's bytes_done for polling clients.
    offline_progress_sample_s: float = 1.0

    # ── Service registry (section-containers plan §3.2) ──────────────────────
    # Where the gateway (P5.3) reaches core itself, for the prefixes core
    # serves. The test suite's in-process app also registers every section at it.
    core_internal_url: str = "http://app:8000"
    # Seconds between health probes of each registered service, and how many
    # failed probes in a row mark it unavailable (3 x 10 s, as the plan sets).
    registry_probe_interval_s: float = 10.0
    registry_probe_failures: int = 3

    # ── Gateway (section-containers plan §4.4) ───────────────────────────────
    # Caddy's admin API, e.g. `http://gateway-admin:2019`, which core pushes the
    # registry's routes into. Empty (the default) means no gateway fronts this
    # process — the test suite's in-process app serves every path itself.
    gateway_admin_url: str = ""
    # Seconds between checks that the gateway still holds the registry's routes
    # (a restarted gateway comes back with only its static config). Registry
    # changes are pushed straight away, not on this interval.
    gateway_sync_interval_s: float = 10.0

    # ── Event bus (section-containers plan §3.3) ─────────────────────────────
    # NATS server the event bus forwards to, e.g. `nats://nats:4222`. Empty keeps
    # the bus in-process only — only the test suite's in-process app, which
    # hosts every service itself, runs that way.
    nats_url: str = ""
    # This process's NATS user: a JSON file `{"user", "password"}` written by the
    # `service-credentials` compose service
    # (backend/scripts/generate_service_credentials.py).
    # Empty connects without a user, as a broker without authorization expects.
    nats_credentials_file: str = ""
    # The CA certificate the broker's TLS certificate is checked against (a
    # `tls://` NATS_URL). Empty trusts the system's certificate authorities.
    nats_certificate_authority_file: str = ""

    # ── Internal HTTP credentials (section-containers plan §4.5, P7.4b) ──────
    # This process's own credential for the deployment's internal routes
    # (registering with core, its secret settings, the hub's IQ captures): a
    # JSON file `{"caller", "token"}` written by the `service-credentials`
    # compose service. Empty (non-Docker dev) = no credential, so nothing that
    # needs one is attempted.
    service_http_credentials_file: str = ""
    # The callers this process accepts on its internal routes, by credential
    # hash: `{"<sha256 hex>": "<caller>"}`, written for core and the radio hub
    # only. Empty = every internal route and decoder endpoint here answers 503.
    accepted_callers_file: str = ""
    # The deployment's CA certificate (written by `service-credentials`), trusted
    # on top of the public ones for HTTPS between Sentinel processes on
    # different hosts (P7.5): a service calling core's TLS service entrypoint,
    # core probing a hub behind a radio host's gateway, the SDR section fetching
    # IQ captures from it. Empty trusts only the public certificate authorities.
    internal_certificate_authority_file: str = ""
    # Where the GATEWAY container finds that CA certificate, so it can proxy to a
    # service registered at an `https://` address. A path inside the gateway's
    # container, not this one's. Empty = public certificate authorities only.
    gateway_upstream_certificate_authority_file: str = ""

    # ── SDR recordings ───────────────────────────────────────────────────────
    # The folder the SDR section saves recordings under (each recording's WAV
    # and raw IQ, in the subfolder the `sdr.recordingsFolder` setting names).
    # Compose sets it to /recordings: the `sdr_recordings` volume, or the host
    # folder SENTINEL_RECORDINGS_DIRECTORY names. Empty = recordings/ next to
    # the database.
    recordings_directory: str = ""

    # ── In-app docs ──────────────────────────────────────────────────────────
    # The folder holding `docs/` and `CONTRIBUTING.md` that the docs service
    # (`sentinel_docs`) serves. Empty = the checkout's (or the image's) root,
    # which is where the compose service bind-mounts them.
    docs_source_directory: str = ""

    # ── App mode (ADR 0007) ──────────────────────────────────────────────────
    # Which shell core serves: `full` (the map, every section) or
    # `sdr-manager-local-only` (just this machine's SDRs, shared with other
    # Sentinels). Set by the compose file, not by the user; served to the shell
    # as `GET /api/app/mode`. Anything else fails at startup.
    sentinel_mode: Literal["full", "sdr-manager-local-only"] = "full"

    # ── Running as a separate service (section-containers plan §4.2, P6) ─────
    # Set only in a service's own container (`backend/platform/sdk/`). Core's
    # address on the internal network, e.g. `http://app:8000`. Empty means this
    # process IS core (or the test suite's in-process app): settings are read
    # from the local database rather than over HTTP.
    sentinel_core_url: str = ""
    # The address core and the gateway reach this service on, e.g.
    # `http://space:8000` — the manifest's `internalUrl`.
    service_internal_url: str = ""
    # The host decoders dial this radio hub's PCM / voice-audio sockets on.
    # Empty = the host of the address above (the one the hub registers). A hub
    # behind a radio host's gateway registers that gateway's address, so its
    # decoders, on the hub's own compose network, are told `radio` instead
    # and no raw PCM port has to be published on the LAN (P7.5).
    decoder_sockets_host: str = ""
    # Identifies this copy of the service to the registry. Empty uses the host
    # name, which is stable across restarts of the same container — so a
    # restart re-registers rather than waits out its own live registration.
    service_instance_id: str = ""
    # Seconds between re-registrations. Registration is idempotent and core
    # keeps the registry in memory only, so this is how a restarted core
    # relearns the service.
    service_register_interval_s: float = 30.0
    # The monolith's database, mounted into a service's container on first
    # boot so it can copy its own tables out of it (legacy import, plan §4.3).
    # Empty or missing skips the import.
    legacy_db_path: str = ""

    # ── Request guard (ADR 0008, docs/security-guard.md) ─────────────────────
    # fastapi-guard in front of every FastAPI process: who may call which route,
    # rate limits, bans, attack detection and security headers. The policy
    # itself (limits, route rules, detection exclusions) lives in the JSON file
    # below; these settings are the per-deployment switches and the secrets.
    # Lists are comma-separated. Off switches the guard out entirely — the test
    # suite does, since TestClient's client address is not an IP.
    guard_enabled: bool = True
    # Which profile in the policy file this process uses: `core`, `section`,
    # `radio_hub`, `docs`, `sdr_manager_local` or `sdr_manager_remote`. Compose
    # sets it per service.
    guard_profile: str = "core"
    # The policy file. Empty = backend/security/guard-policy.json.
    guard_policy_file: str = ""
    # Log what would be blocked, block nothing. For tuning a new deployment.
    guard_passive_mode: bool = False
    # `enforce` refuses callers outside a route's caller classes with a 404;
    # `log` only logs them, independently of passive mode, so the access rules
    # can be observed before they bite.
    guard_access_enforcement: Literal["enforce", "log"] = "enforce"
    # Shared ban and rate-limit state, e.g. `redis://sentinel@redis:6379/0`
    # (the password comes from the file below). Empty = this process's memory,
    # which is right for one process (non-Docker dev, a radio host's hub).
    guard_redis_url: str = ""
    # A file holding the Redis password, written by `service-credentials`.
    guard_redis_password_file: str = ""
    # Key prefix in Redis, so a shared Redis never mixes two deployments.
    guard_redis_prefix: str = "sentinel_guard:"
    # Proxies allowed to say who the client is (X-Forwarded-For): the gateway.
    # Empty = trust no proxy, so the client is whoever connected.
    guard_trusted_proxies: str = ""
    # How many proxies sit in front: 1 = just the gateway.
    guard_trusted_proxy_depth: int = 1
    # The compose network the Sentinel containers share (its subnet). Callers
    # from here are other Sentinel processes; see the `internal` caller class.
    guard_internal_networks: str = ""
    # Where browsers may call from. Default: the private (RFC 1918), loopback
    # and IPv6 unique-local/link-local ranges — Sentinel is a LAN app.
    guard_client_networks: str = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,127.0.0.0/8,::1/128,fc00::/7,fe80::/10"
    # Other machines' Sentinel processes (a radio host's hub, a remote
    # section), by address or CIDR. They call the `service`/`internal` routes
    # over the TLS service entrypoint (:8443). Empty = none.
    guard_service_hosts: str = ""
    # Decoders on other machines (a radio host's), by address or CIDR. Decoders
    # on this deployment's own network need no entry. Empty = none.
    guard_decoder_hosts: str = ""
    # Other machines' SDR managers, which call this machine's SDR Manager API
    # at `/api/...`. Empty = the client networks above.
    guard_peer_networks: str = ""
    # The operator's machines: API docs, the OpenAPI schema and guard status.
    # Default: this machine only.
    guard_operator_ips: str = "127.0.0.1/32,::1/128"
    # Callers that skip rate limits and user-agent checks (bans and attack
    # detection still apply). Empty = the internal networks above.
    guard_exempt_ips: str = ""
    # Addresses always allowed (overrides the blocklist, not bans) / always
    # refused. Empty = none.
    guard_ip_allowlist: str = ""
    guard_ip_blocklist: str = ""
    # Redirect plain HTTP to HTTPS and send HSTS. Only behind a TLS front end:
    # Sentinel's own :8080 is plain HTTP.
    guard_enforce_https: bool = False
    # Believe X-Forwarded-Proto from the trusted proxies (a TLS front end).
    guard_trust_forwarded_proto: bool = False
    # Origins allowed to call the API cross-origin (CORS). Empty = CORS off;
    # the SPA is same-origin through the gateway and needs none.
    guard_cors_allow_origins: str = ""
    # Host names the SPA is opened under (e.g. `sentinel.lan,192.168.1.20`).
    # Set = settings writes must come with a Referer from one of them.
    guard_allowed_referrer_domains: str = ""
    # ISO 3166 country codes refused / the only ones allowed. Either needs the
    # IPInfo country database (token below). Empty = no country rules.
    guard_blocked_countries: str = ""
    guard_allowed_countries: str = ""
    # IPInfo token: downloads the free country/ASN database. Never commit it.
    guard_ipinfo_token: str = ""
    # Where that database is kept. Empty = next to the database file.
    guard_ipinfo_db_path: str = ""
    # Cloud providers whose published IP ranges are refused: AWS, GCP, Azure,
    # DigitalOcean, Linode, Vultr. Fetched from the providers hourly, so this
    # needs internet access. Empty = off.
    guard_block_cloud_providers: str = ""
    # Lockdown: refuse every caller except the allowlist below.
    guard_emergency_mode: bool = False
    guard_emergency_allowlist: str = ""
    # Also write guard events to this file (they always reach the process log).
    guard_log_file: str = ""
    guard_log_format: Literal["text", "json"] = "text"
    # The hosted Guard Core dashboard (guard-agent). Sends security events off
    # this machine, so it is off unless a key is set. Never commit the key.
    guard_agent_api_key: str = ""
    guard_agent_project_id: str = ""
    # Empty = the agent's own default endpoint.
    guard_agent_endpoint: str = ""
    # Pull rules from the dashboard (needs the agent).
    guard_enable_dynamic_rules: bool = False
    # OpenTelemetry traces/metrics of guard decisions, to this OTLP endpoint.
    guard_enable_otel: bool = False
    guard_otel_endpoint: str = ""
    # Pydantic Logfire export of the same.
    guard_enable_logfire: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # .env is shared with Docker Compose, which reads its own keys from it
        # (COMPOSE_PROFILES, …). Those are not app settings, and refusing them
        # made the app fail to start outside Docker as soon as one was set.
        extra = "ignore"


# Singleton settings object — imported by all modules that need configuration
settings = Settings()


def resolved_offline_tiles_dir() -> Path:
    """Resolve `settings.offline_tiles_dir` to an absolute directory.

    An empty value (the default) means "next to the database file" —
    `<dir of db_path>/tiles` — resolved against the repo root exactly like
    `db_path` itself, so it lands on the `sentinel_db` volume in Docker
    (`/app/data/tiles`) rather than silently resolving to `Path("")` (the
    process's current working directory — the container's ephemeral layer in
    Docker, or the repo root locally) if a caller forgets this step. Every
    reader of the tiles directory (the job runner, the tile resolver, the
    status endpoint's disk-usage scan) must go through this one function
    rather than reading `settings.offline_tiles_dir` directly.
    """
    if settings.offline_tiles_dir:
        return Path(settings.offline_tiles_dir)
    db_path = Path(settings.db_path)
    if not db_path.is_absolute():
        db_path = _ROOT_DIR / db_path
    return db_path.parent / "tiles"


def resolved_app_config_path() -> Path:
    """Resolve `settings.app_config_path` (the live config file) to an absolute path."""
    config_path = Path(settings.app_config_path)
    return config_path if config_path.is_absolute() else _ROOT_DIR / config_path
