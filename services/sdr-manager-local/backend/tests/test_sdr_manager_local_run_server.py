"""Tests for `run_server.py`: bind from settings, and a clear exit when the port is taken.

With host networking, port 8000 being taken by another app on the machine is
the likeliest first-run failure, so it must say so in plain words rather than
as a uvicorn traceback.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_run_server.py
"""

from __future__ import annotations

import errno
import runpy
import socket
from collections.abc import Iterator
from typing import Any

import pytest

from sentinel_sdr_manager_local import run_server
from sentinel_sdr_manager_local.config import get_settings
from sentinel_sdr_manager_local.logging_config import SDR_MANAGER_LOCAL_LOGGING_CONFIG


@pytest.fixture
def listening_port() -> Iterator[int]:
    """A loopback port something is already listening on."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        yield listener.getsockname()[1]


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


class TestPortIsFree:
    def test_a_free_port_is_free(self) -> None:
        assert run_server.port_is_free("127.0.0.1", _free_port()) is True

    def test_a_listening_port_is_taken(self, listening_port: int) -> None:
        assert run_server.port_is_free("127.0.0.1", listening_port) is False

    def test_an_ipv6_host_is_probed_over_ipv6(self) -> None:
        if not socket.has_ipv6:
            pytest.skip("no IPv6 on this host")
        try:
            assert run_server.port_is_free("::1", 0) is True
        except OSError as error:  # IPv6 compiled in but no loopback address configured
            pytest.skip(f"no IPv6 loopback: {error}")

    def test_any_other_bind_failure_is_raised_not_hidden(self, monkeypatch: pytest.MonkeyPatch) -> None:
        class RefusingSocket(socket.socket):
            def bind(self, _address: Any) -> None:
                raise OSError(errno.EACCES, "Permission denied")

        monkeypatch.setattr(run_server.socket, "socket", RefusingSocket)

        with pytest.raises(OSError) as raised:
            run_server.port_is_free("0.0.0.0", 80)
        assert raised.value.errno == errno.EACCES


class TestMain:
    def test_starts_uvicorn_bound_and_logged_per_settings(self, monkeypatch: pytest.MonkeyPatch) -> None:
        port = _free_port()
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_HOST", "127.0.0.1")
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_PORT", str(port))
        monkeypatch.setenv("SDR_MANAGER_LOCAL_LOG_LEVEL", "WARNING")
        get_settings.cache_clear()
        started: list[tuple[str, dict[str, Any]]] = []
        monkeypatch.setattr(run_server.uvicorn, "run", lambda target, **options: started.append((target, options)))

        run_server.main()

        assert started == [
            (
                "sentinel_sdr_manager_local.service:app",
                {
                    "host": "127.0.0.1",
                    "port": port,
                    "log_config": SDR_MANAGER_LOCAL_LOGGING_CONFIG,
                    "log_level": "warning",
                },
            )
        ]

    def test_exits_with_a_plain_message_when_the_port_is_taken(
        self, monkeypatch: pytest.MonkeyPatch, listening_port: int
    ) -> None:
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_HOST", "127.0.0.1")
        monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_PORT", str(listening_port))
        get_settings.cache_clear()

        def must_not_start(*_args: Any, **_kwargs: Any) -> None:
            raise AssertionError("uvicorn started on a taken port")

        monkeypatch.setattr(run_server.uvicorn, "run", must_not_start)

        with pytest.raises(SystemExit) as exited:
            run_server.main()

        message = str(exited.value.code)
        assert f"port {listening_port} on 127.0.0.1 is already in use" in message
        assert "SDR_MANAGER_LOCAL_HTTP_PORT" in message


def test_runs_as_a_module(monkeypatch: pytest.MonkeyPatch) -> None:
    started: list[str] = []
    monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_HOST", "127.0.0.1")
    monkeypatch.setenv("SDR_MANAGER_LOCAL_HTTP_PORT", str(_free_port()))
    get_settings.cache_clear()
    monkeypatch.setattr("uvicorn.run", lambda target, **_options: started.append(target))

    runpy.run_path(run_server.__file__, run_name="__main__")

    assert started == ["sentinel_sdr_manager_local.service:app"]
