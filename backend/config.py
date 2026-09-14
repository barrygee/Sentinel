from pydantic_settings import BaseSettings


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
    # Fallback retention (ms) for a heard APRS station on the Land map before it
    # is dropped, used when no user override is set. Default 5 minutes. The user
    # can override this per-install via the `land`/`aprsRetentionMinutes` setting
    # (seeded from default_config.json); aprs_store reads that and falls back to
    # this value.
    aprs_station_ttl_ms: int = 300_000

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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Singleton settings object — imported by all modules that need configuration
settings = Settings()
