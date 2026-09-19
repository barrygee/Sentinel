"""
UK amateur-radio repeater directory — fetch, parse, cache.

The RSGB Emerging Technology Coordination Committee (ETCC) publishes the UK
repeater/gateway register at ukrepeater.net as a plain CSV export (one row per
licensed channel — a dual-band site appears twice). This service turns that
into the station-per-callsign list the Land map plots and caches it in SQLite:

  fresh cache  → served as-is                          (X-Cache: HIT)
  expired      → upstream re-fetched and stored        (X-Cache: MISS)
  upstream down→ last good copy, for up to a month     (X-Cache: STALE)
  never online → the snapshot bundled with the backend (X-Cache: BUNDLED)

The bundled snapshot (``backend/data/uk_repeaters.json``, the same normalised
shape this module serves) keeps the layer usable on an offline install, and
the whole directory can be viewed/replaced as JSON from Settings › LAND ›
REPEATERS — a replacement is held for ``repeaters_manual_ttl_ms`` before the
daily upstream refresh takes over again. Refresh the snapshot with::

    uv run --project backend python -m backend.scripts.refresh_repeaters
"""

from __future__ import annotations

import csv
import io
import json
import logging
import math
from pathlib import Path
from typing import Any

import httpx
from backend.cache import is_fresh, is_within_stale, now_ms
from backend.config import settings
from backend.models import RepeaterCache
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

CACHE_KEY = "uk"

# ukrepeater.net answers 403 to the default `python-httpx/…` agent (a generic
# bot filter); an identifying agent naming the project is let through.
USER_AGENT = "Sentinel/1.0 (+https://github.com/barrygee/Sentinel)"
BUNDLED_JSON_PATH = Path(__file__).resolve().parent.parent / "data" / "uk_repeaters.json"

# Column headings as the export names them (`csvcreate8.php`). The export has a
# trailing comma on every line, so the reader also yields one unnamed empty
# column — it is ignored.
_COLUMN_ID = "id"
_COLUMN_CALLSIGN = "callsign"
_COLUMN_BAND = "band"
_COLUMN_CHANNEL = "channel"
_COLUMN_TX_MHZ = "TX MHz"
_COLUMN_RX_MHZ = "RX MHz"
_COLUMN_HEIGHT_MAGL = "magl"
_COLUMN_ERP_DBW = "ERP[dBW]"
_COLUMN_MODES = "modes"
_COLUMN_LOCATOR = "QTHR"
_COLUMN_WHERE = "where"
_COLUMN_POSTCODE = "postcode"
_COLUMN_REGION = "ETCC region"
_COLUMN_CTCSS = "ctcss"
_COLUMN_DMR_CC = "dmrcc"
_COLUMN_KEEPER = "keeper"
_COLUMN_LAT = "lat"
_COLUMN_LON = "lon"
_COLUMN_STATUS = "status"

_REQUIRED_COLUMNS = frozenset(
    {
        _COLUMN_CALLSIGN,
        _COLUMN_BAND,
        _COLUMN_TX_MHZ,
        _COLUMN_RX_MHZ,
        _COLUMN_MODES,
        _COLUMN_LAT,
        _COLUMN_LON,
    }
)

# Mode letters the ETCC register uses; anything else in the modes field is
# dropped so a typo upstream can never reach the client as a mode.
KNOWN_MODE_CODES = frozenset("ADMFPNTEX7S")

# Status values the export uses; a blank (a handful of rows) becomes UNKNOWN.
_KNOWN_STATUSES = frozenset({"OPERATIONAL", "NOT OPERATIONAL", "REDUCED OUTPUT"})

# Generous bounding box for the UK, Channel Islands and Isle of Man. A row
# outside it is a data-entry error upstream (a swapped sign, a missing digit)
# and is dropped rather than plotted in the North Sea or on the Equator.
_UK_LAT_RANGE = (49.0, 61.5)
_UK_LON_RANGE = (-11.0, 3.0)


class RepeaterDataUnavailable(RuntimeError):
    """No usable repeater list — upstream failed and no cache or bundled copy exists."""


def _float_or_none(value: str | None) -> float | None:
    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    # The export has been seen to carry "-inf" (an unset ERP); Python's float()
    # accepts it but JSON cannot, so treat any non-finite value as absent.
    return number if math.isfinite(number) else None


def _int_or_none(value: str | None) -> int | None:
    number = _float_or_none(value)
    return int(number) if number is not None else None


def _text_or_none(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


def _parse_modes(value: str | None) -> list[str]:
    """Split the modes field ("ADMF") into its known single-letter codes, deduplicated in order."""
    codes: list[str] = []
    for code in (value or "").strip().upper():
        if code in KNOWN_MODE_CODES and code not in codes:
            codes.append(code)
    return codes


def _parse_channel_row(row: dict[str, str]) -> dict[str, Any] | None:
    """One CSV row → one channel record, or None if it has no plottable position/frequency."""
    callsign = (row.get(_COLUMN_CALLSIGN) or "").strip().upper()
    band = (row.get(_COLUMN_BAND) or "").strip().upper()
    tx_mhz = _float_or_none(row.get(_COLUMN_TX_MHZ))
    rx_mhz = _float_or_none(row.get(_COLUMN_RX_MHZ))
    latitude = _float_or_none(row.get(_COLUMN_LAT))
    longitude = _float_or_none(row.get(_COLUMN_LON))
    if not callsign or not band or tx_mhz is None or rx_mhz is None:
        return None
    if latitude is None or longitude is None:
        return None
    if not (_UK_LAT_RANGE[0] <= latitude <= _UK_LAT_RANGE[1]):
        return None
    if not (_UK_LON_RANGE[0] <= longitude <= _UK_LON_RANGE[1]):
        return None
    status = (row.get(_COLUMN_STATUS) or "").strip().upper()
    return {
        "id": _int_or_none(row.get(_COLUMN_ID)),
        "callsign": callsign,
        "band": band,
        "channel": _text_or_none(row.get(_COLUMN_CHANNEL)),
        "txMhz": tx_mhz,
        "rxMhz": rx_mhz,
        "modes": _parse_modes(row.get(_COLUMN_MODES)),
        "ctcssHz": _float_or_none(row.get(_COLUMN_CTCSS)),
        "dmrColourCode": _int_or_none(row.get(_COLUMN_DMR_CC)),
        "heightMagl": _int_or_none(row.get(_COLUMN_HEIGHT_MAGL)),
        "erpDbw": _float_or_none(row.get(_COLUMN_ERP_DBW)),
        "status": status if status in _KNOWN_STATUSES else "UNKNOWN",
        "latitude": latitude,
        "longitude": longitude,
        "locator": _text_or_none(row.get(_COLUMN_LOCATOR)),
        "location": _text_or_none(row.get(_COLUMN_WHERE)),
        "postcode": _text_or_none(row.get(_COLUMN_POSTCODE)),
        "region": _text_or_none(row.get(_COLUMN_REGION)),
        "keeper": _text_or_none(row.get(_COLUMN_KEEPER)),
    }


def parse_repeater_csv(text: str) -> list[dict[str, Any]]:
    """Parse the ETCC CSV export into stations grouped by callsign.

    Each station carries the site fields (position, locator, location, keeper,
    region) from its first row and a ``channels`` list with one entry per
    band/channel the site is licensed for. Rows without a usable position or
    frequency are skipped. Raises ``ValueError`` if the text is not the export
    (missing headings) so a captive-portal HTML page is never cached as data.
    """
    reader = csv.DictReader(io.StringIO(text))
    headings = {(name or "").strip() for name in (reader.fieldnames or [])}
    missing = _REQUIRED_COLUMNS - headings
    if missing:
        raise ValueError(f"repeater CSV is missing columns: {sorted(missing)}")

    stations: dict[str, dict[str, Any]] = {}
    for raw_row in reader:
        # DictReader keys keep the export's exact spelling; strip once here so
        # the column constants above can be plain names.
        row = {(key or "").strip(): value for key, value in raw_row.items() if key is not None}
        channel = _parse_channel_row(row)
        if channel is None:
            continue
        station = stations.get(channel["callsign"])
        if station is None:
            station = {
                "callsign": channel["callsign"],
                "latitude": channel["latitude"],
                "longitude": channel["longitude"],
                "locator": channel["locator"],
                "location": channel["location"],
                "postcode": channel["postcode"],
                "region": channel["region"],
                "keeper": channel["keeper"],
                "channels": [],
            }
            stations[channel["callsign"]] = station
        station["channels"].append(
            {
                key: channel[key]
                for key in (
                    "id",
                    "band",
                    "channel",
                    "txMhz",
                    "rxMhz",
                    "modes",
                    "ctcssHz",
                    "dmrColourCode",
                    "heightMagl",
                    "erpDbw",
                    "status",
                )
            }
        )
    return sorted(stations.values(), key=lambda station: station["callsign"])


async def _fetch_upstream() -> list[dict[str, Any]]:
    async with httpx.AsyncClient(
        timeout=settings.repeaters_fetch_timeout_s,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    ) as client:
        response = await client.get(settings.repeaters_upstream_url)
        response.raise_for_status()
    stations = parse_repeater_csv(response.text)
    if not stations:
        raise ValueError("repeater CSV parsed to an empty list")
    return stations


def _load_bundled() -> list[dict[str, Any]]:
    return validate_station_list(json.loads(BUNDLED_JSON_PATH.read_text(encoding="utf-8")).get("stations"))


class RepeaterDataInvalid(ValueError):
    """An uploaded/bundled station list is not the shape this module serves."""


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RepeaterDataInvalid(message)


def _optional_text(value: Any, field: str) -> str | None:
    _require(value is None or isinstance(value, str), f"{field} must be a string or null")
    return value or None


def _optional_number(value: Any, field: str) -> float | None:
    _require(
        value is None or (isinstance(value, int | float) and math.isfinite(value)), f"{field} must be a number or null"
    )
    return None if value is None else float(value)


def _validate_channel(raw: Any, callsign: str) -> dict[str, Any]:
    _require(isinstance(raw, dict), f"{callsign}: each channel must be an object")
    band = raw.get("band")
    _require(isinstance(band, str) and band.strip(), f"{callsign}: channel band is required")
    for field in ("txMhz", "rxMhz"):
        _require(
            isinstance(raw.get(field), int | float) and math.isfinite(raw[field]),
            f"{callsign}: {field} must be a number",
        )
    modes_raw = raw.get("modes", [])
    _require(isinstance(modes_raw, list), f"{callsign}: modes must be a list")
    modes = _parse_modes("".join(code for code in modes_raw if isinstance(code, str)))
    status = str(raw.get("status") or "").strip().upper()
    identifier = raw.get("id")
    _require(identifier is None or isinstance(identifier, int), f"{callsign}: channel id must be an integer or null")
    height = _optional_number(raw.get("heightMagl"), f"{callsign}: heightMagl")
    colour_code = _optional_number(raw.get("dmrColourCode"), f"{callsign}: dmrColourCode")
    return {
        "id": identifier,
        "band": band.strip().upper(),
        "channel": _optional_text(raw.get("channel"), f"{callsign}: channel"),
        "txMhz": float(raw["txMhz"]),
        "rxMhz": float(raw["rxMhz"]),
        "modes": modes,
        "ctcssHz": _optional_number(raw.get("ctcssHz"), f"{callsign}: ctcssHz"),
        "dmrColourCode": None if colour_code is None else int(colour_code),
        "heightMagl": None if height is None else int(height),
        "erpDbw": _optional_number(raw.get("erpDbw"), f"{callsign}: erpDbw"),
        "status": status if status in _KNOWN_STATUSES else "UNKNOWN",
    }


def validate_station_list(raw: Any) -> list[dict[str, Any]]:
    """Check a station list (bundled file or Settings upload) and return it normalised.

    Every station needs a callsign, a position inside the UK box and at least one
    channel with a band and both frequencies; unknown keys are dropped and
    optional fields default to null. Raises :class:`RepeaterDataInvalid` on the
    first problem, naming the station, so a bad upload is refused whole rather
    than half-applied.
    """
    _require(isinstance(raw, list), "stations must be a list")
    stations: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in raw:
        _require(isinstance(entry, dict), "each station must be an object")
        callsign = str(entry.get("callsign") or "").strip().upper()
        _require(bool(callsign), "station callsign is required")
        _require(callsign not in seen, f"{callsign}: listed twice")
        seen.add(callsign)
        latitude = entry.get("latitude")
        longitude = entry.get("longitude")
        _require(
            isinstance(latitude, int | float) and _UK_LAT_RANGE[0] <= latitude <= _UK_LAT_RANGE[1],
            f"{callsign}: latitude out of range",
        )
        _require(
            isinstance(longitude, int | float) and _UK_LON_RANGE[0] <= longitude <= _UK_LON_RANGE[1],
            f"{callsign}: longitude out of range",
        )
        channels_raw = entry.get("channels")
        _require(
            isinstance(channels_raw, list) and len(channels_raw) > 0, f"{callsign}: at least one channel is required"
        )
        stations.append(
            {
                "callsign": callsign,
                "latitude": float(latitude),
                "longitude": float(longitude),
                "locator": _optional_text(entry.get("locator"), f"{callsign}: locator"),
                "location": _optional_text(entry.get("location"), f"{callsign}: location"),
                "postcode": _optional_text(entry.get("postcode"), f"{callsign}: postcode"),
                "region": _optional_text(entry.get("region"), f"{callsign}: region"),
                "keeper": _optional_text(entry.get("keeper"), f"{callsign}: keeper"),
                "channels": [_validate_channel(channel, callsign) for channel in channels_raw],
            }
        )
    return sorted(stations, key=lambda station: station["callsign"])


async def replace_repeaters(db: AsyncSession, raw_stations: Any) -> int:
    """Replace the served directory with an uploaded station list (Settings › LAND).

    Validated whole before anything is written, then stored in the cache with
    the manual TTL so the daily refresh leaves it alone for a month. Returns the
    number of stations stored. Raises :class:`RepeaterDataInvalid`.
    """
    stations = validate_station_list(raw_stations)
    fetched_at = now_ms()
    payload_text = json.dumps(stations, separators=(",", ":"))
    result = await db.execute(select(RepeaterCache).where(RepeaterCache.cache_key == CACHE_KEY))
    row = result.scalar_one_or_none()
    if row:
        row.payload = payload_text
        row.fetched_at = fetched_at
        row.expires_at = fetched_at + settings.repeaters_manual_ttl_ms
    else:
        db.add(
            RepeaterCache(
                cache_key=CACHE_KEY,
                payload=payload_text,
                fetched_at=fetched_at,
                expires_at=fetched_at + settings.repeaters_manual_ttl_ms,
            )
        )
    await db.commit()
    return len(stations)


async def get_repeaters(db: AsyncSession) -> tuple[dict[str, Any], str]:
    """Return ``(payload, cache_state)`` for the UK repeater list.

    ``payload`` is ``{"source", "fetchedAt", "stations"}``; ``cache_state`` is
    the ``X-Cache`` value (HIT | MISS | STALE | BUNDLED). See the module
    docstring for the fallback ladder. Raises :class:`RepeaterDataUnavailable`
    only if every rung fails, including the bundled snapshot.
    """
    result = await db.execute(select(RepeaterCache).where(RepeaterCache.cache_key == CACHE_KEY))
    row = result.scalar_one_or_none()

    if row and is_fresh(row.expires_at):
        return _payload("online", row.fetched_at, json.loads(row.payload)), "HIT"

    try:
        stations = await _fetch_upstream()
    except Exception as exc:  # network, HTTP status, or a page that is not the CSV
        logger.warning("UK repeater list refresh failed: %s", exc)
    else:
        fetched_at = now_ms()
        payload_text = json.dumps(stations, separators=(",", ":"))
        if row:
            row.payload = payload_text
            row.fetched_at = fetched_at
            row.expires_at = fetched_at + settings.repeaters_ttl_ms
        else:
            db.add(
                RepeaterCache(
                    cache_key=CACHE_KEY,
                    payload=payload_text,
                    fetched_at=fetched_at,
                    expires_at=fetched_at + settings.repeaters_ttl_ms,
                )
            )
        await db.commit()
        return _payload("online", fetched_at, stations), "MISS"

    if row and is_within_stale(row.fetched_at, settings.repeaters_stale_ms):
        return _payload("cached", row.fetched_at, json.loads(row.payload)), "STALE"

    try:
        return _payload("bundled", None, _load_bundled()), "BUNDLED"
    except (OSError, ValueError) as exc:
        raise RepeaterDataUnavailable(
            "UK repeater list unavailable: upstream failed and no cached or bundled copy"
        ) from exc


def _payload(source: str, fetched_at: int | None, stations: list[dict[str, Any]]) -> dict[str, Any]:
    return {"source": source, "fetchedAt": fetched_at, "stations": stations}
