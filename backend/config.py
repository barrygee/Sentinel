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

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# Singleton settings object — imported by all modules that need configuration
settings = Settings()
