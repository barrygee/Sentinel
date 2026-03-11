from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_path: str = "backend/sentinel.db"
    adsb_ttl_ms: int = 5000          # 5 seconds — live aircraft data
    adsb_stale_ms: int = 30000       # 30 seconds — serve stale on upstream failure
    geocode_ttl_ms: int = 600000     # 10 minutes
    geocode_stale_ms: int = 3600000  # 1 hour
    adsb_upstream_base: str = "https://api.airplanes.live/v2"
    nominatim_base: str = "https://nominatim.openstreetmap.org"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
