from pathlib import Path

from pydantic_settings import BaseSettings

# Repo root, used to resolve the bundled base PMTiles archives from a relative
# default without depending on the process's current working directory.
_ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Path to the SQLite database file (relative to the project root)
    db_path: str = "backend/sentinel.db"

    # How long ADS-B aircraft data is considered fresh (10 seconds — matches the upstream rate limit)
    adsb_ttl_ms: int = 10000
    # How long a stale ADS-B response can still be served if the upstream fails (60 seconds)
    adsb_stale_ms: int = 60000

    # Base URL for the online ADS-B API. adsb.lol serves the same `/point/{lat}/
    # {lon}/{radius}` shape airplanes.live used to: airplanes.live closed its v2
    # endpoint behind an auth key ("403: Check auth key"), and this feed is the
    # keyless drop-in replacement — same response fields, no registration.
    adsb_upstream_base: str = "https://api.adsb.lol/v2"
    # Minimum gap between two outbound ADS-B requests to the same upstream host
    # (5 seconds — these feeds ban clients that poll faster than this).
    adsb_min_request_interval_ms: int = 5000
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
    # or invalid. 20 s matches the cadence the watcher had before they existed.
    adsb_watch_online_interval_s: float = 20.0
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
    # Shared secret the decoder must present on POST /api/sdr/decode/ingest.
    # Normally left empty: the backend auto-generates one on startup and writes
    # it to `decoder_secret_file` (a volume the decoder container also mounts),
    # so neither side needs manual configuration. Set this to pin an explicit
    # secret (it takes precedence over the generated file).
    decoder_ingest_secret: str = ""
    # Path to the auto-generated/shared ingest secret. Mounted into both the app
    # and decoder containers via a shared volume (see docker-compose.yml).
    decoder_secret_file: str = "/run/decoder/secret"
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

    # ── Sentry integration (ADR-0009: Sentry owns SDR device state, Sentinel is a client) ──
    # How often each enabled Sentry host is polled for GET /api/status, in seconds.
    sentry_poll_interval_s: float = 2.0
    # Starting backoff (seconds) applied after a failed poll; doubles on each
    # further consecutive failure up to sentry_poll_backoff_max_s.
    sentry_poll_backoff_start_s: float = 2.0
    # Cap on the exponential poll-retry backoff, so a long-dead host is still
    # retried periodically rather than abandoned.
    sentry_poll_backoff_max_s: float = 30.0
    # How often a host's self-reported position (GET /api/v1/sdrs `source.location`)
    # is refreshed, in seconds. Far slower than the status poll on purpose: a
    # Sentry is a fixed installation, so its position changes when an operator
    # re-sites it, not between one status frame and the next.
    sentry_location_refresh_s: float = 60.0
    # TCP connect timeout (seconds) for calls to a Sentry host — the Pi may be
    # slow to respond or simply off the network.
    sentry_connect_timeout_s: float = 3.0
    # Read timeout (seconds) for calls to a Sentry host, once connected.
    sentry_read_timeout_s: float = 5.0

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
    # Shared secret a service presents to POST /internal/registry/register. Set
    # it in `.env` (never committed). Empty disables registration over HTTP: the
    # monolith's own sections register in-process and need no token.
    sentinel_join_token: str = ""
    # Where the join token lives when it isn't set above: core generates it on
    # first start and every service on the same compose stack reads it from
    # this shared volume, so a split deployment needs no configuration. Empty
    # (the default, and non-Docker dev) means no file: registration then needs
    # an explicit SENTINEL_JOIN_TOKEN.
    sentinel_join_token_file: str = ""
    # Services the monolith must NOT host in-process, comma-separated (e.g.
    # `space`), because they run in their own containers (P6). Their routers,
    # lifecycles and in-process registrations are left out. A service that
    # registers over HTTP takes its id over from the in-process copy anyway;
    # listing it here also skips the copy's startup work and keeps it gone
    # when the container is stopped (the "section absent" deployment).
    sentinel_external_services: str = ""
    # Where core reaches this process's own sections. The monolith registers
    # every section in-process with this URL; the gateway (P5.3) routes to it.
    core_internal_url: str = "http://app:8000"
    # Seconds between health probes of each registered service, and how many
    # failed probes in a row mark it unavailable (3 x 10 s, as the plan sets).
    registry_probe_interval_s: float = 10.0
    registry_probe_failures: int = 3

    # ── Gateway (section-containers plan §4.4) ───────────────────────────────
    # Caddy's admin API, e.g. `http://gateway:2019`, which core pushes the
    # registry's routes into. Empty (the default) means no gateway fronts this
    # process — the all-in-one app serves every path itself.
    gateway_admin_url: str = ""
    # Seconds between checks that the gateway still holds the registry's routes
    # (a restarted gateway comes back with only its static config). Registry
    # changes are pushed straight away, not on this interval.
    gateway_sync_interval_s: float = 10.0

    # ── Event bus (section-containers plan §3.3) ─────────────────────────────
    # NATS server the event bus forwards to, e.g. `nats://nats:4222`. Empty keeps
    # the bus in-process only — the all-in-one app needs no broker.
    nats_url: str = ""

    # ── Running as a separate service (section-containers plan §4.2, P6) ─────
    # Set only in a service's own container (`backend/platform/sdk/`). Core's
    # address on the internal network, e.g. `http://app:8000`. Empty (the
    # monolith) means this process IS core: settings are read from the local
    # database rather than over HTTP.
    sentinel_core_url: str = ""
    # The address core and the gateway reach this service on, e.g.
    # `http://space:8000` — the manifest's `internalUrl`.
    service_internal_url: str = ""
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
