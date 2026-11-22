"""The Land section's tables: APRS stations heard on air, and the cached UK repeater directory.

They live in the Land service's own database (`land.db`). They share core's
declarative `Base`, so the test suite's in-process app creates them with
the rest of the schema once this module is imported.
"""

from backend.database import Base
from sqlalchemy import Column, Float, Integer, Text


class AprsStation(Base):
    """Latest known position/status of an APRS station heard via the Land decoder.

    One row per station callsign (upserted on each received position packet), so
    the Land map plots the most recent fix for each station. Rows older than
    ``aprs_station_ttl_ms`` are removed by the periodic cleanup sweep.
    """

    __tablename__ = "aprs_stations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    callsign = Column(Text, nullable=False, unique=True)  # e.g. "M0ABC-9" — station identity
    latitude = Column(Float, nullable=False)  # decimal degrees N
    longitude = Column(Float, nullable=False)  # decimal degrees E
    symbol = Column(Text)  # APRS symbol code (table + code, e.g. "/>") if present
    comment = Column(Text)  # free-text status/comment field
    course = Column(Float)  # course over ground in degrees, if present
    speed = Column(Float)  # speed in knots, if present
    altitude = Column(Float)  # altitude in feet, if present
    path = Column(Text)  # digipeater path, e.g. "WIDE1-1,WIDE2-1"
    raw = Column(Text)  # the raw TNC2 packet the fix was parsed from
    last_heard_ms = Column(Integer, nullable=False)  # Unix ms this station was last heard


class RepeaterCache(Base):
    """Cached UK amateur-radio repeater list (ukrepeater.net / RSGB ETCC CSV export).

    One row per source (``cache_key`` is the export name, currently just ``"uk"``);
    ``payload`` is the normalised station list as JSON so a warm start or an
    unreachable upstream can serve the last-known list. Refreshed on demand once
    ``expires_at`` passes (see ``sentinel_land.services.repeaters``).
    """

    __tablename__ = "repeater_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(Text, nullable=False, unique=True)  # export identity, e.g. "uk"
    payload = Column(Text, nullable=False)  # JSON list of normalised repeater stations
    fetched_at = Column(Integer, nullable=False)  # Unix ms when the upstream CSV was fetched
    expires_at = Column(Integer, nullable=False)  # fetched_at + repeaters_ttl_ms
