"""The request guard's address lists: `$name` tokens resolved from GUARD_* settings.

Run with:  uv run --project backend pytest tests/backend/test_request_guard_networks.py
"""

from __future__ import annotations

import ipaddress

import pytest

from backend.platform.security.networks import (
    LOOPBACK_NETWORKS,
    NETWORK_TOKENS,
    address_in,
    expand_network_tokens,
    parse_networks,
    split_setting,
)
from tests.backend.request_guard_helpers import pin_guard_settings


@pytest.fixture(autouse=True)
def _known_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    pin_guard_settings(monkeypatch)


class TestSplitSetting:
    def test_drops_blanks_and_surrounding_spaces(self) -> None:
        assert split_setting(" 10.0.0.0/8 , ,192.168.1.5,") == [
            "10.0.0.0/8",
            "192.168.1.5",
        ]

    def test_an_empty_setting_is_an_empty_list(self) -> None:
        assert split_setting("") == []


class TestExpandNetworkTokens:
    def test_replaces_each_token_with_its_settings_addresses(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_service_hosts="192.168.1.20, 192.168.1.21")

        assert expand_network_tokens(["$service_hosts", "10.9.9.9"]) == [
            "192.168.1.20",
            "192.168.1.21",
            "10.9.9.9",
        ]

    def test_loopback_is_fixed(self) -> None:
        assert expand_network_tokens(["$loopback"]) == list(LOOPBACK_NETWORKS)

    def test_drops_duplicates_keeping_the_first(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_internal_networks="127.0.0.0/8")

        assert expand_network_tokens(["$loopback", "$internal_networks"]) == list(LOOPBACK_NETWORKS)

    def test_reads_settings_when_called_not_when_imported(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_decoder_hosts="10.0.0.7")
        first = expand_network_tokens(["$decoder_hosts"])
        pin_guard_settings(monkeypatch, guard_decoder_hosts="10.0.0.8")

        assert (first, expand_network_tokens(["$decoder_hosts"])) == (
            ["10.0.0.7"],
            ["10.0.0.8"],
        )

    def test_an_unknown_token_is_a_policy_error(self) -> None:
        with pytest.raises(ValueError, match=r"unknown network token '\$clients'"):
            expand_network_tokens(["$clients"])

    def test_every_token_resolves(self) -> None:
        for token in NETWORK_TOKENS:
            assert isinstance(expand_network_tokens([token]), list)


class TestTokenFallbacks:
    def test_peer_networks_default_to_the_client_networks(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_peer_networks="", guard_client_networks="10.0.0.0/8")

        assert expand_network_tokens(["$peer_networks"]) == ["10.0.0.0/8"]

    def test_peer_networks_when_set_replace_the_client_networks(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(
            monkeypatch,
            guard_peer_networks="192.168.7.0/24",
            guard_client_networks="10.0.0.0/8",
        )

        assert expand_network_tokens(["$peer_networks"]) == ["192.168.7.0/24"]

    def test_exempt_ips_default_to_sentinels_own_network(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(monkeypatch, guard_exempt_ips="", guard_internal_networks="172.28.0.0/24")

        assert expand_network_tokens(["$exempt_ips"]) == ["172.28.0.0/24"]

    def test_exempt_ips_when_set_replace_the_internal_networks(self, monkeypatch: pytest.MonkeyPatch) -> None:
        pin_guard_settings(
            monkeypatch,
            guard_exempt_ips="10.1.1.1",
            guard_internal_networks="172.28.0.0/24",
        )

        assert expand_network_tokens(["$exempt_ips"]) == ["10.1.1.1"]


class TestParseNetworks:
    def test_a_bare_address_is_a_single_host_network(self) -> None:
        assert parse_networks(["192.168.1.5", "::1"]) == (
            ipaddress.ip_network("192.168.1.5/32"),
            ipaddress.ip_network("::1/128"),
        )

    def test_host_bits_in_a_cidr_are_tolerated(self) -> None:
        assert parse_networks(["192.168.1.5/24"]) == (ipaddress.ip_network("192.168.1.0/24"),)

    def test_names_the_entry_that_isnt_an_address(self) -> None:
        with pytest.raises(ValueError, match="not an IP address or network: 'sentinel.lan'"):
            parse_networks(["10.0.0.0/8", "sentinel.lan"])


class TestAddressIn:
    networks = parse_networks(["192.168.1.0/24", "fd00::/8"])

    @pytest.mark.parametrize("address", ["192.168.1.1", "192.168.1.255", "fd00::1"])
    def test_inside(self, address: str) -> None:
        assert address_in(address, self.networks)

    @pytest.mark.parametrize("address", ["192.168.2.1", "10.0.0.1", "fe80::1"])
    def test_outside(self, address: str) -> None:
        assert not address_in(address, self.networks)

    @pytest.mark.parametrize("address", ["testclient", "", "unknown", "192.168.1"])
    def test_anything_that_isnt_an_address_is_outside(self, address: str) -> None:
        assert not address_in(address, self.networks)

    def test_an_ipv4_mapped_address_matches_as_ipv4(self) -> None:
        assert address_in("::ffff:192.168.1.9", self.networks)

    def test_an_ipv4_mapped_address_outside_stays_outside(self) -> None:
        assert not address_in("::ffff:10.0.0.1", self.networks)

    def test_no_networks_admits_nobody(self) -> None:
        assert not address_in("192.168.1.1", ())
