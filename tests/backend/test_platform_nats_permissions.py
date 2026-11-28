"""
tests/backend/test_platform_nats_permissions.py

Unit tests for backend/platform/nats_permissions.py — the per-service NATS
subject table (P7.4) and the `nats.conf` permission blocks built from it.
"""

from __future__ import annotations

import pytest

from backend.platform.nats_permissions import (
    CORE_USER,
    EVERY_SUBJECT,
    SERVICE_PERMISSIONS,
    SubjectPermissions,
    inbox_prefix,
    server_permissions,
)


class TestTable:
    def test_every_extractable_service_and_core_has_a_user(self):
        # A service missing here would get no credentials and could never join the bus.
        assert set(SERVICE_PERMISSIONS) == {
            CORE_USER,
            "space",
            "land",
            "air",
            "sea",
            "radio",
            "sdr",
            "docs",
            "sdr-manager-local",
            "sdr-manager-remote",
        }

    def test_only_core_may_use_every_subject(self):
        unrestricted = [
            user
            for user, rules in SERVICE_PERMISSIONS.items()
            if EVERY_SUBJECT in (*rules.publish, *rules.subscribe, *rules.requests)
        ]
        assert unrestricted == [CORE_USER]

    def test_only_core_the_radio_hub_and_sdr_manager_remote_answer_requests(self):
        responders = {
            user
            for user, rules in SERVICE_PERMISSIONS.items()
            if rules.answers_requests
        }
        assert responders == {CORE_USER, "radio", "sdr-manager-remote"}

    @pytest.mark.parametrize(
        ("user", "subject"),
        [
            ("radio", "decode.aprs.radio-1"),
            ("air", "notifications.raise"),
            ("air", "sdr-manager.remote.reservation.acquire"),
            ("sea", "hub.decode.ais.start"),
            ("sdr", "hub.iq-capture.locate"),
            ("sdr-manager-remote", "sdr-manager.claims.granted"),
            ("sdr-manager-remote", "sdr-manager.claims.released"),
        ],
    )
    def test_publishers_and_requesters_reach_the_subjects_they_use(self, user, subject):
        allowed = server_permissions(user)["publish"]["allow"]
        assert any(_matches(pattern, subject) for pattern in allowed)

    @pytest.mark.parametrize(
        ("user", "subject"),
        [
            ("radio", "hub.iq-capture.stop"),
            ("radio", "settings.changed.land"),
            ("radio", "sdr.decode.radio-reassigned"),
            ("air", "air.squawk.changed"),
            ("sea", "decode.ais.radio-1"),
            ("sea", "settings.changed.app"),
            ("land", "decode.aprs.radio-1"),
            ("sdr-manager-remote", "sdr-manager.remote.reservation.acquire"),
            ("sdr-manager-remote", "sdr-manager.remote.hosts.snapshot"),
        ],
    )
    def test_subscribers_hear_the_subjects_they_handle(self, user, subject):
        allowed = server_permissions(user)["subscribe"]["allow"]
        assert any(_matches(pattern, subject) for pattern in allowed)

    @pytest.mark.parametrize(
        ("user", "subject"),
        [
            ("land", "decode.ais.radio-1"),
            ("sea", "decode.aprs.radio-1"),
            ("air", "hub.iq-capture.list"),
            ("sdr-manager-remote", "hub.sentry.reservation.acquire"),
            ("sdr-manager-remote", "sdr-manager.claims.granted"),
            ("sdr-manager-remote", "decode.ais.radio-1"),
        ],
    )
    def test_a_service_cannot_hear_another_section_s_subjects(self, user, subject):
        allowed = server_permissions(user)["subscribe"]["allow"]
        assert not any(_matches(pattern, subject) for pattern in allowed)

    @pytest.mark.parametrize(
        "subject",
        [
            "sdr-manager.remote.reservation.acquire",
            "hub.sentry.reservation.acquire",
            "notifications.raise",
        ],
    )
    def test_sdr_manager_remote_publishes_only_claim_events(self, subject):
        allowed = server_permissions("sdr-manager-remote")["publish"]["allow"]
        assert allowed == ["sdr-manager.claims.>"]
        assert not any(_matches(pattern, subject) for pattern in allowed)

    def test_sdr_manager_local_is_denied_every_subject(self):
        # It never connects to NATS; if it ever did, it could do nothing there.
        assert server_permissions("sdr-manager-local") == {
            "publish": {"deny": [">"]},
            "subscribe": {"allow": ["_INBOX.sdr-manager-local.>"]},
        }


class TestSdrManagerSubjects:
    """Who may speak for SDR hosts and their claims on the bus (ADR 0007).

    The hub streams the dongles and sdr-manager-remote leases them. A service
    that could answer a reservation subject could hand Air a fake lease; one
    that could publish on `sdr-manager.claims.*` could make the hub stop
    tuning (or resume tuning) a dongle nobody claimed.
    """

    def test_the_hub_hears_the_claims_and_may_answer_the_grant(self):
        permissions = server_permissions("radio")
        allowed = permissions["subscribe"]["allow"]

        assert _matches_any(allowed, "sdr-manager.claims.granted")
        assert _matches_any(allowed, "sdr-manager.claims.released")
        assert permissions["allow_responses"] is True

    def test_the_hub_asks_for_the_host_snapshot_and_nothing_else_of_sdr_manager_remote(
        self,
    ):
        allowed = server_permissions("radio")["publish"]["allow"]

        assert _matches_any(allowed, "sdr-manager.remote.hosts.snapshot")
        for subject in (
            "sdr-manager.remote.reservation.acquire",
            "sdr-manager.remote.reservation.release",
            "sdr-manager.remote.device.address",
            "sdr-manager.remote.host.location",
        ):
            assert not _matches_any(allowed, subject), subject

    @pytest.mark.parametrize(
        "subject",
        [
            "sdr-manager.remote.reservation.acquire",
            "sdr-manager.remote.reservation.release",
            "sdr-manager.remote.device.address",
            "sdr-manager.remote.host.location",
            "sdr-manager.remote.hosts.snapshot",
        ],
    )
    def test_the_hub_cannot_answer_sdr_manager_remote_s_subjects(self, subject):
        # It answered the reservations (as `hub.sentry.*`) before ADR 0007. It
        # still hears `hub.>`, but nothing may send the old subjects now: see
        # test_air_cannot_ask_the_hub_for_reservations_any_more.
        assert not _matches_any(
            server_permissions("radio")["subscribe"]["allow"], subject
        )

    @pytest.mark.parametrize(
        "subject",
        [
            "sdr-manager.remote.reservation.acquire",
            "sdr-manager.remote.reservation.release",
            "sdr-manager.remote.device.address",
            "sdr-manager.remote.host.location",
        ],
    )
    def test_only_sdr_manager_remote_and_core_answer_air_s_requests(self, subject):
        responders = {
            user
            for user in SERVICE_PERMISSIONS
            if _matches_any(server_permissions(user)["subscribe"]["allow"], subject)
        }

        assert responders == {CORE_USER, "sdr-manager-remote"}

    @pytest.mark.parametrize(
        "subject", ["sdr-manager.claims.granted", "sdr-manager.claims.released"]
    )
    def test_only_sdr_manager_remote_and_core_publish_claims(self, subject):
        publishers = {
            user
            for user in SERVICE_PERMISSIONS
            if _matches_any(
                server_permissions(user)["publish"].get("allow", []), subject
            )
        }

        assert publishers == {CORE_USER, "sdr-manager-remote"}

    @pytest.mark.parametrize(
        "subject", ["sdr-manager.claims.granted", "sdr-manager.claims.released"]
    )
    def test_only_the_hub_and_core_hear_claims(self, subject):
        listeners = {
            user
            for user in SERVICE_PERMISSIONS
            if _matches_any(server_permissions(user)["subscribe"]["allow"], subject)
        }

        assert listeners == {CORE_USER, "radio"}

    def test_air_cannot_ask_the_hub_for_reservations_any_more(self):
        assert not _matches_any(
            server_permissions("air")["publish"]["allow"],
            "hub.sentry.reservation.acquire",
        )


class TestServerPermissions:
    def test_requests_need_publish_rights_and_replies_come_to_the_user_s_own_inbox(
        self, monkeypatch
    ):
        monkeypatch.setitem(
            SERVICE_PERMISSIONS,
            "probe",
            SubjectPermissions(
                publish=("a.b",), subscribe=("c.*",), requests=("hub.x",)
            ),
        )
        assert server_permissions("probe") == {
            "publish": {"allow": ["a.b", "hub.x"]},
            "subscribe": {"allow": ["c.*", "_INBOX.probe.>"]},
        }

    def test_a_user_that_publishes_nothing_is_denied_every_subject(self, monkeypatch):
        # An empty allow list would mean "unrestricted" to NATS.
        monkeypatch.setitem(SERVICE_PERMISSIONS, "probe", SubjectPermissions())
        assert server_permissions("probe")["publish"] == {"deny": [">"]}
        assert server_permissions("probe")["subscribe"] == {"allow": ["_INBOX.probe.>"]}

    def test_a_responder_may_answer_the_requests_it_receives(self):
        assert server_permissions("radio")["allow_responses"] is True
        assert "allow_responses" not in server_permissions("sdr")

    def test_core_is_unrestricted(self):
        assert server_permissions(CORE_USER) == {
            "publish": {"allow": [">"]},
            "subscribe": {"allow": [">", "_INBOX.core.>"]},
            "allow_responses": True,
        }

    def test_unknown_user_is_an_error(self):
        with pytest.raises(KeyError):
            server_permissions("nobody")


def test_inbox_prefix_is_per_user():
    assert inbox_prefix("air") == "_INBOX.air"


def _matches_any(patterns: list[str], subject: str) -> bool:
    return any(_matches(pattern, subject) for pattern in patterns)


def _matches(pattern: str, subject: str) -> bool:
    """NATS subject matching: `*` is one token, a trailing `>` is one or more."""
    pattern_tokens, subject_tokens = pattern.split("."), subject.split(".")
    for index, token in enumerate(pattern_tokens):
        if token == ">":
            return len(subject_tokens) > index
        if index >= len(subject_tokens) or token not in ("*", subject_tokens[index]):
            return False
    return len(pattern_tokens) == len(subject_tokens)
