"""Tests for backend.services.sdr.reachability_status.

The probe backs the Settings device dot and the SDR panel's radio dropdown. It is
a direct TCP connection to the configured host:port (so it works for LAN/localhost
radios with no internet) that validates the rtl_tcp ``RTL0`` dongle header before
declaring a radio reachable — a bare open port must NOT read as online.
"""

import asyncio
import socket

from backend.services import sdr as sdr_svc


async def _serve_once(payload: bytes) -> tuple[asyncio.AbstractServer, int]:
    """Start a throwaway TCP server that writes ``payload`` to the first client."""

    async def handle(
        reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        if payload:
            writer.write(payload)
            await writer.drain()
        # Keep the connection briefly so the client can read before EOF.
        await asyncio.sleep(0.05)
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    return server, port


async def test_reachable_when_rtl_tcp_header_present():
    # 12-byte header: "RTL0" magic + tuner type + gain count.
    server, port = await _serve_once(
        b"RTL0" + b"\x00\x00\x00\x05" + b"\x00\x00\x00\x1d"
    )
    try:
        result = await sdr_svc.reachability_status("127.0.0.1", port)
    finally:
        server.close()
        await server.wait_closed()
    assert result == {"connected": True, "reachable": True}


async def test_not_reachable_when_header_magic_is_wrong():
    # An open port that is not rtl_tcp (sends 12 bytes of the wrong magic).
    server, port = await _serve_once(b"HTTP/1.1 200" + b"\x00\x00")
    try:
        result = await sdr_svc.reachability_status("127.0.0.1", port)
    finally:
        server.close()
        await server.wait_closed()
    assert result == {"connected": False}


async def test_not_reachable_when_port_open_but_silent():
    # Accepts the connection but sends nothing → readexactly fails → offline.
    server, port = await _serve_once(b"")
    try:
        result = await sdr_svc.reachability_status("127.0.0.1", port, timeout=0.3)
    finally:
        server.close()
        await server.wait_closed()
    assert result == {"connected": False}


async def test_not_reachable_when_connection_refused():
    # Nothing listening on this port → connect raises → offline. Bind then release
    # a port so it is almost certainly free and refusing.
    probe_server, port = await _serve_once(b"")
    probe_server.close()
    await probe_server.wait_closed()
    result = await sdr_svc.reachability_status("127.0.0.1", port, timeout=0.3)
    assert result == {"connected": False}


async def test_enable_tcp_keepalive_sets_socket_option():
    # A real connected socket pair: the helper must flip SO_KEEPALIVE on so the OS
    # detects a rebooted/unplugged radio quickly instead of blocking the read.
    server, port = await _serve_once(b"")
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        sdr_svc._enable_tcp_keepalive(writer)
        sock = writer.get_extra_info("socket")
        # Enabled = any non-zero (Linux reports 1; macOS reports a different
        # non-zero flag value), so assert "on" rather than an exact value.
        assert sock.getsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE) != 0
        writer.close()
        await writer.wait_closed()
    finally:
        server.close()
        await server.wait_closed()


async def test_enable_tcp_keepalive_tolerates_missing_socket():
    # Defensive: a writer without an underlying socket must not raise.
    class _NoSocketWriter:
        def get_extra_info(self, _name: str) -> None:
            return None

    sdr_svc._enable_tcp_keepalive(_NoSocketWriter())  # type: ignore[arg-type]


async def test_live_broadcaster_fast_path_skips_probe(monkeypatch):
    # When a stream is already running, return its rich state without probing.
    rich = {
        "connected": True,
        "center_hz": 100_000_000,
        "sample_rate": 2_048_000,
        "gain_db": 30,
        "gain_auto": False,
        "mode": "AM",
    }
    monkeypatch.setattr(sdr_svc, "connection_status", lambda host, port: rich)
    result = await sdr_svc.reachability_status("10.0.0.1", 1234)
    assert result == rich


# ── Probe back-off: cache successes, retry a single failure ─────────────────────
#
# The Settings device list polls this every few seconds per radio, and each probe
# is itself a single-client rtl_tcp connection — so an over-eager probe steals an
# active stream (its own or a second instance's) and flaps the dot red. A success
# is cached briefly; a one-off failure is retried once before declaring offline.


async def test_successful_probe_is_cached(monkeypatch):
    sdr_svc._reachability_cache.clear()
    monkeypatch.setattr(
        sdr_svc, "connection_status", lambda host, port: {"connected": False}
    )
    probe_calls = {"count": 0}

    async def fake_probe(host: str, port: int, timeout: float) -> dict:
        probe_calls["count"] += 1
        return {"connected": True, "reachable": True}

    monkeypatch.setattr(sdr_svc, "_probe_rtl_tcp", fake_probe)

    first = await sdr_svc.reachability_status("10.9.9.9", 1234)
    second = await sdr_svc.reachability_status("10.9.9.9", 1234)

    assert first == {"connected": True, "reachable": True}
    assert second == first
    assert (
        probe_calls["count"] == 1
    )  # the second call is served from cache, not re-probed


async def test_failed_probe_is_retried_once_and_not_cached(monkeypatch):
    sdr_svc._reachability_cache.clear()
    monkeypatch.setattr(
        sdr_svc, "connection_status", lambda host, port: {"connected": False}
    )
    monkeypatch.setattr(sdr_svc, "REACHABILITY_RETRY_DELAY_S", 0.0)
    probe_calls = {"count": 0}

    async def fake_probe(host: str, port: int, timeout: float) -> dict:
        probe_calls["count"] += 1
        return {"connected": False}

    monkeypatch.setattr(sdr_svc, "_probe_rtl_tcp", fake_probe)

    result = await sdr_svc.reachability_status("10.9.9.8", 1234)

    assert result == {"connected": False}
    assert (
        probe_calls["count"] == 2
    )  # probed, then retried once before reporting offline
    assert (
        "10.9.9.8:1234" not in sdr_svc._reachability_cache
    )  # failures are never cached


async def test_transient_failure_recovers_on_retry_and_is_cached(monkeypatch):
    sdr_svc._reachability_cache.clear()
    monkeypatch.setattr(
        sdr_svc, "connection_status", lambda host, port: {"connected": False}
    )
    monkeypatch.setattr(sdr_svc, "REACHABILITY_RETRY_DELAY_S", 0.0)
    outcomes = [{"connected": False}, {"connected": True, "reachable": True}]
    probe_calls = {"count": 0}

    async def fake_probe(host: str, port: int, timeout: float) -> dict:
        outcome = outcomes[probe_calls["count"]]
        probe_calls["count"] += 1
        return outcome

    monkeypatch.setattr(sdr_svc, "_probe_rtl_tcp", fake_probe)

    result = await sdr_svc.reachability_status("10.9.9.7", 1234)

    # A transient collision (another client briefly holding the dongle) is masked
    # by the retry, so the dot does not flap red.
    assert result == {"connected": True, "reachable": True}
    assert probe_calls["count"] == 2
    assert "10.9.9.7:1234" in sdr_svc._reachability_cache


async def test_expired_cache_entry_is_reprobed(monkeypatch):
    sdr_svc._reachability_cache.clear()
    monkeypatch.setattr(
        sdr_svc, "connection_status", lambda host, port: {"connected": False}
    )
    monkeypatch.setattr(sdr_svc, "REACHABILITY_CACHE_TTL_S", 0.0)
    probe_calls = {"count": 0}

    async def fake_probe(host: str, port: int, timeout: float) -> dict:
        probe_calls["count"] += 1
        return {"connected": True, "reachable": True}

    monkeypatch.setattr(sdr_svc, "_probe_rtl_tcp", fake_probe)

    await sdr_svc.reachability_status("10.9.9.6", 1234)
    await sdr_svc.reachability_status("10.9.9.6", 1234)

    assert (
        probe_calls["count"] == 2
    )  # TTL of 0 ⇒ cached entry is always stale ⇒ re-probe
