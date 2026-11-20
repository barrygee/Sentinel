"""`this_machine_connect_address` — the address the maps show for this machine.

It is read from `SENTINEL_WEB_HOSTNAMES`, the operator's list of the names and
addresses other machines reach this one by.
"""

from __future__ import annotations

import pytest

from sentinel_sdr_manager_remote.services.this_machine_address import (
    WEB_HOSTNAMES_VARIABLE,
    this_machine_connect_address,
)


@pytest.mark.parametrize(
    ("configured", "expected"),
    [
        # The common case: the LAN address first, then the mDNS name.
        ("192.168.1.99,my-mac.local", "192.168.1.99"),
        # An address is preferred over a name, wherever it sits in the list.
        ("my-mac.local,192.168.1.99", "192.168.1.99"),
        # The first of several addresses.
        ("192.168.1.99,10.0.0.4", "192.168.1.99"),
        # Spaces around entries are ignored.
        ("  192.168.1.99 , my-mac.local ", "192.168.1.99"),
        # IPv6 counts as an address.
        ("my-mac.local,fd00::5", "fd00::5"),
        # Loopback reaches nothing from another machine, so a name wins over it.
        ("127.0.0.1,my-mac.local", "my-mac.local"),
        ("::1,192.168.1.99", "192.168.1.99"),
        # With no address at all, the first name.
        ("my-mac.local,sentinel.lan", "my-mac.local"),
        # Empty entries from stray commas are skipped.
        (",,192.168.1.99,", "192.168.1.99"),
    ],
)
def test_picks_the_address_another_machine_would_dial(monkeypatch, configured, expected):
    monkeypatch.setenv(WEB_HOSTNAMES_VARIABLE, configured)

    assert this_machine_connect_address() == expected


@pytest.mark.parametrize(
    "configured",
    [
        "",
        " , ,",
        # Only loopback: nothing another machine could use.
        "127.0.0.1",
        "127.0.0.1,::1",
    ],
)
def test_none_when_nothing_usable_is_configured(monkeypatch, configured):
    monkeypatch.setenv(WEB_HOSTNAMES_VARIABLE, configured)

    assert this_machine_connect_address() is None


def test_none_when_the_variable_is_unset(monkeypatch):
    monkeypatch.delenv(WEB_HOSTNAMES_VARIABLE, raising=False)

    assert this_machine_connect_address() is None


def test_follows_the_environment_rather_than_caching_it(monkeypatch):
    monkeypatch.setenv(WEB_HOSTNAMES_VARIABLE, "192.168.1.99")
    assert this_machine_connect_address() == "192.168.1.99"

    monkeypatch.setenv(WEB_HOSTNAMES_VARIABLE, "10.0.0.4")
    assert this_machine_connect_address() == "10.0.0.4"
