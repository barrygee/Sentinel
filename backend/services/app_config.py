"""The application config document — every user setting as one JSON object.

`user_settings` rows (namespace/key/JSON-value) are the runtime store. This
module turns them into the `{namespace: {key: value}}` document the Settings ›
Application Config editor shows, the export downloads, and the live
`sentinel_config.json` file mirrors — and applies such a document back to the
store. The settings router and the live-file sync (`app_config_file.py`) share
it so the editor, an upload, and a hand-edit of the file behave identically.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Any

from backend.cache import now_ms
from backend.db_helpers import get_setting
from backend.models import UserSettings
from backend.platform.bus import bus
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Settings that are secrets. They are stored in user_settings like any other
# value but never leave the backend through the config document (redacted on
# read, refused on write, skipped on import) — each has its own endpoint that
# reports only whether it is configured. See routers/sea.py for the AIS key.
SECRET_SETTING_KEYS: frozenset[tuple[str, str]] = frozenset({("sea", "aisstreamApiKey")})

# Curated reference data that lives in dedicated files with their own Settings
# editors (backend/data/sdr_frequencies.json → Settings › SDR, sdr_bandplan.json
# → Settings › SDR, satellite_radio.json → Settings › Space). The runtime
# UserSettings mirrors still exist (the SDR panel/waterfall and satellite
# display read them) but they are not part of the application config, so they
# are neither shown nor round-tripped here.
EXCLUDED_DATA_KEYS: dict[str, frozenset[str]] = {
    "sdr": frozenset({"groups", "frequencies", "searchRanges", "bandPlan"}),
    "space": frozenset({"satelliteRadio"}),
}

# Internal state that lives in user_settings for convenience but is not a
# setting: nothing in the Settings UI edits it, and copying it between installs
# is actively harmful (two Sentinels sharing an instanceId look like the same
# client to Sentry's device reservations).
INTERNAL_KEYS: dict[str, frozenset[str]] = {
    "app": frozenset({"instanceId"}),
}


# Sections that store their own data-source mode in `{section}.sourceOverride`.
SOURCE_MODE_SECTIONS: tuple[str, ...] = ("air", "space", "sea")
SOURCE_MODES: frozenset[str] = frozenset({"online", "offgrid"})


class InvalidConfigError(ValueError):
    """A config document (or one value in it) that must not be persisted."""


def is_secret_setting(namespace: str, key: str) -> bool:
    """True for a setting that never round-trips through the config document."""
    return (namespace, key) in SECRET_SETTING_KEYS


def is_hidden_key(namespace: str, key: str) -> bool:
    """True for data/internal keys that are kept out of the config document."""
    return key in EXCLUDED_DATA_KEYS.get(namespace, frozenset()) or key in INTERNAL_KEYS.get(namespace, frozenset())


def validated_location(value: Any) -> dict:
    """Normalise/validate an `app.location` value.

    Returns {"latitude": "", "longitude": ""} for an empty/unset location
    (signals "use browser geolocation"), or {"latitude": float, "longitude":
    float} for a valid pair.

    Raises:
        InvalidConfigError: for a partial or out-of-range pair, so a bad
            coordinate can't poison the persisted config.
    """
    if not isinstance(value, dict):
        raise InvalidConfigError("location must be an object")

    latitude_raw = value.get("latitude")
    longitude_raw = value.get("longitude")

    def _is_empty(candidate: Any) -> bool:
        return candidate is None or (isinstance(candidate, str) and candidate.strip() == "")

    latitude_empty, longitude_empty = _is_empty(latitude_raw), _is_empty(longitude_raw)
    if latitude_empty and longitude_empty:
        return {"latitude": "", "longitude": ""}
    if latitude_empty != longitude_empty:
        raise InvalidConfigError("location requires both latitude and longitude, or neither")

    try:
        latitude = float(latitude_raw)
        longitude = float(longitude_raw)
    except (TypeError, ValueError) as exc:
        raise InvalidConfigError("latitude/longitude must be numbers") from exc

    if not (-90 <= latitude <= 90):
        raise InvalidConfigError("latitude out of range [-90, 90]")
    if not (-180 <= longitude <= 180):
        raise InvalidConfigError("longitude out of range [-180, 180]")

    return {"latitude": latitude, "longitude": longitude}


@lru_cache(maxsize=1)
def canonical_key_order() -> dict[str, list[str]]:
    """Per-namespace canonical key order, read from default_config.json.

    UserSettings rows have no inherent order — a key seeded later (e.g. a new
    setting added in a release) lands wherever its row was inserted, so the
    served / exported config drifts from the template's readable layout. Each
    namespace dict is re-ordered to match default_config.json; keys not in the
    template keep their original relative order, appended after the known ones.
    """
    from backend.database import _CONFIG_PATH  # avoid import cycle at module load

    try:
        raw = json.loads(_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return {namespace: list(entries.keys()) for namespace, entries in raw.items() if isinstance(entries, dict)}


def rows_to_namespace_dict(rows, namespace: str | None = None) -> dict:
    """Convert UserSettings rows to { key: parsed_value }, ordered to match
    default_config.json for that namespace (unknown keys kept last in their
    original order). Secrets are always dropped."""
    parsed: dict = {}
    for row in rows:
        if is_secret_setting(row.namespace, row.key):
            continue
        try:
            parsed[row.key] = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            parsed[row.key] = row.value

    order = canonical_key_order().get(namespace or "", [])
    if not order:
        return parsed
    rank = {key: index for index, key in enumerate(order)}
    # Stable sort: known keys by template position, unknown keys after, each
    # group preserving the row order they came in with.
    return dict(sorted(parsed.items(), key=lambda item: rank.get(item[0], len(order))))


def strip_hidden_keys(config: dict) -> dict:
    """Drop the data keys and internal-only keys from a config dict (in place)."""
    for namespace, block in list(config.items()):
        if isinstance(block, dict):
            config[namespace] = {key: value for key, value in block.items() if not is_hidden_key(namespace, key)}
    return config


async def build_config_snapshot(db: AsyncSession) -> dict[str, dict[str, Any]]:
    """Return every user setting as the application config document.

    Namespaces follow default_config.json's order (unknown ones after), keys
    are canonically ordered, and secrets / data / internal keys are left out.
    """
    rows = (await db.execute(select(UserSettings))).scalars().all()

    grouped: dict[str, list] = {}
    for row in rows:
        grouped.setdefault(row.namespace, []).append(row)

    namespace_rank = {namespace: index for index, namespace in enumerate(canonical_key_order())}
    ordered_namespaces = sorted(grouped, key=lambda namespace: namespace_rank.get(namespace, len(namespace_rank)))
    config = {namespace: rows_to_namespace_dict(grouped[namespace], namespace) for namespace in ordered_namespaces}
    return strip_hidden_keys(config)


def _assign_missing_radio_ids(config: dict) -> None:
    """Give every `sdr.radios` entry without an integer id the next free one."""
    sdr_block = config.get("sdr")
    radios = sdr_block.get("radios") if isinstance(sdr_block, dict) else None
    if not isinstance(radios, list):
        return
    next_id = max((radio.get("id", 0) for radio in radios if isinstance(radio, dict)), default=0) + 1
    for radio in radios:
        if isinstance(radio, dict) and not isinstance(radio.get("id"), int):
            radio["id"] = next_id
            next_id += 1


async def _resolve_retired_auto_modes(db: AsyncSession, config: dict) -> None:
    """Replace the retired 'auto' mode (from an older export or hand-edit) with
    an explicit one, so the store only ever holds 'online' or 'offgrid': an
    app-level 'auto' becomes 'online', a section's becomes the app-level mode."""
    app_block = config.get("app")
    if isinstance(app_block, dict) and "connectivityMode" in app_block:
        if app_block["connectivityMode"] not in SOURCE_MODES:
            app_block["connectivityMode"] = "online"
        app_mode = app_block["connectivityMode"]
    else:
        app_mode = await get_setting(db, "app", "connectivityMode", default="online")
        if app_mode not in SOURCE_MODES:
            app_mode = "online"
    for section in SOURCE_MODE_SECTIONS:
        block = config.get(section)
        if isinstance(block, dict) and "sourceOverride" in block and block["sourceOverride"] not in SOURCE_MODES:
            block["sourceOverride"] = app_mode


# Settings a config upload announces on the bus when it changes them (the
# Settings PUT announces every write; apply_config writes rows directly).
_ANNOUNCED_SETTINGS: tuple[tuple[str, str], ...] = (
    ("sea", "aisSdrRadioId"),
    ("sea", "sourceOverride"),
    ("app", "connectivityMode"),
)


async def apply_config(db: AsyncSession, config: Any) -> None:
    """Upsert every setting in a config document into user_settings.

    Keys absent from the document are left as they are; `_`-prefixed entries
    (e.g. `_comment`), data keys, internal keys and secrets are ignored. Running
    decoders follow the change exactly as picking the value in Settings would.

    Raises:
        InvalidConfigError: when the document is not an object or holds an
            invalid `app.location` — nothing is written in that case.
    """
    if not isinstance(config, dict):
        raise InvalidConfigError("Config must be a JSON object")

    _assign_missing_radio_ids(config)
    await _resolve_retired_auto_modes(db, config)

    # Validate app.location up front so a bad coordinate rejects the whole
    # document rather than being persisted.
    app_block = config.get("app")
    if isinstance(app_block, dict) and "location" in app_block:
        app_block["location"] = validated_location(app_block["location"])

    # The APRS/AIS decoders are running processes, not just stored values: if
    # the document changes which radio feeds them, the bridges must follow so
    # the edit takes effect exactly as picking the radio in Settings would.
    previous_aprs_radio_id = await get_setting(db, "sdr", "aprs_radio_id", default=None)
    previous_ais_radio_id = await get_setting(db, "sdr", "ais_radio_id", default=None)
    previous_announced = {item: await get_setting(db, *item, default=None) for item in _ANNOUNCED_SETTINGS}

    from backend.database import is_removed_setting  # avoid import cycle at module load

    timestamp = now_ms()
    for namespace, entries in config.items():
        if namespace.startswith("_") or not isinstance(entries, dict):
            continue
        for key, value in entries.items():
            # Data files have their own editors — an old export that still
            # carries them must not silently overwrite the dedicated stores.
            if is_hidden_key(namespace, key):
                continue
            # Settings of removed features were pruned at startup; an old
            # export or stale config file must not bring them back.
            if is_removed_setting(namespace, key):
                continue
            # Secrets are redacted from exports, so a document can only ever
            # carry a blank — never let it wipe the stored one.
            if is_secret_setting(namespace, key):
                continue
            row = (
                await db.execute(
                    select(UserSettings).where(
                        UserSettings.namespace == namespace,
                        UserSettings.key == key,
                    )
                )
            ).scalar_one_or_none()
            value_text = json.dumps(value)
            if row:
                if row.value != value_text:
                    row.value = value_text
                    row.updated_at = timestamp
            else:
                db.add(UserSettings(namespace=namespace, key=key, value=value_text, updated_at=timestamp))

    await db.commit()

    # Decoder reconciliation is owned by whichever module manages the running
    # bridges (radio_hub/routers/decode.py) — publish the change on the event bus instead
    # of importing that router directly (that import is exactly the cycle
    # routers/sdr <-> routers/settings <-> services/app_config <-> database
    # this module was part of). `db` rides in the payload alongside the
    # JSON-safe `keys` so a subscriber reads through this same
    # already-committed session; see the note in routers/settings.py's PUT
    # handler for why.
    next_aprs_radio_id = await get_setting(db, "sdr", "aprs_radio_id", default=None)
    if next_aprs_radio_id != previous_aprs_radio_id:
        await bus.publish(
            "sdr.decode.radio-reassigned",
            {"decoder": "aprs", "db": db, "previous": previous_aprs_radio_id, "next": next_aprs_radio_id},
            # Preserves today's behaviour: an exception from
            # reconcile_aprs_decode() used to propagate out of apply_config()
            # unwrapped (a 500 from /api/settings/config/upload, or logged by
            # the config-file sync's broad except Exception).
            raise_errors=True,
        )
    elif isinstance(config.get("land"), dict) and "aprsChannelHz" in config["land"]:
        # Same radio, but the document may have moved the APRS channel. This
        # is the exact same event routers/settings.py's PUT handler publishes
        # for a direct land/aprsChannelHz write — one subscriber (in
        # radio_hub/routers/decode.py) re-reads the freshly committed channel and applies
        # it, whichever path triggered it.
        await bus.publish("settings.changed.land", {"keys": ["aprsChannelHz"], "db": db}, raise_errors=True)

    next_ais_radio_id = await get_setting(db, "sdr", "ais_radio_id", default=None)
    if next_ais_radio_id != previous_ais_radio_id:
        await bus.publish(
            "sdr.decode.radio-reassigned",
            {"decoder": "ais", "db": db, "previous": previous_ais_radio_id, "next": next_ais_radio_id},
            raise_errors=True,
        )

    # A document can change which radio Sea decodes AIS on, or whether Sea is
    # off grid. Announce those like a Settings save would, so whoever reacts to
    # them (Sea's AIS receiver) does whichever path wrote them.
    changed_keys: dict[str, list[str]] = {}
    for (namespace, key), previous in previous_announced.items():
        if await get_setting(db, namespace, key, default=None) != previous:
            changed_keys.setdefault(namespace, []).append(key)
    for namespace, keys in changed_keys.items():
        await bus.publish(f"settings.changed.{namespace}", {"keys": keys, "db": db})
