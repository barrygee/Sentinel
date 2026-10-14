"""The SDR section's schema and startup data work.

`create_sdr_tables()` builds the SDR section's own tables (its service
database, or the shared one when core hosts the section in-process), ALTERs in
the columns added since their first release and backfills them. The seeders
fill the frequency tables from `backend/data/sdr_frequencies.json` and the band
plan setting from `sdr_bandplan.json` on first run; the `sync_*` helpers mirror
the tables into core's settings (`sdr.frequencies`, `sdr.groups`,
`sdr.searchRanges`) so the live config file shows them.
"""

from pathlib import Path

from backend import database as core_database
from backend.config import settings
from backend.database import create_section_tables
from backend.utils import slugify
from sqlalchemy import select
from sqlalchemy import text as sa_text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_sdr.models import SdrFrequencyGroup, SdrFrequencyGroupLink, SdrSearchRange, SdrStoredFrequency

# Parents before children: a legacy import copies them in this order.
SDR_TABLES: tuple[str, ...] = (
    "sdr_frequency_groups",
    "sdr_stored_frequencies",
    "sdr_frequency_group_links",
    "sdr_search_ranges",
    "sdr_recordings",
)

# Columns added after the tables' first release. SQLite's create_all never adds
# a column to an existing table, so each is ALTERed in (a duplicate is an
# OperationalError, ignored).
SDR_ADDED_COLUMNS: tuple[str, ...] = (
    "ALTER TABLE sdr_frequency_groups ADD COLUMN slug TEXT NOT NULL DEFAULT ''",
    # Per-frequency tuning settings (applied on click / scan-stop).
    "ALTER TABLE sdr_stored_frequencies ADD COLUMN bandwidth INTEGER",
    "ALTER TABLE sdr_stored_frequencies ADD COLUMN sample_rate INTEGER",
    "ALTER TABLE sdr_stored_frequencies ADD COLUMN volume INTEGER NOT NULL DEFAULT 80",
    "ALTER TABLE sdr_stored_frequencies ADD COLUMN zoom REAL NOT NULL DEFAULT 1.0",
    "ALTER TABLE sdr_stored_frequencies ADD COLUMN zmin REAL NOT NULL DEFAULT 0.0",
    "ALTER TABLE sdr_stored_frequencies ADD COLUMN zmax REAL NOT NULL DEFAULT 0.0",
    "ALTER TABLE sdr_stored_frequencies ADD COLUMN favourite INTEGER NOT NULL DEFAULT 0",
)


async def create_sdr_tables() -> None:
    """Create the SDR section's tables, ALTER in and backfill the columns added since, and make the recordings folder.

    The band plan and the settings mirrors of the tables (`sdr.groups`,
    `sdr.frequencies`, `sdr.searchRanges`) are core's settings, not tables
    here. The recordings folder lives next to the database.
    """
    await create_section_tables(SDR_TABLES, SDR_ADDED_COLUMNS)
    # Looked up at call time, so a test's patch of core's engine applies.
    async with core_database.engine.begin() as conn:
        await _backfill_added_columns(conn)
    sdr_recordings_dir().mkdir(parents=True, exist_ok=True)


async def _backfill_added_columns(conn) -> None:
    # Backfill the newly-added per-frequency settings for rows created before
    # the columns existed, so existing saved frequencies carry sensible values
    # (bandwidth keyed off the demodulation mode, matching defaultBwHz() in the
    # SPA). Idempotent: only touches rows still NULL after the ALTER above.
    try:
        await conn.execute(
            sa_text(
                "UPDATE sdr_stored_frequencies SET bandwidth = CASE mode "
                "WHEN 'WFM' THEN 500000 WHEN 'NFM' THEN 12500 WHEN 'AM' THEN 10000 "
                "WHEN 'USB' THEN 3000 WHEN 'LSB' THEN 3000 WHEN 'CW' THEN 500 "
                "ELSE 10000 END WHERE bandwidth IS NULL"
            )
        )
        await conn.execute(sa_text("UPDATE sdr_stored_frequencies SET sample_rate = 2048000 WHERE sample_rate IS NULL"))
    except OperationalError:
        pass
    # Backfill slugs for groups created before the column existed (or seeded
    # empty). Slug is rename-stable, so only populate where still blank.
    try:
        rows = (
            await conn.execute(sa_text("SELECT id, name FROM sdr_frequency_groups WHERE slug = '' OR slug IS NULL"))
        ).all()
        for group_id, name in rows:
            await conn.execute(
                sa_text("UPDATE sdr_frequency_groups SET slug = :slug WHERE id = :group_id"),
                {"slug": slugify(name or "") or f"group-{group_id}", "group_id": group_id},
            )
    except OperationalError:
        pass
    # Carry the legacy single group_id into the many-to-many links table.
    try:
        await conn.execute(
            sa_text(
                "INSERT OR IGNORE INTO sdr_frequency_group_links (frequency_id, group_id) "
                "SELECT id, group_id FROM sdr_stored_frequencies WHERE group_id IS NOT NULL"
            )
        )
    except OperationalError:
        pass


def sdr_recordings_dir() -> Path:
    """The folder the SDR section keeps recordings in (`<id>.wav`, and the IQ `<id>.u8`): next to the database."""
    return Path(settings.db_path).parent / "recordings"


async def sync_sdr_groups_to_config(session: AsyncSession) -> None:
    """Mirror the live SDR stored frequencies into UserSettings
    (namespace='sdr', key='frequencies') so the persisted app config JSON
    always reflects current state.

    The config representation is a flat list of frequencies, each carrying its
    own `groups` array of group slugs (the rename-stable key). The companion
    `sdr.groups` key holds the group catalogue as {name, slug} objects so the
    config is self-contained and slugs resolve to readable names. Frequencies
    are never duplicated, even when a frequency belongs to multiple groups.
    Group colours are intentionally omitted — the `color` column still exists
    on the table for UI use.

    The mirror is a core setting, so it is written through the settings client:
    over HTTP when the SDR section runs in its own container (P6.6)."""
    groups = (
        (await session.execute(select(SdrFrequencyGroup).order_by(SdrFrequencyGroup.sort_order, SdrFrequencyGroup.id)))
        .scalars()
        .all()
    )
    slug_by_id = {g.id: g.slug for g in groups}

    links = (await session.execute(select(SdrFrequencyGroupLink))).scalars().all()
    group_ids_by_freq: dict[int, list[int]] = {}
    for link in links:
        group_ids_by_freq.setdefault(link.frequency_id, []).append(link.group_id)

    freqs = (
        (await session.execute(select(SdrStoredFrequency).order_by(SdrStoredFrequency.frequency_hz))).scalars().all()
    )

    payload = []
    for f in freqs:
        # Union the many-to-many links with the legacy single group_id so no
        # membership is lost; preserve group sort order, drop unknown ids.
        gids = list(group_ids_by_freq.get(f.id, []))
        if f.group_id is not None and f.group_id not in gids:
            gids.append(f.group_id)
        slugs = [slug_by_id[gid] for gid in slug_by_id if gid in gids]
        payload.append(
            {
                "label": f.label,
                "frequency_hz": f.frequency_hz,
                "mode": f.mode,
                "squelch": f.squelch,
                "gain": f.gain,
                "bandwidth": f.bandwidth,
                "sample_rate": f.sample_rate,
                "volume": f.volume,
                "zoom": f.zoom,
                "zmin": f.zmin,
                "zmax": f.zmax,
                "scannable": f.scannable,
                "favourite": f.favourite,
                "notes": f.notes,
                "groups": slugs,
            }
        )

    from backend.platform.settings_client import write_setting  # looked up at call time, so tests can patch it

    await write_setting(session, "sdr", "frequencies", payload)
    # Mirror the group catalogue as {name, slug} so the config is self-contained
    # and frequency slug refs resolve to readable names on re-import.
    await write_setting(session, "sdr", "groups", [{"name": g.name, "slug": g.slug} for g in groups])


async def sync_sdr_search_ranges_to_config(session: AsyncSession) -> None:
    """Mirror the SdrSearchRange table into UserSettings
    (namespace='sdr', key='searchRanges') so the persisted app config JSON
    always reflects current state. Written through the settings client, like
    `sync_sdr_groups_to_config`."""
    from backend.platform.settings_client import write_setting  # looked up at call time, so tests can patch it

    rows = (
        (await session.execute(select(SdrSearchRange).order_by(SdrSearchRange.sort_order, SdrSearchRange.id)))
        .scalars()
        .all()
    )
    payload = [
        {
            "label": r.label,
            "low_hz": r.low_hz,
            "high_hz": r.high_hz,
            "step_hz": r.step_hz,
            "mode": r.mode,
            "threshold_dbfs": r.threshold_dbfs,
            "dwell_ms": r.dwell_ms,
            "band_name": r.band_name,
            "enabled": r.enabled,
            "notes": r.notes,
        }
        for r in rows
    ]
    await write_setting(session, "sdr", "searchRanges", payload)


async def seed_sdr_data_from_files() -> None:
    """Seed the SDR groups/frequencies/search-ranges tables from
    backend/data/sdr_frequencies.json on first run (empty tables), then mirror
    the live tables back into the file so it stays the source of truth.

    The file is authoritative on a fresh install. After seeding, the runtime
    CRUD endpoints and the bulk textarea editor keep the file and tables in
    sync, so this only *seeds* — it does not clobber user edits on later boots.
    """
    from sentinel_sdr.services.sdr_data import (
        load_sdr_frequencies_file,
        reconcile_search_ranges,
        write_sdr_frequencies_file,
    )
    from sentinel_sdr.services.sdr_frequencies import reconcile_sdr_frequencies

    data = load_sdr_frequencies_file()

    # Looked up at call time, so a test's patch of core's session factory applies.
    async with core_database.AsyncSessionLocal() as session:
        groups_empty = (await session.execute(select(SdrFrequencyGroup).limit(1))).scalar_one_or_none() is None
        ranges_empty = (await session.execute(select(SdrSearchRange).limit(1))).scalar_one_or_none() is None

        if groups_empty and (data["groups"] or data["frequencies"]):
            # Rebuild groups + frequencies from the file (catalogue authoritative).
            await reconcile_sdr_frequencies(session, data["frequencies"], data["groups"])
            await session.commit()

        if ranges_empty and data["searchRanges"]:
            await reconcile_search_ranges(session, data["searchRanges"])
            await session.commit()

        # Mirror live tables into the UserSettings snapshot, then rewrite the
        # file from that snapshot so file and DB always agree.
        await sync_sdr_groups_to_config(session)
        await sync_sdr_search_ranges_to_config(session)
        await write_sdr_frequencies_file(session)


async def seed_sdr_bandplan_from_file() -> None:
    """Seed UserSettings(sdr.bandPlan) from backend/data/sdr_bandplan.json on
    first run (key unset). The waterfall reads sdr.bandPlan; the file is the
    source of truth and is written back on edit via sdr_data.set_bandplan.
    The setting is core's, so it is read and written through the settings client."""
    from backend.platform.settings_client import read_setting, write_setting  # looked up at call time

    from sentinel_sdr.services.sdr_data import load_sdr_bandplan_file

    # Looked up at call time, so a test's patch of core's session factory applies.
    async with core_database.AsyncSessionLocal() as session:
        if await read_setting(session, "sdr", "bandPlan") is not None:
            return
        await write_setting(session, "sdr", "bandPlan", load_sdr_bandplan_file())
