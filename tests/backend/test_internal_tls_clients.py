"""Every HTTP client that calls another Sentinel process trusts the deployment CA (P7.5).

Across hosts these calls are HTTPS to certificates the deployment CA issued,
so each must pass `internal_verify()` as httpx's `verify`. A call site that
forgets it works on one host and fails on two, so each one is pinned here.
"""

from pathlib import Path

import pytest

from backend.core import service_registry
from backend.platform import settings_client
from backend.platform.sdk import registration
from backend.services import sdr_iq_capture_transfer
from tests.backend.service_credentials_test_helpers import present_credential
from tests.backend.test_platform_sdk_registration import make_manifest

TRUST = object()
"""Stands in for the SSL context internal_verify() would build."""


class _Opened(Exception):
    """Raised as the client opens: the test only needs its arguments."""


def _recording_client(opened: list[dict]):
    class RecordingClient:
        def __init__(self, **options):
            opened.append(options)

        async def __aenter__(self):
            raise _Opened

        async def __aexit__(self, *exc_info):
            return False

    return RecordingClient


@pytest.fixture
def opened(monkeypatch) -> list[dict]:
    clients: list[dict] = []
    for module in (settings_client, registration, service_registry, sdr_iq_capture_transfer):
        monkeypatch.setattr(module, "internal_verify", lambda: TRUST)
        monkeypatch.setattr(module.httpx, "AsyncClient", _recording_client(clients))
    return clients


async def test_the_settings_client(opened):
    with pytest.raises(_Opened):
        await settings_client._core_request("GET", "https://core.lan:8443/api/settings/app")
    assert opened[0]["verify"] is TRUST


async def test_service_registration(opened):
    with pytest.raises(_Opened):
        await registration.ServiceRegistrar(make_manifest())._run()
    assert opened[0]["verify"] is TRUST


async def test_cores_health_probes(opened):
    with pytest.raises(_Opened):
        await service_registry.ServiceRegistry()._probe_loop()
    assert opened[0]["verify"] is TRUST


async def test_the_iq_capture_copy(opened, monkeypatch, tmp_path: Path):
    present_credential(monkeypatch, tmp_path, "sdr")
    with pytest.raises(_Opened):
        await sdr_iq_capture_transfer.fetch_iq_capture(
            "https://radio.lan:8443/internal/radio-hub/iq-captures/1", tmp_path / "1.u8"
        )
    assert opened[0]["verify"] is TRUST
