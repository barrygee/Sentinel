"""Tests for backend.services.sdr.RadioBroadcaster read-loop disconnect handling.

Regression: a radio reboot/unplug closes the rtl_tcp stream, which surfaces as an
``IncompleteReadError`` (EOF) from ``readexactly``. That was skipped as a transient
"retune" blip, so the loop span forever on repeated EOF and ``conn.connected`` was
never cleared — leaving the Settings/SDR status dot green for an offline radio.
"""

import asyncio

from backend.services import sdr as sdr_svc


class _EofReader:
    """A StreamReader stand-in whose stream has closed (permanent EOF)."""

    def at_eof(self) -> bool:
        return True

    async def readexactly(self, num_bytes: int) -> bytes:
        raise asyncio.IncompleteReadError(partial=b"", expected=num_bytes)


class _RecordingWriter:
    """A StreamWriter stand-in that records whether it was closed."""

    def __init__(self) -> None:
        self.closed = False

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


class _PartialThenDataReader:
    """Raises a non-EOF IncompleteReadError once, then streams data forever."""

    def __init__(self) -> None:
        self._raised = False

    def at_eof(self) -> bool:
        return False

    async def readexactly(self, num_bytes: int) -> bytes:
        if not self._raised:
            self._raised = True
            raise asyncio.IncompleteReadError(partial=b"", expected=num_bytes)
        return b"\x00" * num_bytes


class _DataReader:
    """A StreamReader stand-in that streams zero-valued IQ samples forever."""

    def at_eof(self) -> bool:
        return False

    async def readexactly(self, num_bytes: int) -> bytes:
        await asyncio.sleep(0)  # yield so a streaming loop never monopolises the loop
        return b"\x00" * num_bytes


async def test_broadcaster_marks_disconnected_and_closes_socket_when_stream_closes():
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    conn.reader = _EofReader()  # type: ignore[assignment]
    writer = _RecordingWriter()
    conn.writer = writer  # type: ignore[assignment]
    broadcaster = sdr_svc.RadioBroadcaster(conn)

    # Must return promptly; before the fix this looped forever on EOF and hung.
    await asyncio.wait_for(broadcaster._run(), timeout=2.0)

    assert conn.connected is False
    # The socket must be closed so single-client rtl_tcp frees its slot and the
    # next reconnect is accepted — otherwise the dot never recovers to green.
    assert writer.closed is True
    assert conn.writer is None


async def test_broadcaster_skips_a_non_eof_partial_read_and_keeps_running():
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    conn.reader = _PartialThenDataReader()  # type: ignore[assignment]
    broadcaster = sdr_svc.RadioBroadcaster(conn)

    run_task = asyncio.create_task(broadcaster._run())
    # A non-EOF partial read is skipped (continue), so the loop keeps running and
    # the connection stays up; cancel after it has had time to recover and stream.
    await asyncio.sleep(0.05)
    assert conn.connected is True
    assert not run_task.done()

    # _run swallows CancelledError internally, so the task finishes cleanly.
    run_task.cancel()
    await run_task


# ── Auto-reconnect after a drop ─────────────────────────────────────────────────
#
# A single-client rtl_tcp dongle shared by two Sentinel instances (or briefly
# stolen by a Settings reachability probe) drops the active reader. The broadcaster
# must recover the stream for clients that still want it instead of dying — which
# previously left the status dot stuck red until a manual reconnect.


async def test_reconnect_returns_false_and_releases_socket_when_no_subscribers():
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    conn.reader = _EofReader()  # type: ignore[assignment]
    writer = _RecordingWriter()
    conn.writer = writer  # type: ignore[assignment]
    broadcaster = sdr_svc.RadioBroadcaster(conn)

    # Nobody is watching, so there is nothing to reconnect for: disconnect and bail
    # so the dongle is freed for the other instance.
    result = await broadcaster._reconnect()

    assert result is False
    assert conn.connected is False
    assert writer.closed is True


async def test_reconnect_succeeds_and_notifies_subscribers_when_clients_present():
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    connect_calls = {"count": 0}

    async def fake_connect() -> None:
        connect_calls["count"] += 1
        conn.connected = True

    async def fake_disconnect() -> None:
        conn.connected = False

    conn.connect = fake_connect  # type: ignore[method-assign]
    conn.disconnect = fake_disconnect  # type: ignore[method-assign]
    broadcaster = sdr_svc.RadioBroadcaster(conn)
    queue = broadcaster.subscribe()

    result = await broadcaster._reconnect()

    assert result is True
    assert connect_calls["count"] == 1
    # The drop is announced as a "status" frame, NOT an "error" frame — an error
    # frame would make the WS handler close the socket and drop this subscriber,
    # defeating the in-place reconnect.
    assert queue.get_nowait() == {
        "type": "status",
        "connected": False,
        "reconnecting": True,
    }


async def test_reconnect_retries_with_backoff_until_connect_succeeds(monkeypatch):
    monkeypatch.setattr(sdr_svc, "RECONNECT_BACKOFF_START_S", 0.0)
    monkeypatch.setattr(sdr_svc, "RECONNECT_BACKOFF_MAX_S", 0.0)
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    connect_calls = {"count": 0}

    async def flaky_connect() -> None:
        connect_calls["count"] += 1
        if connect_calls["count"] < 3:
            raise ConnectionError("dongle busy")
        conn.connected = True

    async def fake_disconnect() -> None:
        conn.connected = False

    conn.connect = flaky_connect  # type: ignore[method-assign]
    conn.disconnect = fake_disconnect  # type: ignore[method-assign]
    broadcaster = sdr_svc.RadioBroadcaster(conn)
    broadcaster.subscribe()

    result = await asyncio.wait_for(broadcaster._reconnect(), timeout=2.0)

    assert result is True
    assert connect_calls["count"] == 3  # failed twice, then connected on the third try


async def test_reconnect_gives_up_when_last_subscriber_leaves_mid_retry(monkeypatch):
    monkeypatch.setattr(sdr_svc, "RECONNECT_BACKOFF_START_S", 0.0)
    monkeypatch.setattr(sdr_svc, "RECONNECT_BACKOFF_MAX_S", 0.0)
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    connect_calls = {"count": 0}

    async def fake_disconnect() -> None:
        conn.connected = False

    broadcaster = sdr_svc.RadioBroadcaster(conn)
    queue = broadcaster.subscribe()

    async def failing_connect() -> None:
        connect_calls["count"] += 1
        # The client gives up (closes its WebSocket) during the retry loop.
        broadcaster.unsubscribe(queue)
        raise ConnectionError("still busy")

    conn.connect = failing_connect  # type: ignore[method-assign]
    conn.disconnect = fake_disconnect  # type: ignore[method-assign]

    result = await asyncio.wait_for(broadcaster._reconnect(), timeout=2.0)

    assert result is False  # no subscribers remain ⇒ stop reconnecting
    assert connect_calls["count"] == 1


async def test_run_reconnects_and_resumes_streaming_for_subscribers():
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    conn.reader = _EofReader()  # type: ignore[assignment]  # first read hits EOF (stolen)
    conn.writer = _RecordingWriter()  # type: ignore[assignment]

    async def reconnect_with_data() -> None:
        conn.reader = _DataReader()  # type: ignore[assignment]
        conn.connected = True

    conn.connect = reconnect_with_data  # type: ignore[method-assign]
    broadcaster = sdr_svc.RadioBroadcaster(conn)
    queue = broadcaster.subscribe()
    run_task = asyncio.create_task(broadcaster._run())

    frames: list[dict] = []

    async def collect_until_spectrum() -> None:
        while True:
            frame = await queue.get()
            frames.append(frame)
            if frame.get("type") == "spectrum":
                return

    try:
        await asyncio.wait_for(collect_until_spectrum(), timeout=2.0)
    finally:
        run_task.cancel()
        await run_task

    # The drop was announced as a recovering status frame, then streaming resumed.
    assert any(f.get("type") == "status" and f.get("reconnecting") for f in frames)
    assert frames[-1]["type"] == "spectrum"


# ── Idle release ────────────────────────────────────────────────────────────────
#
# rtl_tcp serves ONE client at a time. Holding the socket open after the last
# viewer leaves would lock a second instance (or a reachability probe) out of the
# same dongle, so the loop releases it once idle past the grace period.


async def test_run_releases_idle_dongle_after_grace(monkeypatch):
    monkeypatch.setattr(sdr_svc, "IDLE_RELEASE_GRACE_S", 0.0)
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    conn.reader = _DataReader()  # type: ignore[assignment]
    writer = _RecordingWriter()
    conn.writer = writer  # type: ignore[assignment]
    broadcaster = sdr_svc.RadioBroadcaster(conn)

    # No subscribers ever: the loop must release the connection rather than stream
    # to nobody and hold the single-client slot.
    await asyncio.wait_for(broadcaster._run(), timeout=2.0)

    assert conn.connected is False
    assert writer.closed is True


async def test_run_keeps_streaming_while_a_subscriber_is_present(monkeypatch):
    # Even with a zero grace period, an active subscriber must keep the connection
    # open and keep producing spectrum frames — idle release must not fire.
    monkeypatch.setattr(sdr_svc, "IDLE_RELEASE_GRACE_S", 0.0)
    conn = sdr_svc.RtlTcpConnection(host="10.0.0.9", port=1234)
    conn.connected = True
    conn.reader = _DataReader()  # type: ignore[assignment]
    conn.writer = _RecordingWriter()  # type: ignore[assignment]
    broadcaster = sdr_svc.RadioBroadcaster(conn)
    queue = broadcaster.subscribe()
    run_task = asyncio.create_task(broadcaster._run())

    try:
        frame = await asyncio.wait_for(queue.get(), timeout=2.0)
        assert frame["type"] == "spectrum"
        assert conn.connected is True
        assert not run_task.done()
    finally:
        run_task.cancel()
        await run_task
