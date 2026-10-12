"""What each caller may do on internal routes (backend/platform/service_access.py, P7.4b).

The table is the whole authorization story, so each rule is pinned both ways:
the caller it names is allowed, and every other caller is refused.
"""

import pytest

from backend.platform import service_access
from backend.platform.nats_permissions import SERVICE_PERMISSIONS
from backend.platform.service_access import (
    CALLER_ACCESS,
    DECODER_ACCESS,
    SERVICE_ACCESS,
    VERIFYING_SERVICES,
    may_decode,
    may_fetch_iq_captures,
    may_register,
    may_use_secret,
)

SECTION_SERVICES = ["radio-hub", "space", "land", "air", "sea", "sdr"]


class TestTheTable:
    def test_every_nats_user_has_an_http_entry_and_back(self):
        assert set(SERVICE_ACCESS) == set(SERVICE_PERMISSIONS)

    def test_services_and_decoders_never_share_a_name(self):
        assert not set(SERVICE_ACCESS) & set(DECODER_ACCESS)
        assert CALLER_ACCESS == {**SERVICE_ACCESS, **DECODER_ACCESS}

    def test_core_and_the_radio_hub_are_the_verifiers(self):
        assert VERIFYING_SERVICES == ("core", "radio-hub")

    def test_each_decoder_owns_a_distinct_kind(self):
        kinds = [access.decoder_kind for access in DECODER_ACCESS.values()]
        assert sorted(kinds) == ["ais", "aprs", "stub", "voice"]


class TestMayRegister:
    @pytest.mark.parametrize("service_id", SECTION_SERVICES)
    def test_a_service_registers_its_own_id(self, service_id):
        assert may_register(service_id, service_id)

    @pytest.mark.parametrize("service_id", SECTION_SERVICES)
    def test_a_service_cannot_register_another_id(self, service_id):
        other = "space" if service_id != "space" else "sea"
        assert not may_register(service_id, other)

    def test_core_registers_any_id(self):
        assert may_register("core", "weather")

    def test_a_decoder_registers_no_service(self):
        assert not may_register("stub-decoder", "stub-decoder")

    def test_an_unknown_caller_registers_nothing(self):
        assert not may_register("weather", "weather")


class TestMayUseSecret:
    def test_sea_reaches_its_aisstream_key(self):
        assert may_use_secret("sea", "sea", "aisstreamApiKey")

    def test_sea_reaches_no_other_secret(self):
        assert not may_use_secret("sea", "sea", "somethingElse")
        assert not may_use_secret("sea", "app", "aisstreamApiKey")

    @pytest.mark.parametrize(
        "caller", [c for c in CALLER_ACCESS if c not in ("sea", "core")]
    )
    def test_no_other_caller_reaches_the_aisstream_key(self, caller):
        assert not may_use_secret(caller, "sea", "aisstreamApiKey")

    def test_core_reaches_every_secret(self):
        assert may_use_secret("core", "sea", "aisstreamApiKey")

    def test_an_unknown_caller_reaches_nothing(self):
        assert not may_use_secret("weather", "sea", "aisstreamApiKey")


class TestMayFetchIqCaptures:
    def test_the_sdr_section_and_core_may(self):
        assert may_fetch_iq_captures("sdr")
        assert may_fetch_iq_captures("core")

    @pytest.mark.parametrize(
        "caller", [c for c in CALLER_ACCESS if c not in ("sdr", "core")]
    )
    def test_no_one_else_may(self, caller):
        assert not may_fetch_iq_captures(caller)

    def test_an_unknown_caller_may_not(self):
        assert not may_fetch_iq_captures("weather")


class TestMayDecode:
    @pytest.mark.parametrize(
        ("caller", "kind"),
        [
            ("voice-decoder", "voice"),
            ("aprs-decoder", "aprs"),
            ("ais-decoder", "ais"),
            ("stub-decoder", "stub"),
        ],
    )
    def test_a_decoder_acts_as_its_own_kind(self, caller, kind):
        assert may_decode(caller, kind)

    @pytest.mark.parametrize("caller", list(DECODER_ACCESS))
    def test_a_decoder_cannot_act_as_another_kind(self, caller):
        own = DECODER_ACCESS[caller].decoder_kind
        for kind in {"voice", "aprs", "ais", "stub"} - {own}:
            assert not may_decode(caller, kind)

    @pytest.mark.parametrize("caller", list(SERVICE_ACCESS))
    def test_no_service_acts_as_a_decoder_not_even_core(self, caller):
        assert not may_decode(caller, "stub")

    def test_an_unknown_caller_is_no_decoder(self):
        assert not may_decode("weather", "weather")


def test_the_table_lookup_is_by_exact_name():
    assert service_access._access("Sea") is None
