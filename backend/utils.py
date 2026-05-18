"""
Shared utilities used across multiple routers.
"""

import json
import re
import unicodedata

from backend.models import UserSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def slugify(value: str) -> str:
    """Derive a config-safe slug from a display name, Unicode-aware.

    'Air to Air Refueling' -> 'air-to-air-refueling'.
    Latin accents fold to ASCII so 'Café Naïve' -> 'cafe-naive', while
    non-Latin scripts are preserved rather than dropped:
    'Москва радио' -> 'москва-радио', '東京タワー' -> '東京タワー'.

    Lowercases, NFKC-normalises, strips combining marks, collapses any run of
    non-(letter/number) — including '_' — to a single hyphen, and trims
    leading/trailing hyphens. Returns '' when the input has no slug-able
    characters; callers fall back to the row id (e.g. f'group-{id}')."""
    s = unicodedata.normalize("NFKC", value or "").strip().lower()
    # Decompose, drop combining marks (café -> cafe), recompose. This only
    # affects characters that *have* a canonical decomposition, so scripts
    # without separable diacritics (Cyrillic, CJK, Arabic, …) pass through.
    s = "".join(c for c in unicodedata.normalize("NFKD", s)
                if not unicodedata.combining(c))
    s = unicodedata.normalize("NFKC", s)
    # \w is Unicode-aware (letters/digits/underscore in any script); turn
    # everything else into hyphens, then treat underscore as a separator too.
    s = re.sub(r"[^\w]+", "-", s, flags=re.UNICODE)
    s = re.sub(r"_+", "-", s)
    return s.strip("-")


GROUP_NAME_MAX_LEN = 60


class InvalidGroupName(ValueError):
    """Raised when a group name fails validation."""


def clean_group_name(value: object) -> str:
    """Validate and normalise a user-supplied frequency-group name.

    SQL injection is already structurally prevented — every query uses the
    SQLAlchemy ORM or bound `:params`, never string interpolation — so this
    guards the *other* free-text risks: control/zero-width/bidi characters
    that corrupt JSON config, logs or the UI; oversized input; and
    empty/whitespace-only names.

    Returns the cleaned name. Raises InvalidGroupName on reject so the API can
    surface a 422 and the config-import path can skip the entry."""
    if not isinstance(value, str):
        raise InvalidGroupName("name must be a string")
    # NFKC first so width/compatibility variants normalise before length check.
    s = unicodedata.normalize("NFKC", value)
    # Map whitespace controls (tab/newline/CR/FF/VT) to a space *before*
    # stripping so "a\tb" -> "a b", not "ab". str.split() handles the rest.
    s = "".join(" " if ch in "\t\n\r\f\v" else ch for ch in s)
    # Strip remaining C0/C1 controls, zero-width, and Unicode bidi-override
    # characters. Cf = format chars (zero-width, joiners); Cc = control; bidi
    # overrides (U+202A–202E, U+2066–2069) are Cf and thus covered, but list
    # them explicitly for clarity / defence in depth.
    _BIDI = {"‪", "‫", "‬", "‭", "‮",
             "⁦", "⁧", "⁨", "⁩"}
    s = "".join(
        ch for ch in s
        if ch not in _BIDI and unicodedata.category(ch) not in ("Cc", "Cf")
    )
    # Collapse internal whitespace runs to single spaces; trim ends.
    s = " ".join(s.split())
    if not s:
        raise InvalidGroupName("name must not be empty or whitespace-only")
    if len(s) > GROUP_NAME_MAX_LEN:
        raise InvalidGroupName(
            f"name must be at most {GROUP_NAME_MAX_LEN} characters"
        )
    return s


def _valid_url(url: object) -> str | None:
    """Return a cleaned URL string, or None if the value is empty/placeholder."""
    if url and isinstance(url, str) and url.strip() not in ("https://", "http://localhost", ""):
        return url.strip().rstrip("/")
    return None


async def resolve_domain_urls(
    domain: str,
    db: AsyncSession,
    online_default: str | None = None,
) -> tuple[str | None, str | None]:
    """Return (primary_url, fallback_url) for a given domain based on connectivity mode and override.

    Resolves effective mode:
      1. If {domain}.sourceOverride is 'online' or 'offgrid', use that.
      2. Otherwise, fall back to app.connectivityMode ('online' | 'offgrid', default 'online').

    When effective mode is 'online':   primary = online URL,   fallback = offgrid URL
    When effective mode is 'offgrid':  primary = offgrid URL,  fallback = online URL

    Args:
        domain:         Domain namespace string, e.g. 'air' or 'space'.
        db:             Active async database session.
        online_default: Fallback online URL used when the DB has no onlineUrl configured.
    """
    result = await db.execute(
        select(UserSettings).where(
            (UserSettings.namespace == domain) |
            ((UserSettings.namespace == "app") & (UserSettings.key == "connectivityMode"))
        )
    )
    rows = result.scalars().all()

    settings_map: dict[str, object] = {}
    for row in rows:
        namespaced_key = f"{row.namespace}.{row.key}"
        try:
            settings_map[namespaced_key] = json.loads(row.value)
        except (json.JSONDecodeError, TypeError):
            settings_map[namespaced_key] = row.value

    # Resolve effective mode
    override = settings_map.get(f"{domain}.sourceOverride", "auto")
    if override in ("online", "offgrid"):
        effective_mode = override
    else:
        effective_mode = settings_map.get("app.connectivityMode", "online") or "online"

    _online_key  = {"air": "onlineDataSourceURL"}.get(domain, "onlineUrl")
    _offgrid_key = {"air": "offgridDataSourceURL"}.get(domain, "offgridSource")

    online = _valid_url(settings_map.get(f"{domain}.{_online_key}")) or _valid_url(online_default)

    # offgrid source is stored as {"url": "http://..."} by the frontend settings panel
    offgrid_raw = settings_map.get(f"{domain}.{_offgrid_key}")
    if isinstance(offgrid_raw, dict):
        offgrid = _valid_url(offgrid_raw.get("url"))
    else:
        offgrid = _valid_url(offgrid_raw)

    if effective_mode == "offgrid":
        return offgrid, online
    return online, offgrid
