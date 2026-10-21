"""Which event-bus subjects each Sentinel process may use on NATS (plan §4.5, P7.4).

Every process connects as its own NATS user, and the server enforces this
table: `backend/scripts/generate_service_credentials.py` writes it into the
server's `nats.conf` on every `docker compose up`. A subject a service starts
using must be added here, or the broker refuses it (the service logs a NATS
"Permissions Violation" and the event stays in-process).

Request/reply works like this: a requester publishes the request subject and
receives the reply on its own inbox, `_INBOX.<user>.>` (the transport sets
that prefix, see `nats_credentials.py`), so no service can read another's
replies; a responder subscribes the request subject and may publish only the
one reply each request asks for (`allow_responses`).
"""

from __future__ import annotations

from dataclasses import dataclass

CORE_USER = "core"
"""The app. It is the deployment's root of trust (it holds every setting and
secret), so it may use every subject."""

EVERY_SUBJECT = ">"


@dataclass(frozen=True)
class SubjectPermissions:
    """One NATS user's allowed subjects (NATS wildcards: `*` one token, `>` the rest)."""

    publish: tuple[str, ...] = ()
    subscribe: tuple[str, ...] = ()
    answers_requests: bool = False
    """True for a responder: it may publish the reply to each request it receives."""
    requests: tuple[str, ...] = ()
    """Request subjects it sends; they need publish rights like any other subject."""


SERVICE_PERMISSIONS: dict[str, SubjectPermissions] = {
    CORE_USER: SubjectPermissions(publish=(EVERY_SUBJECT,), subscribe=(EVERY_SUBJECT,), answers_requests=True),
    # Owns the radios: answers every hub.* request, publishes what its
    # decoders hear, and follows the APRS channel and decoder radio moves.
    "radio": SubjectPermissions(
        publish=("decode.>",),
        subscribe=("hub.>", "settings.changed.land", "sdr.decode.radio-reassigned"),
        answers_requests=True,
    ),
    # Squawk alerts to core; Sentry reservations and receiver locations from the hub.
    "air": SubjectPermissions(
        publish=("notifications.raise", "air.squawk.changed"),
        subscribe=("air.squawk.changed",),
        requests=("hub.sentry.>",),
    ),
    # Off-grid vessels from the hub's AIS decoder, which it starts and stops.
    "sea": SubjectPermissions(
        subscribe=("decode.ais.*", "settings.changed.sea", "settings.changed.app"),
        requests=("hub.decode.ais.>",),
    ),
    # APRS packets heard by the hub.
    "land": SubjectPermissions(subscribe=("decode.aprs.*",)),
    # IQ captures, recorded and staged by the hub.
    "sdr": SubjectPermissions(requests=("hub.iq-capture.>",)),
    # Uses no subject today; it still connects, like every service.
    "space": SubjectPermissions(),
    # Serves the in-app documentation and uses no subject; it still connects, like every service.
    "docs": SubjectPermissions(),
    # This machine's dongles (ADR 0007). It never connects: it talks to core
    # over HTTPS and to sdr-manager-remote through the SDR Manager API. Listed
    # with no subjects so its HTTP credential has an entry here too.
    "sdr-manager-local": SubjectPermissions(),
    # SDR hosts on other machines: answers the reservation, device-address,
    # host-location and host-snapshot requests, and tells the hub which
    # dongles are claimed so it never retunes one.
    "sdr-manager-remote": SubjectPermissions(
        publish=("sdr-manager.claims.>",),
        subscribe=("sdr-manager.remote.>",),
        answers_requests=True,
    ),
}
"""Keyed by NATS user name: `core` for the app, otherwise the service id."""


def inbox_prefix(user: str) -> str:
    """The reply-inbox prefix `user` requests with, so only it may read its replies."""
    return f"_INBOX.{user}"


def server_permissions(user: str) -> dict[str, object]:
    """`user`'s entry in the `permissions` block of the server's `nats.conf`."""
    rules = SERVICE_PERMISSIONS[user]
    publish = [*rules.publish, *rules.requests]
    subscribe = [*rules.subscribe, f"{inbox_prefix(user)}.>"]
    permissions: dict[str, object] = {
        # NATS reads an empty allow list as "no restriction", so a user that
        # publishes nothing is denied everything instead.
        "publish": {"allow": publish} if publish else {"deny": [EVERY_SUBJECT]},
        "subscribe": {"allow": subscribe},
    }
    if rules.answers_requests:
        permissions["allow_responses"] = True
    return permissions
