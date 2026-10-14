"""The Sea section's tables: the vessel warm-start snapshot and the static-data directory.

They live in the Sea service's own database (`sea.db`). They share core's
declarative `Base`, so the test suite's in-process app creates them with
the rest of the schema once this module is imported. The AISStream key is not
Sea's to store: it is a secret setting, kept in core.
"""

from backend.database import Base
from sqlalchemy import Column, Integer, Text


class SeaVesselCache(Base):
    """Last-known snapshot of every live AIS vessel, persisted for warm starts.

    The live vessel picture lives in memory (``sentinel_sea.services.ais_store``) and is
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
