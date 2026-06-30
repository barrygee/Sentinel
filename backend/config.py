from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Path to the SQLite database file (relative to the project root)
    db_path: str = "backend/sentinel.db"

    # How long ADS-B aircraft data is considered fresh (10 seconds — matches airplanes.live rate limit)
    adsb_ttl_ms: int = 10000
    # How long a stale ADS-B response can still be served if the upstream fails (60 seconds)
    adsb_stale_ms: int = 60000

    # Base URL for the airplanes.live ADS-B API
    adsb_upstream_base: str = "https://api.airplanes.live/v2"

    # TLE data TTL — 6 hours (TLE changes slowly; Celestrak updates daily)
    tle_ttl_ms: int = 21_600_000
    # Stale window for TLE — 12 hours (serve old TLE if Celestrak is unreachable)
    tle_stale_ms: int = 43_200_000
    # TTL for manually-entered TLE data — 30 days (user explicitly provided it)
    tle_manual_ttl_ms: int = 2_592_000_000
    # Celestrak TLE URL for the ISS (NORAD ID 25544)
    celestrak_iss_url: str = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"

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
    # TCP port the backend's rigctld-compatible server listens on for trunk
    # tracking. dsd-fme (run with `-U <port>`) connects here as a rigctl CLIENT
    # and drives retunes; the backend translates each requested frequency into a
    # demod offset shift or a hardware retune. 4532 is dsd-fme's SDR++ default.
    decoder_rigctl_port: int = 4532
    # Guard band (Hz) kept clear at each edge of the captured span when deciding
    # whether a requested trunk frequency can be reached by an in-span demod
    # offset shift (preferred) rather than a hardware retune (fallback). Sized so
    # a full channel stays inside the span rather than clipping the edge.
    decoder_rigctl_guard_hz: int = 25_000
    # Directory holding trunking channel-map / group-list CSVs. Mounted into both
    # the app (to list them for the UI) and decoder (dsd-fme reads them) containers
    # from ./decoder/channel-maps. The relative default works for a local dev run
    # from the repo root; compose overrides it to the in-container path.
    channel_maps_dir: str = "decoder/channel-maps"
    # Offset added to a radio's rtl_tcp port to reach the fan-out relay's NDJSON
    # tuning-ownership control channel (e.g. IQ 1234 → control 1236). Must match the
    # relay's RELAY_CONTROL_PORT (which itself defaults to LISTEN_PORT + 2). When the
    # control port is unreachable (a raw rtl_tcp, or a relay without the channel) the
    # backend falls back to direct last-writer-wins tuning over the IQ socket.
    sdr_relay_control_port_offset: int = 2
    # How long to wait (seconds) for the relay to confirm a claim/ownership state
    # before treating the attempt as "not owner" and the channel probe as absent.
    sdr_relay_control_timeout_s: float = 2.0

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Singleton settings object — imported by all modules that need configuration
settings = Settings()
