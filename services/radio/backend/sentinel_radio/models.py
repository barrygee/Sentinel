"""The radio hub's table: the Sentry hosts it polls and claims dongles through.

It lives in the radio hub service's own database (`radio.db`). It shares
core's declarative `Base`, so the in-process app and the test suite create it
with the rest of the schema once this module is imported. The radios themselves
are not the hub's to store: they are a core setting (`sdr.radios`).
"""

from backend.database import Base
from sqlalchemy import Boolean, Column, Integer, Text, UniqueConstraint


class SentryHost(Base):
    """A Sentry instance (Raspberry Pi running rtl_tcp dongles) Sentinel knows about.

    Per ADR-0009, Sentry stays the source of truth for device configuration;
    this row holds only what is genuinely Sentinel's own — how to reach one
    Sentry host and its bearer token — plus a small amount of poll telemetry.
    Device state itself is never persisted here; it is cached in memory by
    ``sentinel_radio.services.sentry_fleet`` and always read live through the client.
    """

    __tablename__ = "sentry_hosts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=True)  # operator label; falls back to `address` when unset
    address = Column(Text, nullable=False)  # hostname or IPv4 address of the Pi
    port = Column(Integer, nullable=False, default=8000)
    auth_token = Column(Text, nullable=False, default="")  # Sentry's bearer token — write-only over the API
    enabled = Column(Boolean, nullable=False, default=True)  # whether the fleet poller polls this host
    created_at = Column(Integer, nullable=False)  # Unix ms
    last_seen_at = Column(Integer, nullable=True)  # Unix ms of the last successful poll
    last_error = Column(Text, nullable=True)  # human-readable reason for the last poll failure, if any

    __table_args__ = (UniqueConstraint("address", "port", name="uq_sentry_hosts_address_port"),)
