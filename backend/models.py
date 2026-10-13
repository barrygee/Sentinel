from backend.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, Text, UniqueConstraint


class AdsbCache(Base):
    """Cached ADS-B response from the online ADS-B feed.

    Each row stores one bounding-box query result (lat/lon/radius).
    Served fresh within adsb_ttl_ms, or stale within adsb_stale_ms on upstream failure.
    """

    __tablename__ = "adsb_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(Text, nullable=False, unique=True)  # e.g. "54.1453_-4.4815_250"
    lat = Column(Float, nullable=False)  # query centre latitude
    lon = Column(Float, nullable=False)  # query centre longitude
    radius_nm = Column(Integer, nullable=False, default=250)  # search radius in nautical miles
    payload = Column(Text, nullable=False)  # raw JSON string from the upstream feed
    ac_count = Column(Integer)  # number of aircraft in the response
    fetched_at = Column(Integer, nullable=False)  # Unix ms when this row was fetched
    expires_at = Column(Integer, nullable=False)  # fetched_at + TTL_MS


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


class AirTracking(Base):
    """Aircraft currently being tracked by the user (selected in the ADS-B panel)."""

    __tablename__ = "air_tracking"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hex = Column(Text, nullable=False, unique=True)  # ICAO 24-bit hex identifier
    callsign = Column(Text, nullable=False, default="")
    follow = Column(Boolean, nullable=False, default=False)  # camera-follow mode active
    added_at = Column(Integer, nullable=False)  # Unix ms when tracking began


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


class SdrFrequencyGroup(Base):
    """Named group that organises stored frequencies (e.g. 'Aviation', 'Marine')."""

    __tablename__ = "sdr_frequency_groups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    slug = Column(Text, nullable=False, default="")  # rename-stable key, e.g. "air-to-air-refueling"
    color = Column(Text, nullable=False, default="#c8ff00")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(Integer, nullable=False)  # Unix ms


class SdrStoredFrequency(Base):
    """An individual saved frequency (bookmark) with tuning parameters."""

    __tablename__ = "sdr_stored_frequencies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    group_id = Column(Integer, nullable=True)  # FK → sdr_frequency_groups.id (nullable = ungrouped)
    label = Column(Text, nullable=False)  # e.g. "ATIS 118.05"
    frequency_hz = Column(Integer, nullable=False)  # stored as integer Hz e.g. 118050000
    mode = Column(Text, nullable=False, default="AM")  # AM|NFM|WFM|USB|LSB|CW
    squelch = Column(Float, nullable=False, default=-60.0)  # dBFS threshold
    gain = Column(Float, nullable=False, default=30.0)  # dB RF gain; use -1.0 for auto (AGC)
    # Per-frequency tuning settings, applied when the user clicks the frequency
    # or a scan stops on it. bandwidth/sample_rate are nullable so an unset value
    # falls back to the live/per-mode default; the rest carry concrete defaults.
    bandwidth = Column(
        Integer, nullable=True, default=None
    )  # demod (audio filter) bandwidth Hz; None = per-mode default
    sample_rate = Column(Integer, nullable=True, default=None)  # device sample rate Hz; None = keep current
    volume = Column(Integer, nullable=False, default=80)  # audio volume 0-100 (%)
    zoom = Column(Float, nullable=False, default=1.0)  # waterfall zoom factor
    zmin = Column(Float, nullable=False, default=0.0)  # waterfall Min dB (0 = auto/unset)
    zmax = Column(Float, nullable=False, default=0.0)  # waterfall Max dB (0 = auto/unset)
    scannable = Column(Boolean, nullable=False, default=True)
    favourite = Column(Boolean, nullable=False, default=False)
    notes = Column(Text, nullable=False, default="")
    created_at = Column(Integer, nullable=False)  # Unix ms


class SdrFrequencyGroupLink(Base):
    """Junction table — many-to-many between stored frequencies and groups."""

    __tablename__ = "sdr_frequency_group_links"

    frequency_id = Column(Integer, primary_key=True)
    group_id = Column(Integer, primary_key=True)


class SdrSearchRange(Base):
    """A named low/high frequency range with a step size, used by the SDR
    Search feature to sweep a band and stop on signals."""

    __tablename__ = "sdr_search_ranges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    label = Column(Text, nullable=False)  # e.g. "Air Band"
    low_hz = Column(Integer, nullable=False)  # inclusive sweep start
    high_hz = Column(Integer, nullable=False)  # inclusive sweep end
    step_hz = Column(Integer, nullable=False, default=12500)  # channel spacing
    mode = Column(Text, nullable=False, default="NFM")  # AM|NFM|WFM|USB|LSB|CW
    threshold_dbfs = Column(Float, nullable=False, default=-35.0)  # stop-on-signal threshold
    dwell_ms = Column(Integer, nullable=False, default=250)  # ms per step
    band_name = Column(Text, nullable=False, default="")  # optional sdr.bandPlan ref
    enabled = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=False, default="")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(Integer, nullable=False)  # Unix ms


class SdrRecording(Base):
    """A recorded audio clip captured from the SDR demodulator."""

    __tablename__ = "sdr_recordings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False)
    notes = Column(Text, nullable=False, default="")
    radio_id = Column(Integer, nullable=True)
    radio_name = Column(Text, nullable=False, default="")
    frequency_hz = Column(Integer, nullable=False)
    mode = Column(Text, nullable=False, default="AM")
    gain_db = Column(Float, nullable=False, default=30.0)
    squelch_dbfs = Column(Float, nullable=False, default=-60.0)
    sample_rate = Column(Integer, nullable=False, default=2048000)
    started_at = Column(Text, nullable=False)  # ISO-8601 UTC e.g. "2026-04-06T12:34:56Z"
    ended_at = Column(Text, nullable=False, default="")
    duration_s = Column(Float, nullable=False, default=0.0)
    file_size_bytes = Column(Integer, nullable=False, default=0)
    has_iq_file = Column(Boolean, nullable=False, default=False)
    iq_file_size_bytes = Column(Integer, nullable=False, default=0)
    status = Column(Text, nullable=False, default="recording")  # "recording"|"complete"|"error"
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


class SeaVesselCache(Base):
    """Last-known snapshot of every live AIS vessel, persisted for warm starts.

    The live vessel picture lives in memory (``backend.services.ais_store``) and is
    written through here on a slow cadence (``sea_ais_snapshot_persist_ms``). On
    startup the store reloads any rows still inside the retention window so the
    Sea map shows the last-known picture — flagged STALE — while the AISStream
    socket reconnects, and keeps showing it if the upstream is unreachable.
    """

    __tablename__ = "sea_vessel_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mmsi = Column(Text, nullable=False, unique=True)  # Maritime Mobile Service Identity, 5–10 digits
    payload = Column(Text, nullable=False)  # JSON-serialised vessel record (see ais_store.vessel_record)
    track = Column(Text, nullable=False, default="[]")  # JSON list of [lat, lon, epoch_s] recent fixes
    updated_at = Column(Integer, nullable=False)  # Unix ms of the newest position report


class SeaVesselStatic(Base):
    """What each vessel has been heard to call itself, kept long after it leaves.

    A position report carries only the MMSI; the name, callsign, IMO and ship type
    come in a separate static-data report that a ship sends every few minutes, so
    a vessel heard only by position (common off grid, where reception is patchy)
    shows as "MMSI …". This directory outlives the 30-minute live picture, restarts
    and online/off-grid source switches, so a ship that has ever been named — by
    either source — is named the moment it is next heard. Destination is left out:
    it changes every voyage. Rows unheard for ``sea_vessel_static_retention_ms``
    are dropped.
    """

    __tablename__ = "sea_vessel_static"

    id = Column(Integer, primary_key=True, autoincrement=True)
    mmsi = Column(Text, nullable=False, unique=True)  # Maritime Mobile Service Identity, 5–10 digits
    name = Column(Text, nullable=False, default="")
    callsign = Column(Text, nullable=False, default="")
    imo = Column(Text, nullable=False, default="")
    ship_type = Column(Text, nullable=False, default="")  # ITU-R M.1371 ship-and-cargo type code
    updated_at = Column(Integer, nullable=False)  # Unix ms the static data was last heard


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
