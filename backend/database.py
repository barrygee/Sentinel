import json
import time
from pathlib import Path

from backend.config import settings
from sqlalchemy import and_, event, or_, select
from sqlalchemy import text as sa_text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Path to the bundled default config — used to seed the DB on first startup.
_CONFIG_PATH = Path(__file__).parent / "default_config.json"

# Tables left behind by removed features, dropped by create_tables() on
# startup. Ordered child-first so the drop works even with foreign keys on.
_REMOVED_TABLES: tuple[str, ...] = (
    # Air flight replay (removed 2026-10-03): position snapshots, flight
    # sessions and the aircraft identity registry they hung off.
    "air_snapshots",
    "air_flights",
    "air_aircraft",
)

# Async SQLAlchemy engine backed by SQLite via aiosqlite
engine = create_async_engine(
    f"sqlite+aiosqlite:///{settings.db_path}",
    connect_args={"check_same_thread": False},  # required for SQLite async usage
)


# SQLite serialises writes on a single file lock. Concurrent endpoints (e.g.
# multiple ADS-B cache upserts plus the SDR/AIS/APRS writers) can
# collide and raise "database is locked" — surfaced as a 500. WAL lets readers
# proceed during writes, and busy_timeout makes new writers wait up to N ms for
# the lock instead of failing immediately.
@event.listens_for(engine.sync_engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover — driver-level hook
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.close()


# Session factory used by all request handlers via Depends(get_db)
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # keep objects usable after commit without a new query
)


class Base(DeclarativeBase):
    """Declarative base class — all ORM models inherit from this."""

    pass


async def _add_columns(conn, alter_statements) -> None:
    for alter_statement in alter_statements:
        try:
            await conn.execute(sa_text(alter_statement))
        except OperationalError:
            # Column already exists — raised by SQLite on duplicate ALTER TABLE
            pass


async def create_section_tables(table_names: tuple[str, ...], added_columns: tuple[str, ...] = ()) -> None:
    """Create only a section's own tables — the schema of its service's own database (P6).

    `added_columns` are the ALTERs for columns added to those tables after
    their first release, shared with create_tables().
    """
    async with engine.begin() as conn:
        from backend import models  # noqa: F401 — import triggers model registration with Base

        section_tables = [Base.metadata.tables[table_name] for table_name in table_names]
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, tables=section_tables))
        await _add_columns(conn, added_columns)


async def create_tables():
    """Create all database tables on startup if they do not already exist."""
    async with engine.begin() as conn:
        from backend import models  # noqa: F401 — import triggers model registration with Base

        await conn.run_sync(Base.metadata.create_all)
        for col_sql in [
            "ALTER TABLE sdr_radios ADD COLUMN bandwidth INTEGER",
            "ALTER TABLE sdr_radios ADD COLUMN rf_gain REAL",
            "ALTER TABLE sdr_radios ADD COLUMN agc INTEGER",
            # Subject aircraft of a notification (server-raised squawk alerts).
            "ALTER TABLE air_messages ADD COLUMN hex TEXT",
        ]:
            try:
                await conn.execute(sa_text(col_sql))
            except OperationalError:
                pass
        # Air flight replay (removed 2026-10-03) recorded ADS-B history into
        # these three tables. Nothing reads or writes them any more, so drop
        # them (and their indexes with them) from existing databases rather
        # than leave the recorded history on disk. Child tables first, in case
        # an older schema ever declared real foreign keys. Idempotent: a fresh
        # install never had them.
        for removed_table in _REMOVED_TABLES:
            await conn.execute(sa_text(f"DROP TABLE IF EXISTS {removed_table}"))


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
        ("air", "onlineDataSourceURL"): settings.adsb_upstream_base,
        ("space", "onlineUrl"): settings.celestrak_iss_url,
        ("land", "aprsChannelHz"): settings.aprs_channel_hz,
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
            result = await session.execute(
                sa_text(
                    "SELECT id, name, host, port, description, enabled, bandwidth, rf_gain, agc, created_at "
                    "FROM sdr_radios ORDER BY created_at"
                )
            )
            rows = result.mappings().fetchall()
        except Exception:
            return  # table doesn't exist yet — nothing to migrate

        if not rows:
            return  # empty table — let seed_default_settings handle it

        radios = []
        for row in rows:
            radios.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "host": row["host"],
                    "port": row["port"],
                    "description": row["description"] or "",
                    "enabled": bool(row["enabled"]),
                    "bandwidth": row["bandwidth"],
                    "rf_gain": row["rf_gain"],
                    "agc": bool(row["agc"]) if row["agc"] is not None else None,
                    "created_at": row["created_at"],
                }
            )

        session.add(
            UserSettings(
                namespace="sdr",
                key="radios",
                value=json.dumps(radios),
                updated_at=int(time.time() * 1000),
            )
        )
        await session.commit()


# Settings rows left behind by features that no longer exist. Each entry is a
# (namespace, key) pair that prune_removed_settings() deletes on startup.
# Removing a feature adds its keys here rather than leaving them to accumulate
# in every existing database — they would otherwise keep showing up in the
# Application Config editor and in exported config JSON, where a reader can't
# tell them apart from live settings.
_REMOVED_SETTING_KEYS: tuple[tuple[str, str], ...] = (
    # Trunk tracking (removed 2026-08-15, ADR-0004): the master feature flag
    # and the channel-map documents rendered to the CSVs dsd-fme loaded.
    ("sdr", "trunkTrackingEnabled"),
    ("sdr", "channel_maps"),
    # ADS-B label master switch and per-aircraft field list (removed
    # 2026-09-11): labels are permanently on and the field picker was never
    # rendered in Settings, so nothing edited or read these any more.
    ("air", "labelsVisible"),
    ("air", "labelFields"),
    # Land live camera feeds (removed 2026-09-26): the feed list and the
    # bookkeeping of which default feeds had been offered to this install.
    ("land", "feeds"),
    ("land", "defaultFeedsOffered"),
    # Connectivity auto mode (removed 2026-09-29): the URL it probed to detect
    # internet access. Connectivity is now an explicit online/offgrid choice.
    ("app", "connectivityProbeUrl"),
    # Air flight replay (removed 2026-10-03): the opt-in switch that turned on
    # ADS-B history recording. The recorded tables are dropped in create_tables.
    ("air", "replayEnabled"),
)

# Key-prefix families pruned the same way, for removed features that stored one
# row per entity rather than a fixed key.
_REMOVED_SETTING_PREFIXES: tuple[tuple[str, str], ...] = (
    # Land live camera feeds: one secret credential row per feed id. They are
    # dropped rather than left behind so no orphaned API key or login lingers.
    ("land", "feedCredential:"),
)


def is_removed_setting(namespace: str, key: str) -> bool:
    """True for a setting that belongs to a removed feature (see the lists above).

    Config imports skip these, so an old export or a stale live config file
    can't resurrect a row `prune_removed_settings()` just deleted.
    """
    if (namespace, key) in _REMOVED_SETTING_KEYS:
        return True
    return any(
        namespace == prefix_namespace and key.startswith(prefix)
        for prefix_namespace, prefix in _REMOVED_SETTING_PREFIXES
    )


async def prune_removed_settings() -> None:
    """Delete settings rows belonging to removed features.

    Idempotent and safe on every startup: a fresh install has no such rows and
    the delete is a no-op. Nothing reads these keys any more, so there is no
    value to migrate — they are dropped rather than rewritten.
    """
    from backend.models import UserSettings  # avoid circular import

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UserSettings).where(
                or_(
                    *(
                        and_(UserSettings.namespace == namespace, UserSettings.key == key)
                        for namespace, key in _REMOVED_SETTING_KEYS
                    ),
                    *(
                        and_(UserSettings.namespace == namespace, UserSettings.key.startswith(prefix, autoescape=True))
                        for namespace, prefix in _REMOVED_SETTING_PREFIXES
                    ),
                )
            )
        )
        stale = result.scalars().all()
        if not stale:
            return
        for row in stale:
            await session.delete(row)
        await session.commit()


async def resolve_retired_auto_modes() -> None:
    """Replace the retired connectivity 'auto' mode with an explicit one.

    'auto' once meant "probe the internet" for `app.connectivityMode` and
    "follow the app mode" for a section's `sourceOverride`. Both are now always
    'online' or 'offgrid': an app-level 'auto' becomes 'online', and a section
    'auto' becomes the app-level mode it was following. Idempotent.
    """
    from backend.models import UserSettings  # avoid circular import
    from backend.services.app_config import SOURCE_MODE_SECTIONS, SOURCE_MODES

    def _stored_value(row: UserSettings) -> object:
        try:
            return json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            return None

    async with AsyncSessionLocal() as session:
        timestamp = int(time.time() * 1000)
        changed = False

        mode_row = (
            await session.execute(
                select(UserSettings).where(UserSettings.namespace == "app", UserSettings.key == "connectivityMode")
            )
        ).scalar_one_or_none()
        app_mode = _stored_value(mode_row) if mode_row is not None else "online"
        if app_mode not in SOURCE_MODES:
            app_mode = "online"
            if mode_row is not None:
                mode_row.value = json.dumps(app_mode)
                mode_row.updated_at = timestamp
                changed = True

        section_rows = (
            (
                await session.execute(
                    select(UserSettings).where(
                        UserSettings.namespace.in_(SOURCE_MODE_SECTIONS), UserSettings.key == "sourceOverride"
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in section_rows:
            if _stored_value(row) not in SOURCE_MODES:
                row.value = json.dumps(app_mode)
                row.updated_at = timestamp
                changed = True

        if changed:
            await session.commit()


async def seed_default_settings() -> None:
    """Insert default URL settings on startup — only if a row does not already exist."""
    from backend.models import UserSettings  # avoid circular import

    # Rename air domain keys introduced in the onlineDataSourceURL/offgridDataSourceURL refactor.
    _RENAMES = [
        ("air", "onlineUrl", "onlineDataSourceURL"),
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

    # The map palette was once a boolean `app.lightMapTheme`; it is now
    # `app.mapTheme`. Carry an old choice across before the default
    # ("dark") is seeded below, which would otherwise flip a light-map install.
    async with AsyncSessionLocal() as session:
        legacy_row = (
            await session.execute(
                select(UserSettings).where(UserSettings.namespace == "app", UserSettings.key == "lightMapTheme")
            )
        ).scalar_one_or_none()
        if legacy_row is not None:
            current_row = (
                await session.execute(
                    select(UserSettings).where(UserSettings.namespace == "app", UserSettings.key == "mapTheme")
                )
            ).scalar_one_or_none()
            if current_row is None:
                try:
                    was_light = json.loads(legacy_row.value) is True
                except (json.JSONDecodeError, TypeError):
                    was_light = False
                legacy_row.key = "mapTheme"
                legacy_row.value = json.dumps("light" if was_light else "dark")
            else:
                await session.delete(legacy_row)
            await session.commit()

    # The map palette lost its third option: the old LIGHT map was removed and
    # COLOUR became LIGHT (restyled in OpenStreetMap's default colours). An
    # install still on "colour" moves to "light" — the same map, renamed —
    # rather than falling back to dark.
    async with AsyncSessionLocal() as session:
        colour_row = (
            await session.execute(
                select(UserSettings).where(
                    UserSettings.namespace == "app",
                    UserSettings.key == "mapTheme",
                    UserSettings.value == json.dumps("colour"),
                )
            )
        ).scalar_one_or_none()
        if colour_row is not None:
            colour_row.value = json.dumps("light")
            await session.commit()

    # Remove stale rows seeded by earlier versions.
    #   land: no built-in default URLs; users must configure them. (sea now
    #   ships a default — the AISStream endpoint — so its keys are seeded, not
    #   purged.)
    # sdr.groups is intentionally NOT purged here: it is the live {name, slug}
    # catalogue, owned by the sdr_frequency_groups table and rewritten by
    # sentinel_sdr.database.sync_sdr_groups_to_config. Deleting it each boot
    # would drop user renames until the next frequency/group mutation re-synced it.
    #   sdr/space.offlineSource: pre-offgridSource spelling, no longer read.
    #   sdr.initialGroups: old {name,color} list, superseded by the
    #     code-maintained sdr.groups {name,slug} catalogue.
    #   sdr.autoCenter: renamed to sdr.autoCenterWaterfallOnTune; drop the old
    #     row so it doesn't linger in the persisted config snapshot.
    _OBSOLETE_KEYS = [
        ("space", "offgridSource"),
        ("space", "offlineSource"),
        ("sdr", "offlineSource"),
        ("sdr", "initialGroups"),
        ("sdr", "autoCenter"),
        ("land", "onlineUrl"),
        ("land", "offgridSource"),
        # Land has no remote feed URL or connectivity override: its data is the
        # APRS sidecar and the bundled repeater directory.
        ("land", "sourceOverride"),
        ("land", "onlineDataSourceURL"),
        ("land", "offgridDataSourceURL"),
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
                session.add(
                    UserSettings(
                        namespace=namespace,
                        key=key,
                        value=json.dumps(value),
                        updated_at=ts,
                    )
                )
        await session.commit()
