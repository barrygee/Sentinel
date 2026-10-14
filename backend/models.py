from backend.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, Text, UniqueConstraint


class AirMessage(Base):
    """Air-domain notification message (emergency squawks, system alerts, etc.)."""

    __tablename__ = "air_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    msg_id = Column(Text, nullable=False, unique=True)  # client-generated unique id
    type = Column(Text, nullable=False)  # 'emergency'|'flight'|'system'|'squawk-clr' etc.
    title = Column(Text, nullable=False)  # short headline shown in the panel
    detail = Column(Text, nullable=False, default="")  # optional secondary text
    ts = Column(Integer, nullable=False)  # Unix ms timestamp of the event
    dismissed = Column(Boolean, nullable=False, default=False)  # soft-delete flag
    # ICAO hex of the aircraft an alert is about, so clicking a server-raised
    # alert can still fly the map to it. Null for alerts about anything else.
    hex = Column(Text, nullable=True)


class SdrRadio(Base):
    """A configured SDR device reachable via rtl_tcp on the network."""

    __tablename__ = "sdr_radios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)  # user label e.g. "Roof RTL-SDR"
    host = Column(Text, nullable=False)  # hostname or IP e.g. "192.168.1.45"
    port = Column(Integer, nullable=False, default=1234)
    description = Column(Text, nullable=False, default="")
    enabled = Column(Boolean, nullable=False, default=True)
    bandwidth = Column(Integer, nullable=True, default=None)  # Hz sample rate; None = rtl_tcp default
    rf_gain = Column(Float, nullable=True, default=None)  # dB; None = use panel default
    agc = Column(Boolean, nullable=True, default=None)  # None = not overridden
    created_at = Column(Integer, nullable=False)  # Unix ms


class UserSettings(Base):
    """User preferences and overlay toggle states, persisted across browser sessions.

    Keyed by (namespace, key) — e.g. ('air', 'overlayStates') or ('app', 'theme').
    value is stored as a JSON string to support booleans, strings, and objects.
    """

    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    namespace = Column(Text, nullable=False)  # 'app' | 'air' | 'space' | 'sea' | 'land' | 'sdr'
    key = Column(Text, nullable=False)  # e.g. 'theme', 'overlayStates', 'spaceOverlayStates'
    value = Column(Text, nullable=False)  # JSON-serialised value
    updated_at = Column(Integer, nullable=False)  # Unix ms

    __table_args__ = (UniqueConstraint("namespace", "key", name="uq_user_settings_ns_key"),)


class SentryHost(Base):
    """A Sentry instance (Raspberry Pi running rtl_tcp dongles) Sentinel knows about.

    Per ADR-0009, Sentry stays the source of truth for device configuration;
    this row holds only what is genuinely Sentinel's own — how to reach one
    Sentry host and its bearer token — plus a small amount of poll telemetry.
    Device state itself is never persisted here; it is cached in memory by
    ``backend.radio_hub.services.sentry_fleet`` and always read live through the client.
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


class OfflineMapRegion(Base):
    """One user-requested offline map region (a `pmtiles extract` job and its result).

    The primary key is a server-generated UUID string — never a client-supplied
    value — because it doubles as the on-disk filename stem
    (``<id>.pmtiles`` / ``<id>.terrain.pmtiles`` under ``settings.offline_tiles_dir``),
    so no client input ever reaches the filesystem. ``status`` tracks the job
    lifecycle; ``bytes_done``/``phase`` are updated by the job runner roughly once
    a second while running, for the frontend's polled progress bar.
    """

    __tablename__ = "offline_map_region"

    id = Column(Text, primary_key=True)  # str(uuid.uuid4()), also the archive filename stem
    label = Column(Text, nullable=False)  # operator-chosen name, 1-60 chars, stripped
    west = Column(Float, nullable=False)
    south = Column(Float, nullable=False)
    east = Column(Float, nullable=False)
    north = Column(Float, nullable=False)
    max_zoom = Column(Integer, nullable=False)
    include_basemap = Column(Boolean, nullable=False, default=True)
    include_terrain = Column(Boolean, nullable=False, default=True)
    # queued | running | complete | failed | cancelled
    status = Column(Text, nullable=False, default="queued")
    # basemap | terrain | NULL — which extract phase is currently running
    phase = Column(Text, nullable=True)
    bytes_done = Column(Integer, nullable=False, default=0)  # live progress, from .part file size(s)
    bytes_estimated = Column(Integer, nullable=False, default=0)  # from the estimator, at queue time
    tiles_estimated = Column(Integer, nullable=False, default=0)
    size_bytes = Column(Integer, nullable=True)  # final on-disk size once complete
    error = Column(Text, nullable=True)  # generic message only — never raw subprocess stderr
    source_url = Column(Text, nullable=False)  # basemap source URL used for this job (audit trail)
    created_at = Column(Integer, nullable=False)  # Unix ms
    completed_at = Column(Integer, nullable=True)  # Unix ms — set on complete/failed/cancelled
