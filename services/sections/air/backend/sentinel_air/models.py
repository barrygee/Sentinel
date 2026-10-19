"""The Air section's tables: the ADS-B response cache and the aircraft the user is tracking.

They live in the Air service's own database (`air.db`). They share core's
declarative `Base`, so the test suite's in-process app creates them with
the rest of the schema once this module is imported. `air_messages` is not
Air's: notifications are core's, despite the path.
"""

from backend.database import Base
from sqlalchemy import Boolean, Column, Float, Integer, Text


class AdsbCache(Base):
    """Cached ADS-B response from the online ADS-B feed.

    Each row stores one bounding-box query result (lat/lon/radius).
    Served fresh within adsb_ttl_ms (online: the refresh interval), or stale within
    adsb_stale_ms (online: plus that interval) on upstream failure.
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


class AirTracking(Base):
    """Aircraft currently being tracked by the user (selected in the ADS-B panel)."""

    __tablename__ = "air_tracking"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hex = Column(Text, nullable=False, unique=True)  # ICAO 24-bit hex identifier
    callsign = Column(Text, nullable=False, default="")
    follow = Column(Boolean, nullable=False, default=False)  # camera-follow mode active
    added_at = Column(Integer, nullable=False)  # Unix ms when tracking began
