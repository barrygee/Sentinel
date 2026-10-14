"""Dongles this Sentinel has claimed through Sentry, keyed by their rtl_tcp address.

AIR's ADS-B claim reserves a Sentry device and tunes it to 1090 MHz at 2.4 MS/s
(``sentry_reservations``). With one dongle doubling as, say, the AIS radio, the
rest of the hub would otherwise fight that claim: the AIS bridge pulls the radio
back to 162 MHz every 15 s, and a radio connection that becomes the relay's
tuning owner re-asserts its own default sample rate — which is how ADS-B ended
up decoding nothing at 2.048 MS/s. The owner's rule is that the claim wins: while
a claim holds, nothing in the hub retunes that dongle (``ReadOnlyTuningError``
for radio connections, a paused retune for the channel-owning bridges).

Claims are recorded with Sentry's ``expires_at``, so a claim AIR stops renewing
(the page closed without releasing) lapses here exactly when Sentry lets it go.
"""

from __future__ import annotations

import time

# "host:port" → claim expiry, Unix ms.
_claims: dict[str, int] = {}


def _key(host: str, port: int | str) -> str:
    return f"{host}:{int(port)}"


def mark_claimed(host: str, port: int | str, expires_at_ms: int) -> None:
    """Record (or renew) a claim on the dongle streaming at ``host:port``."""
    _claims[_key(host, port)] = expires_at_ms


def mark_released(host: str, port: int | str) -> None:
    """Forget the claim on ``host:port`` (released, or the device moved)."""
    _claims.pop(_key(host, port), None)


def is_claimed(host: str, port: int | str, *, now_ms: int | None = None) -> bool:
    """Whether a live claim holds the dongle at ``host:port``. Expired claims are dropped."""
    key = _key(host, port)
    expires_at_ms = _claims.get(key)
    if expires_at_ms is None:
        return False
    current = now_ms if now_ms is not None else int(time.time() * 1000)
    if expires_at_ms <= current:
        del _claims[key]
        return False
    return True


def clear() -> None:
    """Forget every claim (tests)."""
    _claims.clear()
