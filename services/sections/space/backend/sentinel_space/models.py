"""The Space section's tables: cached TLEs and the satellite catalogue.

They live in the Space service's own database (`space.db`). They share core's
declarative `Base`, so the in-process app and the test suite create them with
the rest of the schema once this module is imported.
"""

from backend.database import Base
from sqlalchemy import Column, Float, Integer, Text


class TleCache(Base):
    """Cached TLE text fetched from Celestrak or entered manually.

    cache_key is the NORAD catalogue number as a string (e.g. '25544').
    payload stores the raw three-line element text (name + TLE1 + TLE2).
    source indicates how this entry arrived: 'online', 'url', 'upload', or 'manual'.
    Manual/upload/url entries have a far-future expires_at and are not auto-refreshed.
    """

    __tablename__ = "tle_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    cache_key = Column(Text, nullable=False, unique=True)  # NORAD ID e.g. "25544"
    payload = Column(Text, nullable=False)  # raw 3-line TLE text
    source = Column(Text, nullable=False, default="online")  # 'online'|'url'|'upload'|'manual'
    fetched_at = Column(Integer, nullable=False)  # Unix ms when fetched/entered
    expires_at = Column(Integer, nullable=False)  # fetched_at + TTL_MS (or far-future for manual)


class SatelliteCatalogue(Base):
    """Permanent identity record for known satellites.

    One row per NORAD ID. Stores the satellite name and category independently
    of TLE orbital data. Records are never deleted by TLE imports — only by an
    explicit clear. Category is preserved across TLE updates and only overwritten
    by a higher-priority source (celestrak_group > user > inferred > active).
    """

    __tablename__ = "satellite_catalogue"

    norad_id = Column(Text, primary_key=True)  # NORAD catalogue number e.g. "25544"
    name = Column(Text, nullable=False)  # e.g. "ISS (ZARYA)"
    category = Column(Text, nullable=True)  # 'space_station'|'amateur'|'weather'|
    # 'military'|'navigation'|'science'|
    # 'cubesat'|'active'|'unknown'|NULL
    category_source = Column(Text, nullable=True)  # 'celestrak_group'|'user'|'active'|NULL
    name_source = Column(Text, nullable=True)  # NULL | 'user' — 'user' locks name against TLE updates
    updated_at = Column(Integer, nullable=False)  # Unix ms of last TLE update for this sat
    # Radio info — used for amateur satellites, but the columns are generic and any sat may have them.
    # Frequencies stored as integer Hz. Modes are free text (FM|SSB|CW|FSK|GMSK|APRS|SSTV|DIGITAL etc.).
    uplink_hz = Column(Integer, nullable=True)  # uplink frequency in Hz, or NULL
    uplink_mode = Column(Text, nullable=True)  # uplink modulation e.g. "FM"
    downlink_hz = Column(Integer, nullable=True)  # downlink frequency in Hz, or NULL
    downlink_mode = Column(Text, nullable=True)  # downlink modulation e.g. "FM"
    ctcss_hz = Column(
        Float, nullable=True
    )  # CTCSS sub-audible tone in Hz (e.g. 67.0), if required to access an FM repeater
    transponder_type = Column(Text, nullable=True)  # 'FM'|'Linear'|'Digital'|'SSTV'|'Telemetry'|'APRS' etc.
    beacon_hz = Column(Integer, nullable=True)  # beacon frequency in Hz (often CW or telemetry), or NULL
    packet_info = Column(Text, nullable=True)  # short free text describing packet/APRS/digital details
    radio_status = Column(
        Text, nullable=True
    )  # 'active'|'inactive'|'silent'|'reentered'|'partial' — operational status of the radio payload
    radio_notes = Column(Text, nullable=True)  # free-form notes / description for the radio payload
