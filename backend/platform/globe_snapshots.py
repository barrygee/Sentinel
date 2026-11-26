"""The contract between the globe and the sections that own its data (ADR 0009).

The globe service asks each owning section for a snapshot over NATS
request/reply and serves the browser one combined feed. Neither side may import
the other (import-linter), so the subjects and the compact row format both use
live here, in the platform layer they share.

Rows cross the bus columnar — one `fields` list and one array per item — not as
a list of objects: no `max_payload` is set on the broker, so the NATS default
of 1 MB per message applies, and repeating every key on thousands of vessels
would spend most of it on key names. `encode_rows` also trims the rows (they
arrive newest or most relevant first) to stay inside `REPLY_BYTE_BUDGET`.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterable, Mapping, Sequence
from contextlib import asynccontextmanager
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

AIR_SNAPSHOT_SUBJECT = "air.globe.snapshot"
"""Air: the aircraft around `{lat, lon}`, through the same cache, quota and limiter as the map."""

SEA_SNAPSHOT_SUBJECT = "sea.globe.snapshot"
"""Sea: the vessels inside `{bbox}` (or everywhere), at most `{maxRows}`, newest position first."""

LAND_SNAPSHOT_SUBJECT = "land.globe.snapshot"
"""Land: the APRS stations heard within retention, most recently heard first."""

SPACE_SNAPSHOT_SUBJECT = "space.globe.snapshot"
"""Space: position, ground track and footprint for each of `{noradIds}`, seen from `{lat, lon}`."""

AIR_RADIUS_NM = 250
"""The globe's aircraft come from this radius around home: the same as Air's alerts, so the cache row is shared."""

SEA_MAX_ROWS = 5_000
"""The most vessels one snapshot carries (Sea's own map allows 12k; the globe asks for the view only)."""

LAND_MAX_ROWS = 2_000
"""The most APRS stations one snapshot carries; real volume is far smaller."""

SPACE_MAX_SATELLITES = 12
"""The most satellites one snapshot propagates (each is about 1,500 SGP4 steps)."""

REPLY_BYTE_BUDGET = 900_000
"""Encoded rows stay under this many bytes, leaving room under NATS's 1 MB default for the rest of the reply."""


def encode_rows(
    records: Iterable[Mapping[str, Any]],
    fields: Sequence[str],
    byte_budget: int = REPLY_BYTE_BUDGET,
) -> dict[str, Any]:
    """Pack `records` as `{fields, rows, truncated}`, dropping trailing rows past `byte_budget`.

    A missing key becomes None. `truncated` is True when rows were dropped to
    fit; the caller passes records most-wanted first, so the cut loses the
    least useful ones.
    """
    rows: list[list[Any]] = []
    used_bytes = 0
    truncated = False
    for record in records:
        row = [record.get(field) for field in fields]
        # +1 for the comma between rows; separators match json.dumps' compact form.
        row_bytes = len(json.dumps(row, separators=(",", ":"), default=str)) + 1
        if used_bytes + row_bytes > byte_budget:
            truncated = True
            break
        rows.append(row)
        used_bytes += row_bytes
    return {"fields": list(fields), "rows": rows, "truncated": truncated}


def decode_rows(encoded: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Unpack `encode_rows`' output back into one dict per row.

    Raises `ValueError` when the shape is wrong (a responder from a different
    version, or a corrupted reply), so the caller can report the layer as
    unavailable instead of serving half a picture.
    """
    fields = encoded.get("fields")
    rows = encoded.get("rows")
    if not isinstance(fields, list) or not isinstance(rows, list):
        raise ValueError("compact rows need a fields list and a rows list")
    decoded: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, list) or len(row) != len(fields):
            raise ValueError("a compact row does not match its fields")
        decoded.append(dict(zip(fields, row, strict=True)))
    return decoded


@asynccontextmanager
async def responder_session(payload: Mapping[str, Any]) -> AsyncIterator[AsyncSession]:
    """The database session a snapshot responder reads with.

    Over NATS the transport puts a fresh session of the responder's own process
    under `db`. The globe sends none (it has no database), so an in-process
    request (the test app) opens one here, on the same engine.
    """
    session = payload.get("db")
    if isinstance(session, AsyncSession):
        yield session
        return
    # Imported here, not at the top: the globe imports this module for the
    # subjects and row format, and has no database to bind an engine to.
    from backend.database import AsyncSessionLocal

    async with AsyncSessionLocal() as own_session:
        yield own_session
