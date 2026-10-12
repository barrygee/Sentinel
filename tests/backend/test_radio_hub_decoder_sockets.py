"""
tests/backend/test_radio_hub_decoder_sockets.py

Tests for where the radio hub tells decoders to dial its PCM / voice-audio
sockets (backend/radio_hub/services/decoder_sockets.py, section-containers P7.2):
the host the hub is registered under — ``SERVICE_INTERNAL_URL`` for a hub in its
own container, ``core_internal_url`` for one inside the app.
"""

import pytest

from backend.config import settings
from backend.radio_hub.services import decoder_sockets


@pytest.fixture(autouse=True)
def _advertised_urls(monkeypatch):
    """Start every test from the in-app defaults; each test sets what it needs."""
    monkeypatch.setattr(settings, "service_internal_url", "")
    monkeypatch.setattr(settings, "core_internal_url", "http://app:8000")


class TestAdvertisedHubUrl:
    def test_a_hub_inside_the_app_is_reached_on_core(self):
        assert decoder_sockets.advertised_hub_url() == "http://app:8000"

    def test_a_hub_in_its_own_container_advertises_its_service_url(self, monkeypatch):
        monkeypatch.setattr(settings, "service_internal_url", "http://radio-hub:8000")
        assert decoder_sockets.advertised_hub_url() == "http://radio-hub:8000"


class TestAdvertisedHubHost:
    def test_a_hub_inside_the_app_is_reached_on_core(self):
        assert decoder_sockets.advertised_hub_host() == "app"

    def test_a_hub_in_its_own_container_advertises_its_service_url(self, monkeypatch):
        monkeypatch.setattr(settings, "service_internal_url", "http://radio-hub:8000")
        assert decoder_sockets.advertised_hub_host() == "radio-hub"

    @pytest.mark.parametrize(
        ("url", "host"),
        [
            ("http://10.0.0.7:8000/", "10.0.0.7"),
            ("https://Hub.Example:8443/base/path?x=1", "hub.example"),
            ("http://[fd00::7]:8000", "fd00::7"),
            ("http://user:secret@radio-hub:8000", "radio-hub"),
        ],
    )
    def test_only_the_host_is_kept(self, monkeypatch, url, host):
        # A port, path, query or userinfo in the URL is the HTTP side's business;
        # the socket port comes from the hub's own setting.
        monkeypatch.setattr(settings, "service_internal_url", url)
        assert decoder_sockets.advertised_hub_host() == host

    @pytest.mark.parametrize("url", ["radio-hub:8000", "not a url", "http://:8000"])
    def test_a_url_with_no_host_gives_a_blank_host(self, monkeypatch, url):
        # Decoders treat a blank host as "no socket named" and idle with a
        # message, rather than dialling something made up.
        monkeypatch.setattr(settings, "service_internal_url", url)
        assert decoder_sockets.advertised_hub_host() == ""


class TestSocketEndpoint:
    def test_pairs_the_advertised_host_with_the_port(self, monkeypatch):
        monkeypatch.setattr(settings, "service_internal_url", "http://radio-hub:8000")
        assert decoder_sockets.socket_endpoint(7357) == {
            "host": "radio-hub",
            "port": 7357,
        }

    def test_follows_the_setting_at_call_time(self, monkeypatch):
        # Read per reply, not cached at import: a test or a reconfigured
        # service must not get a stale host.
        assert decoder_sockets.socket_endpoint(7355)["host"] == "app"
        monkeypatch.setattr(settings, "service_internal_url", "http://radio-hub:8000")
        assert decoder_sockets.socket_endpoint(7355)["host"] == "radio-hub"
