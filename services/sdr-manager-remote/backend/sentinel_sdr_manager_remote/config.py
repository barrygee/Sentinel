"""sdr-manager-remote's own configuration: every `SDR_MANAGER_REMOTE_*` environment variable.

What it shares with every Sentinel service — `DB_PATH`, `SENTINEL_CORE_URL`,
`SERVICE_INTERNAL_URL`, the credential files — is `backend.config`'s.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """How often remote SDR hosts are polled and how long a call to one may take.

    Compose passes these from the repo's `.env`, so no `env_file` is read here.
    """

    model_config = SettingsConfigDict(env_prefix="SDR_MANAGER_REMOTE_", extra="ignore")

    poll_interval_s: float = Field(default=2.0, gt=0, description="How often each enabled host's status is polled")
    poll_backoff_start_s: float = Field(
        default=2.0,
        gt=0,
        description="Backoff after a failed poll; doubles on each further failure up to poll_backoff_max_s",
    )
    poll_backoff_max_s: float = Field(
        default=30.0,
        gt=0,
        description="Cap on the poll backoff, so a long-dead host is still retried now and then",
    )
    location_refresh_s: float = Field(
        default=60.0,
        gt=0,
        # A host is a fixed installation: its position changes when an operator
        # re-sites it, not between one status frame and the next.
        description="How often a host's self-reported position (GET /api/v1/sdrs `source.location`) is refreshed",
    )
    connect_timeout_s: float = Field(default=3.0, gt=0, description="TCP connect timeout for calls to a host")
    read_timeout_s: float = Field(default=5.0, gt=0, description="Read timeout for calls to a host, once connected")
    local_link_interval_s: float = Field(
        default=10.0,
        gt=0,
        description="How often core's registry is asked for this machine's sdr-manager-local (the This machine row)",
    )


@lru_cache
def get_settings() -> Settings:
    """The process's settings, read from the environment once."""
    return Settings()
