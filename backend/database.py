import json
import time
from pathlib import Path

from sqlalchemy import select, text as sa_text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.config import settings

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
        for col_ddl in [
            "ALTER TABLE sdr_radios ADD COLUMN bandwidth INTEGER",
            "ALTER TABLE sdr_radios ADD COLUMN rf_gain REAL",
            "ALTER TABLE sdr_radios ADD COLUMN agc INTEGER DEFAULT 0",
        ]:
            try:
                await conn.execute(sa_text(col_ddl))
            except OperationalError:
                pass


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
        ("air",   "onlineUrl"): settings.adsb_upstream_base,
        ("space", "onlineUrl"): settings.celestrak_iss_url,
    }
    result = []
    for ns, key, value in rows:
        result.append((ns, key, overrides.get((ns, key), value)))
    return result


async def seed_default_settings() -> None:
    """Insert default URL settings on startup — only if a row does not already exist."""
    from backend.models import UserSettings  # avoid circular import

    # Remove stale placeholder URL rows that were seeded in earlier versions.
    # sea/land have no built-in default URLs; users must configure them.
    _OBSOLETE_KEYS = [
        ("air",   "offgridSource"),
        ("space", "offgridSource"),
        ("sea",   "onlineUrl"),
        ("sea",   "offgridSource"),
        ("land",  "onlineUrl"),
        ("land",  "offgridSource"),
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


async def migrate_sdr_radios_to_config() -> None:
    """One-time migration: copy rows from sdr_radios table into UserSettings sdr.radios.

    Only runs if the sdr.radios setting doesn't exist yet, ensuring idempotency.
    """
    from backend.models import UserSettings  # avoid circular import at module level

    async with AsyncSessionLocal() as session:
        # Skip if already migrated
        existing = (await session.execute(
            select(UserSettings).where(
                UserSettings.namespace == "sdr",
                UserSettings.key == "radios",
            )
        )).scalar_one_or_none()
        if existing is not None:
            return

        # Read rows directly via raw SQL so we don't need the ORM model
        try:
            rows = (await session.execute(
                sa_text("SELECT id, name, host, port, description, enabled, bandwidth, rf_gain, agc, created_at FROM sdr_radios ORDER BY created_at")
            )).fetchall()
        except Exception:
            rows = []

        radios = []
        for row in rows:
            radios.append({
                "id":          row[0],
                "name":        row[1],
                "host":        row[2],
                "port":        row[3],
                "description": row[4] or "",
                "enabled":     bool(row[5]),
                "bandwidth":   row[6],
                "rf_gain":     row[7],
                "agc":         bool(row[8]) if row[8] is not None else False,
                "created_at":  row[9],
            })

        session.add(UserSettings(
            namespace  = "sdr",
            key        = "radios",
            value      = json.dumps(radios),
            updated_at = int(time.time() * 1000),
        ))
        await session.commit()
