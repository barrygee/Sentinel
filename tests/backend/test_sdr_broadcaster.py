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
