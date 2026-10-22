"""Fixtures for the SDR Manager API contract suite (ADR 0007).

The suite runs the real `SdrManagerClient` (sdr-manager-remote's side of the
API) against the real sdr-manager-local app in fake-hardware mode — two
simulated RTL-SDRs, no dongle — so a change on either side that breaks the
other fails here, not on a Pi.

The client opens a fresh `httpx.AsyncClient` per request, so the fixture
routes every one of them into the app in process (`httpx.ASGITransport`)
rather than over a socket. The app runs its real lifespan: schema, seeding,
the device supervisor and both API mounts.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
from backend import database as core_database
from backend.config import settings as backend_settings
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Connection refused at once: port 9 (discard) has no listener on a test host,
# so the service's location refresh and registration fail fast.
UNREACHABLE_CORE_URL = "http://127.0.0.1:9"
HOST_ADDRESS = "sdr-manager-local"
HOST_PORT = 8000
CONSOLE_PASSWORD = "contract-suite-password"


@dataclass
class RunningHost:
    """The running sdr-manager-local and every request that reached it, in order."""

    app: FastAPI
    requests: list[httpx.Request] = field(default_factory=list)

    def paths(self, method: str | None = None) -> list[str]:
        """The path of every request so far, optionally only those with `method`."""
        return [
            request.url.path
            for request in self.requests
            if method is None or request.method == method
        ]


class RecordingTransport(httpx.ASGITransport):
    """An in-process transport into the app that also records each request it carries."""

    def __init__(self, host: RunningHost) -> None:
        super().__init__(app=host.app)
        self._host = host

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self._host.requests.append(request)
        return await super().handle_async_request(request)


@pytest.fixture
async def sdr_manager_local(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[RunningHost]:
    """A running sdr-manager-local on simulated hardware, with every SDR Manager API call routed into it."""
    from sentinel_sdr_manager_local.config import get_settings

    engine = create_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'sdr-manager-local.db'}"
    )
    monkeypatch.setattr(core_database, "engine", engine)
    monkeypatch.setattr(
        core_database,
        "AsyncSessionLocal",
        async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False),
    )
    empty_sysfs = tmp_path / "sysfs"
    empty_sysfs.mkdir()
    monkeypatch.setenv("SDR_MANAGER_LOCAL_SYSFS_ROOT", str(empty_sysfs))
    monkeypatch.setenv("SDR_MANAGER_LOCAL_HARDWARE", "fake")
    get_settings.cache_clear()
    monkeypatch.setattr(backend_settings, "sentinel_core_url", UNREACHABLE_CORE_URL)
    monkeypatch.setattr(
        backend_settings, "service_internal_url", f"http://{HOST_ADDRESS}:{HOST_PORT}"
    )
    monkeypatch.setattr(backend_settings, "nats_url", "")

    from sentinel_sdr_manager_local.service import create_sdr_manager_local_app

    app = create_sdr_manager_local_app()
    host = RunningHost(app=app)
    transport = RecordingTransport(host)
    original_init = httpx.AsyncClient.__init__

    def into_the_app(self: httpx.AsyncClient, *args: Any, **kwargs: Any) -> None:
        kwargs["transport"] = transport
        original_init(self, *args, **kwargs)

    async with app.router.lifespan_context(app):
        monkeypatch.setattr(httpx.AsyncClient, "__init__", into_the_app)
        try:
            yield host
        finally:
            monkeypatch.setattr(httpx.AsyncClient, "__init__", original_init)
    await engine.dispose()
    get_settings.cache_clear()
