"""The columns every position-history table shares."""

from sqlalchemy import Column, Float, Index, Integer, Text, UniqueConstraint
from sqlalchemy.orm import declared_attr


class PositionHistoryMixin:
    """One recorded position of one tracked thing (aircraft, vessel, APRS station).

    ``entity_id`` is the identity that stays the same whichever source heard it
    (ICAO hex, MMSI, callsign), so a track carries straight across a switch
    between online and off-grid sources. ``t_ms`` is when the position was
    *observed*, not when it was fetched: together they are unique, which is
    what lets a cached snapshot or the overlap at a source switch be offered
    twice without writing a duplicate.
    """

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity_id = Column(Text, nullable=False)
    t_ms = Column(Integer, nullable=False)  # Unix ms the position was observed
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    alt = Column(Float)  # feet, when the source reports one
    heading = Column(Float)  # degrees true (track / course over ground)
    speed = Column(Float)  # knots
    source_mode = Column(Text, nullable=False, default="online")  # 'online' | 'offgrid'
    extra = Column(Text)  # JSON: section-specific display fields (callsign, name, symbol…)

    @declared_attr.directive
    def __table_args__(cls) -> tuple:  # noqa: N805 — SQLAlchemy passes the class
        table_name = cls.__tablename__  # type: ignore[attr-defined]
        return (
            # The prune and the replay window both range-scan on time.
            Index(f"ix_{table_name}_t_ms", "t_ms"),
            # Dedupe key; its leading column also serves per-entity lookups.
            UniqueConstraint("entity_id", "t_ms", name=f"uq_{table_name}_entity_t"),
        )
