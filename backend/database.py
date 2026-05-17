import json
import time
from pathlib import Path

from backend.config import settings
from sqlalchemy import delete, select
from sqlalchemy import text as sa_text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Path to the bundled default config — used to seed the DB on first startup.
_CONFIG_PATH = Path(__file__).parent / "default_config.json"

# Async SQLAlchemy engine backed by SQLite via aiosqlite
engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.db_path}",
    connect_args={"check_same_thread": False},  # required for SQLite async usage
)

# Session factory used by all request handlers via Depends(get_db)
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # keep objects usable after commit without a new query
)


class Base(DeclarativeBase):
    """Declarative base class — all ORM models inherit from this."""
    pass


async def create_tables():
    """Create all database tables on startup if they do not already exist."""
    async with engine.begin() as conn:
        from backend import models  # noqa: F401 — import triggers model registration with Base
        await conn.run_sync(Base.metadata.create_all)
        # Add name_source column to satellite_catalogue if it doesn't exist yet
        # (SQLite create_all does not add new columns to existing tables)
        try:
            await conn.execute(
                sa_text("ALTER TABLE satellite_catalogue ADD COLUMN name_source TEXT")
            )
        except OperationalError:
            # Column already exists — raised by SQLite on duplicate ALTER TABLE
            pass
        for col_sql in [
            "ALTER TABLE sdr_radios ADD COLUMN bandwidth INTEGER",
            "ALTER TABLE sdr_radios ADD COLUMN rf_gain REAL",
            "ALTER TABLE sdr_radios ADD COLUMN agc INTEGER",
            "ALTER TABLE air_aircraft ADD COLUMN callsign TEXT NOT NULL DEFAULT ''",
        ]:
            try:
                await conn.execute(sa_text(col_sql))
            except OperationalError:
                pass
        try:
            await conn.execute(sa_text(
                "INSERT OR IGNORE INTO sdr_frequency_group_links (frequency_id, group_id) "
                "SELECT id, group_id FROM sdr_stored_frequencies WHERE group_id IS NOT NULL"
            ))
        except OperationalError:
            pass
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS ix_air_flights_registration ON air_flights (registration)",
            "CREATE INDEX IF NOT EXISTS ix_air_snapshots_flight_id_ts ON air_snapshots (flight_id, ts)",
            "CREATE INDEX IF NOT EXISTS ix_air_aircraft_last_seen ON air_aircraft (last_seen DESC)",
            "CREATE INDEX IF NOT EXISTS ix_air_snapshots_ts ON air_snapshots (ts)",
            "CREATE INDEX IF NOT EXISTS ix_air_flights_started_last ON air_flights (started_at, last_active_at)",
        ]:
            await conn.execute(sa_text(idx_sql))
    # Ensure recordings directory exists inside the data volume
    recordings_dir = Path(settings.db_path).parent / "recordings"
    recordings_dir.mkdir(parents=True, exist_ok=True)


async def get_db():
    """FastAPI dependency that yields an async database session per request."""
    async with AsyncSessionLocal() as session:
        yield session


def _parse_config_file(path: Path) -> list[tuple[str, str, object]]:
    """Parse a config JSON file (namespace → {key: value}) into a flat list of
    (namespace, key, value) tuples suitable for seeding the database.
    Reserved keys starting with '_' (e.g. _comment) are ignored.
    """
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    config_entries = []
    for namespace, entries in raw.items():
        if namespace.startswith("_") or not isinstance(entries, dict):
            continue
        for key, value in entries.items():
            config_entries.append((namespace, key, value))
    return config_entries


# Default URL settings seeded into the database on first startup.
# Loaded from default_config.json; env-derived values override specific keys.
def _build_default_settings() -> list[tuple[str, str, object]]:
    rows = _parse_config_file(_CONFIG_PATH)
    # Allow env/config.py values to override the JSON file for API URLs
    overrides = {
        ("air",   "onlineDataSourceURL"): settings.adsb_upstream_base,
        ("space", "onlineUrl"): settings.celestrak_iss_url,
    }
    result = []
    for ns, key, value in rows:
        result.append((ns, key, overrides.get((ns, key), value)))
    return result


async def migrate_sdr_radios_to_settings() -> None:
    """One-time migration: copy rows from sdr_radios table into UserSettings sdr.radios.

    Only runs if sdr_radios has rows AND sdr.radios does not yet exist in UserSettings.
    Safe to call on every startup — skips immediately if the key already exists.
    """
    from backend.models import UserSettings  # avoid circular import

    async with AsyncSessionLocal() as session:
        # Check if sdr.radios already exists in UserSettings
        existing = await session.execute(
            select(UserSettings).where(
                UserSettings.namespace == "sdr",
                UserSettings.key == "radios",
            )
        )
        if existing.scalar_one_or_none() is not None:
            return  # already migrated or seeded — nothing to do

        # Read rows from sdr_radios (table may not exist on a fresh install)
        try:
            result = await session.execute(sa_text(
                "SELECT id, name, host, port, description, enabled, bandwidth, rf_gain, agc, created_at "
                "FROM sdr_radios ORDER BY created_at"
            ))
            rows = result.mappings().fetchall()
        except Exception:
            return  # table doesn't exist yet — nothing to migrate

        if not rows:
            return  # empty table — let seed_default_settings handle it

        radios = []
        for row in rows:
            radios.append({
                "id":          row["id"],
                "name":        row["name"],
                "host":        row["host"],
                "port":        row["port"],
                "description": row["description"] or "",
                "enabled":     bool(row["enabled"]),
                "bandwidth":   row["bandwidth"],
                "rf_gain":     row["rf_gain"],
                "agc":         bool(row["agc"]) if row["agc"] is not None else None,
                "created_at":  row["created_at"],
            })

        session.add(UserSettings(
            namespace="sdr",
            key="radios",
            value=json.dumps(radios),
            updated_at=int(time.time() * 1000),
        ))
        await session.commit()


async def sync_sdr_groups_to_config(session: AsyncSession) -> None:
    """Mirror the live SDR stored frequencies into UserSettings
    (namespace='sdr', key='frequencies') so the persisted app config JSON
    always reflects current state.

    The config representation is a flat list of frequencies, each carrying its
    own `groups` array (group names). Frequencies are never duplicated, even
    when a frequency belongs to multiple groups. Group colours are
    intentionally omitted — the `color` column still exists on the table for
    UI use."""
    from backend.db_helpers import upsert_setting  # avoid circular import
    from backend.models import (  # avoid circular import
        SdrFrequencyGroup,
        SdrFrequencyGroupLink,
        SdrStoredFrequency,
    )

    groups = (await session.execute(
        select(SdrFrequencyGroup).order_by(SdrFrequencyGroup.sort_order, SdrFrequencyGroup.id)
    )).scalars().all()
    name_by_id = {g.id: g.name for g in groups}

    links = (await session.execute(select(SdrFrequencyGroupLink))).scalars().all()
    group_ids_by_freq: dict[int, list[int]] = {}
    for link in links:
        group_ids_by_freq.setdefault(link.frequency_id, []).append(link.group_id)

    freqs = (await session.execute(
        select(SdrStoredFrequency).order_by(SdrStoredFrequency.frequency_hz)
    )).scalars().all()

    payload = []
    for f in freqs:
        # Union the many-to-many links with the legacy single group_id so no
        # membership is lost; preserve group sort order, drop unknown ids.
        gids = list(group_ids_by_freq.get(f.id, []))
        if f.group_id is not None and f.group_id not in gids:
            gids.append(f.group_id)
        names = [name_by_id[gid] for gid in name_by_id if gid in gids]
        payload.append({
            "label": f.label,
            "frequency_hz": f.frequency_hz,
            "mode": f.mode,
            "notes": f.notes,
            "groups": names,
        })

    await upsert_setting(session, "sdr", "frequencies", payload)

    # Drop the dead legacy key. `sdr.groups` is no longer purged here: it now
    # holds the names-only default-group list (seeded from default_config.json),
    # alongside the flat `sdr.frequencies` written above.
    from backend.models import UserSettings  # avoid circular import
    await session.execute(
        delete(UserSettings).where(
            UserSettings.namespace == "sdr",
            UserSettings.key == "initialGroups",
        )
    )
    await session.commit()


async def seed_default_sdr_groups() -> None:
    """Insert the default (empty) SDR frequency groups from
    default_config.json's `sdr.groups` name list — only if the
    sdr_frequency_groups table is currently empty. Users can rename/delete
    afterwards without re-seeding. Frequencies are not seeded; they are managed
    at runtime and mirrored into the flat `sdr.frequencies` config key."""
    from backend.models import SdrFrequencyGroup  # avoid circular import

    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(SdrFrequencyGroup).limit(1))
        if existing.scalar_one_or_none() is not None:
            return

        try:
            raw = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            return
        names = raw.get("sdr", {}).get("groups", [])
        if not isinstance(names, list) or not names:
            return

        ts = int(time.time() * 1000)
        for idx, name in enumerate(names):
            if not isinstance(name, str) or not name.strip():
                continue
            session.add(SdrFrequencyGroup(
                name=name.strip(),
                color="#c8ff00",
                sort_order=idx,
                created_at=ts,
            ))
        await session.commit()
        # Reflect the freshly seeded (empty) groups in the config snapshot.
        await sync_sdr_groups_to_config(session)


async def seed_default_settings() -> None:
    """Insert default URL settings on startup — only if a row does not already exist."""
    from backend.models import UserSettings  # avoid circular import

    # Rename air domain keys introduced in the onlineDataSourceURL/offgridDataSourceURL refactor.
    _RENAMES = [
        ("air", "onlineUrl",     "onlineDataSourceURL"),
        ("air", "offgridSource", "offgridDataSourceURL"),
    ]
    async with AsyncSessionLocal() as session:
        for namespace, old_key, new_key in _RENAMES:
            old_result = await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace,
                    UserSettings.key == old_key,
                )
            )
            old_row = old_result.scalar_one_or_none()
            if old_row is None:
                continue
            new_result = await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace,
                    UserSettings.key == new_key,
                )
            )
            if new_result.scalar_one_or_none() is None:
                old_row.key = new_key
            else:
                await session.delete(old_row)
        await session.commit()

    # Remove stale rows seeded by earlier versions.
    #   sea/land: no built-in default URLs; users must configure them.
    #   sdr.initialGroups: dead key, superseded by sdr.groups + sdr.frequencies.
    #   sdr.groups: drop any legacy grouped [{name,color}] value so the seeding
    #     pass below re-inserts the current names-only list from the config file.
    _OBSOLETE_KEYS = [
        ("space", "offgridSource"),
        ("sea",   "onlineUrl"),
        ("sea",   "offgridSource"),
        ("land",  "onlineUrl"),
        ("land",  "offgridSource"),
        ("sdr",   "initialGroups"),
        ("sdr",   "groups"),
    ]
    async with AsyncSessionLocal() as session:
        for namespace, key in _OBSOLETE_KEYS:
            result = await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace,
                    UserSettings.key == key,
                )
            )
            row = result.scalar_one_or_none()
            if row is not None:
                await session.delete(row)
        await session.commit()

    ts = int(time.time() * 1000)
    async with AsyncSessionLocal() as session:
        for namespace, key, value in _build_default_settings():
            result = await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == namespace,
                    UserSettings.key == key,
                )
            )
            if result.scalar_one_or_none() is None:
                session.add(UserSettings(
                    namespace=namespace,
                    key=key,
                    value=json.dumps(value),
                    updated_at=ts,
                ))
        await session.commit()


