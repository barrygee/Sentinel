"""Claiming and tuning the Sentry dongle that feeds Off Grid ADS-B.

Off Grid air data used to be a URL and nothing else, which left the actual
receiver anonymous: Sentinel knew where to *read* aircraft from, but not which
dongle produced the samples, so it could neither tune it nor stop anything else
retuning it. The map went empty and said nothing about why.

This resolves `air.offgridSdrSource` — a `{sentry_host_id, sentry_device_id}`
pair — into a live Sentry device, claims it, and tunes it to 1090 MHz in one
step. See Sentinel ADR-0003.

**Tuning travels with the claim, never after it.** Two calls would leave a
window where the device is ours but still on the wrong frequency, and a second
request that can fail on its own means handling "claimed but not tuned" — a
state nothing wants to be in and nothing would clean up.

**Air never talks to Sentry itself.** The Sentry hosts and their console
passwords belong to the radio hub, so every claim, release and address lookup
is a bus request to the hub's reservation proxy
(`radio_hub/services/sentry_reservations.py`, plan item B6). The hub supplies the lease
holder — this Sentinel's `app.instanceId` — so Air does not handle that either.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from backend.db_helpers import get_setting, upsert_setting
from backend.platform.bus import bus
from sqlalchemy.ext.asyncio import AsyncSession

ADSB_CENTRE_HZ = 1_090_000_000
"""1090 MHz — the ADS-B downlink. Not configurable: a receiver tuned anywhere
else is not an ADS-B receiver, and offering the choice would only invite a
setting that silently produces an empty map."""

ADSB_SAMPLE_RATE = 2_400_000
"""2.4 MSPS. ADS-B is a 2 MHz-wide pulse-position signal, so anything much below
this cannot resolve the pulses; 2.4 is what the decoders assume."""

ADSB_GAIN_DB = 49.6
"""Maximum tuner gain, and deliberately **not** AGC.

AGC is the obvious choice and the wrong one here. ADS-B is a burst mode: each
message is a handful of 0.5 µs pulses with long silence between, and the tuner's
automatic gain control cannot track anything that short — it settles for the
*silence*, which is to say it settles low, and the pulses that matter arrive
below the noise floor. Every ADS-B decoder's own guidance starts at maximum gain
for this reason.

49.6 dB is the R820T's top step. An aerial close to an airport can overload at
this level, which shows up as the message rate *falling* as traffic gets
nearer — the fix there is a lower fixed gain, not AGC."""

RESERVATION_TTL_SECONDS = 120
RENEWAL_INTERVAL_SECONDS = 30
"""Four missed renewals before the lease lapses — enough slack for a lost poll
or two without leaving a dongle held for minutes after its user has gone."""

SOURCE_SETTING_NAMESPACE = "air"
SOURCE_SETTING_KEY = "offgridSdrSource"

# Request subjects answered by the radio hub's reservation proxy.
ACQUIRE_SUBJECT = "hub.sentry.reservation.acquire"
RELEASE_SUBJECT = "hub.sentry.reservation.release"
DEVICE_ADDRESS_SUBJECT = "hub.sentry.device.address"
HUB_REQUEST_TIMEOUT: float | None = None
"""No bus-level limit: the hub's Sentry client already bounds every call with
its connect/read timeouts, and one claim may be several Sentry round trips."""

RESERVATION_LABEL = "Sentinel — AIR (ADS-B)"
"""What Sentry's console shows against the claimed device. Names the *view*, not
just the app: an operator seeing a dongle busy wants to know which part of
Sentinel wants it, so they know what to close to get it back."""


class AdsbSourceError(Exception):
    """A reason the source could not be claimed, in words an operator can act on."""

    def __init__(self, code: str, message: str, **context: Any) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.context = context


@dataclass(frozen=True)
class AdsbSource:
    """The Sentry device configured as the Off Grid ADS-B receiver."""

    host_id: int
    device_id: str


async def get_source(db: AsyncSession) -> AdsbSource | None:
    """The configured source device, or `None` when the operator has not picked one."""
    raw = await get_setting(db, SOURCE_SETTING_NAMESPACE, SOURCE_SETTING_KEY)
    if not isinstance(raw, dict):
        return None
    host_id = raw.get("sentry_host_id")
    device_id = raw.get("sentry_device_id")
    if not isinstance(host_id, int) or not isinstance(device_id, str) or not device_id:
        return None
    return AdsbSource(host_id=host_id, device_id=device_id)


async def set_source(db: AsyncSession, host_id: int, device_id: str) -> AdsbSource:
    """Record which Sentry device feeds Off Grid ADS-B."""
    await upsert_setting(
        db,
        SOURCE_SETTING_NAMESPACE,
        SOURCE_SETTING_KEY,
        {"sentry_host_id": host_id, "sentry_device_id": device_id},
    )
    return AdsbSource(host_id=host_id, device_id=device_id)


async def clear_source(db: AsyncSession) -> None:
    """Unset the ADS-B receiver, giving back any device it still holds first.

    The release must come before the setting is cleared: once it is gone,
    nothing remembers which device to release, and the lease would sit on that
    dongle until it expired. Stored as `null` rather than deleted so the key
    keeps its place in the config document, as its default does.
    """
    await release(db)
    await upsert_setting(db, SOURCE_SETTING_NAMESPACE, SOURCE_SETTING_KEY, None)


def _host_error(reply: dict[str, Any]) -> AdsbSourceError | None:
    """The operator-facing error for a host the hub could not use, if that is what failed."""
    if reply["reason"] == "unknown_host":
        return AdsbSourceError(
            "unknown_host",
            "The Sentry host this ADS-B source belongs to no longer exists. Pick a source again.",
        )
    if reply["reason"] == "host_disabled":
        return AdsbSourceError(
            "host_disabled",
            f"The Sentry host {reply['host_label']} is switched off in Sentinel.",
        )
    return None


def _acquire_error(reply: dict[str, Any]) -> AdsbSourceError:
    """Translate a failed hub acquire reply into the error an operator sees."""
    host_error = _host_error(reply)
    if host_error is not None:
        return host_error
    if reply["reason"] == "unreachable":
        return AdsbSourceError("host_unreachable", reply["message"])
    if reply["stage"] == "patch":
        return AdsbSourceError(
            reply["code"] or "tuning_failed",
            f"The device was claimed but could not be tuned: {reply['message']}",
        )
    if reply["status_code"] == 409:
        context = reply["context"]
        return AdsbSourceError(
            "device_reserved",
            reply["message"],
            holder=context.get("holder"),
            label=context.get("label"),
        )
    if reply["status_code"] == 401:
        return AdsbSourceError(
            "unauthenticated",
            "Sentinel could not sign in to that Sentry. Check its console password in Settings → SDR.",
        )
    return AdsbSourceError(reply["code"] or "sentry_error", reply["message"])


async def claim_and_tune(db: AsyncSession, *, force: bool = False) -> dict[str, Any]:
    """Claim the ADS-B source and put it on 1090 MHz. Returns the live reservation.

    Called when AIR becomes visible off grid, and again on the renewal timer.
    Both are the same call: renewing is just claiming again, and a renewal that
    arrives after the lease lapsed becomes a fresh claim rather than an error.

    The tuning is re-applied on every renewal rather than only on the first
    claim. It costs one small request every thirty seconds and it is what makes
    the arrangement self-healing: a dongle that was replugged, a Sentry that
    restarted, or an operator who retuned it by hand all come back to 1090 MHz
    on the next tick instead of leaving a map that is quietly empty.
    """
    source = await get_source(db)
    if source is None:
        raise AdsbSourceError(
            "no_source",
            "No Sentry SDR is set as the Off Grid ADS-B source. Choose one in Settings → AIR.",
        )

    reply = await bus.request(
        ACQUIRE_SUBJECT,
        {
            "db": db,
            "host_id": source.host_id,
            "device_id": source.device_id,
            "label": RESERVATION_LABEL,
            "ttl_seconds": RESERVATION_TTL_SECONDS,
            "force": force,
            "patch": {
                "center_hz": ADSB_CENTRE_HZ,
                "sample_rate": ADSB_SAMPLE_RATE,
                # Fixed maximum gain, not AGC — see `ADSB_GAIN_DB`.
                "gain_auto": False,
                "gain_db": ADSB_GAIN_DB,
                "enabled": True,
            },
        },
        timeout=HUB_REQUEST_TIMEOUT,
    )
    if not reply["ok"]:
        raise _acquire_error(reply)

    return {
        "source": {"sentry_host_id": source.host_id, "sentry_device_id": source.device_id},
        "reservation": reply["reservation"],
        "tuned": {"center_hz": ADSB_CENTRE_HZ, "sample_rate": ADSB_SAMPLE_RATE},
        "renew_within_seconds": RENEWAL_INTERVAL_SECONDS,
    }


async def release(db: AsyncSession) -> bool:
    """Give the source device back. True when a release was actually sent.

    Best effort throughout: the lease expires on its own, so every failure here
    costs at most a couple of minutes of a device nobody is using. Leaving AIR
    should never surface an error about a dongle.
    """
    source = await get_source(db)
    if source is None:
        return False
    reply = await bus.request(
        RELEASE_SUBJECT,
        {"db": db, "host_id": source.host_id, "device_id": source.device_id},
        timeout=HUB_REQUEST_TIMEOUT,
    )
    return bool(reply["ok"])


async def get_decoder_config(db: AsyncSession) -> dict[str, Any]:
    """What the ADS-B decoder container needs to find its I/Q stream.

    Polled by the sidecar so the rtl_tcp address lives in one place — the source
    the operator picked — rather than being duplicated into compose environment
    variables that drift the moment the source changes.

    Reports the source as unset rather than erroring when none is chosen: the
    decoder polls this on a loop from boot, and a container that crash-looped
    until an operator visited a settings page would bury the real message.
    """
    source = await get_source(db)
    if source is None:
        return {"configured": False, "rtl_tcp": None}

    reply = await bus.request(
        DEVICE_ADDRESS_SUBJECT,
        {"db": db, "host_id": source.host_id, "device_id": source.device_id},
        timeout=HUB_REQUEST_TIMEOUT,
    )
    if not reply["ok"] or not reply["found"]:
        return {"configured": False, "rtl_tcp": None}
    return {
        "configured": True,
        "rtl_tcp": {"host": reply["host"], "port": reply["port"]},
        "sentry_device_id": source.device_id,
    }
