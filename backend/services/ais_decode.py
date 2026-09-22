"""Off-grid AIS decode — sidecar events mapped into the live vessel store.

The Sea domain has two sources of vessels and exactly one picture of them:

  * **online** — :mod:`backend.services.ais_stream` reads AISStream.io envelopes
    over a WebSocket;
  * **off grid** — the ``ais-decoder`` sidecar (Direwolf's AIS modem, fed by
    :class:`~backend.services.sdr_decode.AisDecodeBridge`) decodes AIVDM
    sentences off the air and POSTs them to the SDR router's AIS ingest.

This module is the adapter for the second: it turns one decoded sidecar event
into the **AISStream-shaped envelope** :meth:`AisVesselStore.ingest_envelope`
already understands, so off-grid vessels flow into the same store as online
ones. Everything downstream — the snapshot endpoint, track buffers, ship-type
classification, the ``sea_vessel_cache`` warm start and the map itself — is
then identical whichever source is live, and no code has to ask where a vessel
came from.

Mapping to the existing envelope shape (rather than adding a second ingest path
to the store) is deliberate: it keeps one definition of what a vessel record is.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from backend.services import ais_store

# AIVDM message types that carry a position (ITU-R M.1371):
#   1–3   Position Report Class A
#   18/19 Standard/Extended Class B position report
#   27    Long-range position report
_POSITION_MESSAGE_TYPES = frozenset({1, 2, 3, 18, 19, 27})
# Types carrying static/voyage data: 5 (Class A) and 24 (Class B part A/B).
_STATIC_MESSAGE_TYPES = frozenset({5, 24})


def _iso_time_utc(unix_ms: int) -> str:
    """Format Unix ms as the ``time_utc`` string the store's parser accepts."""
    return datetime.fromtimestamp(unix_ms / 1000, tz=UTC).strftime("%Y-%m-%d %H:%M:%S.%f +0000 UTC")


def _clean_text(value: object) -> str:
    """Return a trimmed string, or "" — AIS pads unused name/destination chars."""
    if value is None:
        return ""
    return str(value).strip().strip("@").strip()


def _optional_number(value: object) -> float | None:
    """Return ``value`` as a float, or None when missing/non-numeric."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def envelope_from_event(event: dict[str, Any]) -> dict[str, Any] | None:
    """Map one decoded AIS sidecar event to an AISStream-shaped envelope, or None.

    Returns None when the event carries nothing the store can use — a raw ``log``
    line, a status frame, a message type that is neither position nor static
    data, or a record with no usable MMSI. Callers treat None as "relay it to the
    WebSocket subscribers but don't touch the vessel store".

    The envelope deliberately fills ``MetaData`` the way AISStream does (MMSI,
    ShipName, latitude/longitude, time_utc) because that is the branch
    :meth:`AisVesselStore.ingest_envelope` reads first.
    """
    if not isinstance(event, dict):
        return None
    mmsi = _clean_text(event.get("mmsi"))
    if not mmsi.isdigit() or not 5 <= len(mmsi) <= 10:
        return None

    message_type = event.get("msgType")
    try:
        message_type = int(message_type)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None

    received_ms = event.get("ts")
    timestamp_ms = int(received_ms) if isinstance(received_ms, int | float) else ais_store.now_ms()
    metadata: dict[str, Any] = {"MMSI": mmsi, "time_utc": _iso_time_utc(timestamp_ms)}

    ship_name = _clean_text(event.get("name"))
    if ship_name:
        metadata["ShipName"] = ship_name

    if message_type in _STATIC_MESSAGE_TYPES:
        return {
            "MessageType": "ShipStaticData",
            "MetaData": metadata,
            "Message": {
                "ShipStaticData": {
                    "UserID": mmsi,
                    "Name": ship_name,
                    "Type": event.get("shipType"),
                    "Destination": _clean_text(event.get("destination")),
                    "ImoNumber": _clean_text(event.get("imo")),
                    "CallSign": _clean_text(event.get("callsign")),
                }
            },
        }

    if message_type not in _POSITION_MESSAGE_TYPES:
        return None

    latitude = _optional_number(event.get("lat"))
    longitude = _optional_number(event.get("lon"))
    # 91/181 are AIS's "position not available" sentinels; a position report
    # without a usable fix tells the store nothing, so drop it here rather than
    # letting it land as a vessel at the north pole.
    if latitude is None or longitude is None or abs(latitude) > 90 or abs(longitude) > 180:
        return None
    metadata["latitude"] = latitude
    metadata["longitude"] = longitude

    position_report: dict[str, Any] = {
        "UserID": mmsi,
        "Latitude": latitude,
        "Longitude": longitude,
        "Sog": _optional_number(event.get("sog")),
        "Cog": _optional_number(event.get("cog")),
        "TrueHeading": _optional_number(event.get("heading")),
        "NavigationalStatus": _optional_number(event.get("navStatus")),
    }
    if ship_name:
        position_report["Name"] = ship_name
    return {
        "MessageType": "PositionReport",
        "MetaData": metadata,
        "Message": {"PositionReport": position_report},
    }


def ingest_event(event: dict[str, Any]) -> bool:
    """Feed one decoded sidecar event into the live vessel store.

    Returns True when the event updated the store — the off-grid feed's
    equivalent of AISStream's "the upstream is delivering traffic" proof, used to
    report decode liveness. Unusable events (raw log lines, unsupported message
    types) return False without raising, so one odd frame never breaks ingest.
    """
    envelope = envelope_from_event(event)
    if envelope is None:
        return False
    return ais_store.store.ingest_envelope(envelope)
