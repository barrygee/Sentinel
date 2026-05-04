"""Flight history service — records ADS-B snapshots to the database.

Called as a FastAPI BackgroundTask after each successful upstream ADS-B fetch.
Aircraft are keyed by registration ('r' field) with ICAO hex as fallback.
"""

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import AsyncSessionLocal
from backend.models import AirAircraft, AirFlight, AirSnapshot

FLIGHT_GAP_MS       = 10 * 60 * 1000   # 10-min absence → new flight session
SNAPSHOT_INTERVAL_MS = 10 * 1000        # max one snapshot per aircraft per 10s
MAX_HISTORY_DAYS    = 30


def _reg_key(ac: dict) -> str:
    """Return the registration key for an aircraft dict (r field, then hex fallback)."""
    return (ac.get("r") or ac.get("hex") or "").strip()


async def record_aircraft_batch(
    aircraft_list: list[dict],
    db: AsyncSession,
    now: int,
) -> None:
    """Upsert aircraft identity, detect flight sessions, and write position snapshots.

    Only processes aircraft that have both lat and lon populated.
    All writes committed in a single transaction to minimise SQLite lock time.
    """
    for ac in aircraft_list:
        lat = ac.get("lat")
        lon = ac.get("lon")
        if lat is None or lon is None:
            continue

        reg = _reg_key(ac)
        if not reg:
            continue

        hex_val   = (ac.get("hex") or "").strip()
        type_code = (ac.get("t")   or "").strip()
        callsign  = (ac.get("flight") or "").strip()

        # 1. Upsert air_aircraft row
        result = await db.execute(select(AirAircraft).where(AirAircraft.registration == reg))
        aircraft = result.scalar_one_or_none()

        if aircraft is None:
            aircraft = AirAircraft(
                registration=reg,
                hex=hex_val,
                type_code=type_code,
                callsign=callsign,
                first_seen=now,
                last_seen=now,
                flight_count=0,
            )
            db.add(aircraft)
            await db.flush()  # populate aircraft.id
        else:
            aircraft.last_seen = now
            if hex_val:
                aircraft.hex = hex_val
            if type_code:
                aircraft.type_code = type_code
            if callsign:
                aircraft.callsign = callsign

        # 2. Find most recent flight session for this registration
        flight_result = await db.execute(
            select(AirFlight)
            .where(AirFlight.registration == reg)
            .order_by(AirFlight.last_active_at.desc())
            .limit(1)
        )
        flight = flight_result.scalar_one_or_none()

        # 3. Start a new flight if none exists or gap exceeded
        new_flight = flight is None or (now - flight.last_active_at) > FLIGHT_GAP_MS
        if new_flight:
            flight = AirFlight(
                aircraft_id=aircraft.id,
                registration=reg,
                callsign=callsign,
                started_at=now,
                last_active_at=now,
                snapshot_count=0,
            )
            db.add(flight)
            aircraft.flight_count += 1
            await db.flush()  # populate flight.id
        else:
            # Update callsign if we now have one
            if callsign and not flight.callsign:
                flight.callsign = callsign

        # 4. Write snapshot if enough time has passed
        if new_flight or (now - flight.last_active_at) >= SNAPSHOT_INTERVAL_MS:
            alt = ac.get("alt_baro")
            if isinstance(alt, str):
                alt = None  # "ground" string → store NULL

            db.add(AirSnapshot(
                flight_id=flight.id,
                ts=now,
                lat=lat,
                lon=lon,
                alt_baro=int(alt) if alt is not None else None,
                gs=ac.get("gs"),
                track=ac.get("track"),
                baro_rate=ac.get("baro_rate"),
                squawk=ac.get("squawk") or None,
            ))
            flight.snapshot_count += 1

        # 5. Always update last_active_at
        flight.last_active_at = now

    await db.commit()


async def cleanup_old_snapshots(max_days: int = MAX_HISTORY_DAYS) -> None:
    """Delete snapshots and flights older than max_days, then prune aircraft with no flights."""
    from backend.cache import now_ms  # local import to avoid circular dependency

    cutoff_ms = now_ms() - (max_days * 24 * 60 * 60 * 1000)

    async with AsyncSessionLocal() as db:
        # Find old flight IDs
        old_flights_result = await db.execute(
            select(AirFlight.id).where(AirFlight.last_active_at < cutoff_ms)
        )
        old_flight_ids = [row[0] for row in old_flights_result.all()]

        if old_flight_ids:
            await db.execute(
                delete(AirSnapshot).where(AirSnapshot.flight_id.in_(old_flight_ids))
            )
            await db.execute(
                delete(AirFlight).where(AirFlight.id.in_(old_flight_ids))
            )

        # Prune aircraft that have no remaining flights
        aircraft_with_flights_result = await db.execute(
            select(AirFlight.aircraft_id).distinct()
        )
        active_aircraft_ids = {row[0] for row in aircraft_with_flights_result.all()}

        orphan_result = await db.execute(select(AirAircraft.id))
        all_aircraft_ids = [row[0] for row in orphan_result.all()]
        orphan_ids = [aid for aid in all_aircraft_ids if aid not in active_aircraft_ids]

        if orphan_ids:
            await db.execute(
                delete(AirAircraft).where(AirAircraft.id.in_(orphan_ids))
            )

        await db.commit()
