from sqlalchemy import Boolean, Column, Float, Integer, Text

from backend.database import Base


class AdsbCache(Base):
    __tablename__ = "adsb_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(Text, nullable=False, unique=True)  # "54.1453_-4.4815_250"
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    radius_nm = Column(Integer, nullable=False, default=250)
    payload = Column(Text, nullable=False)  # raw JSON string from airplanes.live
    ac_count = Column(Integer)
    fetched_at = Column(Integer, nullable=False)   # Unix ms
    expires_at = Column(Integer, nullable=False)   # fetched_at + TTL_MS


class GeocodeCache(Base):
    __tablename__ = "geocode_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(Text, nullable=False, unique=True)  # "54.14_-4.48" (2dp)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    raw = Column(Text, nullable=False)   # full Nominatim JSON string
    fetched_at = Column(Integer, nullable=False)
    expires_at = Column(Integer, nullable=False)


class AirMessage(Base):
    """Air-domain notification messages (emergency squawks, system alerts, etc.)."""
    __tablename__ = "air_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    msg_id = Column(Text, nullable=False, unique=True)   # client-generated id
    type = Column(Text, nullable=False)                  # 'emergency'|'flight'|'system'|'squawk-clr' etc.
    title = Column(Text, nullable=False)
    detail = Column(Text, nullable=False, default="")
    ts = Column(Integer, nullable=False)                 # Unix ms
    dismissed = Column(Boolean, nullable=False, default=False)


class AirTracking(Base):
    """Currently tracked aircraft (hex codes selected by the user)."""
    __tablename__ = "air_tracking"

    id = Column(Integer, primary_key=True, autoincrement=True)
    hex = Column(Text, nullable=False, unique=True)      # ICAO 24-bit hex
    callsign = Column(Text, nullable=False, default="")
    follow = Column(Boolean, nullable=False, default=False)  # camera-follow active
    added_at = Column(Integer, nullable=False)           # Unix ms
