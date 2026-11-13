"""The web page over HTTPS under compose: the gateway publishes it, the certificate names it.

The gateway's `sentinel_https` server listens on :8444 (gateway/caddy.json);
compose must publish it (SENTINEL_HTTPS_PORT), hand service-credentials the
addresses browsers use (SENTINEL_WEB_HOSTNAMES, for the certificate), and tell
core the port (WEB_HTTPS_PORT, for the settings card's link). Lite mode's
gateway extends this one, so it gets the same.
"""

from __future__ import annotations

from tests.backend.test_compose_hardening import compose_services


def test_the_gateway_publishes_the_https_page_on_its_own_port():
    ports = compose_services("docker-compose.yml")["gateway"]["ports"]

    assert "${SENTINEL_HTTPS_PORT:-8444}:8444" in ports
    # The plain page stays, and the service entrypoint stays on this machine only.
    assert "8080:8080" in ports
    assert "${SENTINEL_SERVICE_ENTRYPOINT_ADDRESS:-127.0.0.1:8443}:8443" in ports


def test_service_credentials_is_told_the_addresses_browsers_open_it_by():
    environment = compose_services("docker-compose.yml")["service-credentials"][
        "environment"
    ]

    assert environment["SENTINEL_WEB_HOSTNAMES"] == "${SENTINEL_WEB_HOSTNAMES:-}"


def test_core_is_told_the_port_for_the_settings_cards_link():
    environment = compose_services("docker-compose.yml")["app"]["environment"]

    assert environment["WEB_HTTPS_PORT"] == "${SENTINEL_HTTPS_PORT:-8444}"


def test_lite_mode_runs_the_same_gateway():
    assert compose_services("compose.sdr-manager-local-only.yaml")["gateway"][
        "extends"
    ] == {
        "file": "docker-compose.yml",
        "service": "gateway",
    }
