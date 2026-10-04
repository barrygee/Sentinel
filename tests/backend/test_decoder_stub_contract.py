"""
tests/backend/test_decoder_stub_contract.py

The decoder contract, end to end, in CI — without mbelib or a radio
(section-containers plan §3.4 / P3).

The real app is served over HTTP by uvicorn; the dongle is a fake rtl_tcp server
streaming an FM tone; the decoder is the stub decoder's own supervisor
(decoder/stub/entrypoint.py) talking to the app exactly as its container does.
Nothing on the hub side is faked. Pinned, for both a relative mono kind and an
absolute stereo kind:
  * the stub registers itself and the hub lists it;
  * starting the kind on a radio makes the stub connect to the PCM feed, and its
    summaries of real demodulated PCM are published as decode.stub.<radioId>;
  * stopping the kind closes the feed and the session ends;
  * a hub that forgets the kind (a restart) answers config with 404 and the stub
    registers again by itself.
"""

from __future__ import annotations

import asyncio
import importlib.util
import socket
import sys
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

import httpx
import numpy as np
import pytest
import uvicorn

from backend.config import settings
from backend.main import app
from backend.platform.bus import bus
from backend.radio_hub.services import manifest_decode
from backend.radio_hub.services import sdr as sdr_svc

SECRET = "contract-secret"
RTL_SAMPLE_RATE = 1_024_000
IQ_CHUNK = 40_960
TONE_OFFSET_HZ = 25_000
REPORT_SECONDS = 0.25
_ENTRYPOINT_PATH = (
    Path(__file__).resolve().parents[2] / "decoder" / "stub" / "entrypoint.py"
)


def _load_stub():
    spec = importlib.util.spec_from_file_location(
        "stub_decoder_contract", _ENTRYPOINT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = (
        module  # @dataclass resolves annotations through sys.modules
    )
    spec.loader.exec_module(module)
    return module


stub = _load_stub()


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("0.0.0.0", 0))
        return probe.getsockname()[1]


def _wait_for(
    condition: Callable[[], object], timeout: float = 10.0, what: str = "condition"
) -> object:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = condition()
        if result:
            return result
        time.sleep(0.05)
    raise AssertionError(f"timed out waiting for {what}")


async def _fake_rtl_tcp(
    reader: asyncio.StreamReader, writer: asyncio.StreamWriter
) -> None:
    """rtl_tcp's 12-byte RTL0 header, then a 1 kHz-deviation FM tone, paced in real time.

    The tone sits TONE_OFFSET_HZ above whatever centre the hub tunes to, so it is
    always inside the span; commands from the hub are read and ignored.
    """
    writer.write(b"RTL0" + (5).to_bytes(4, "big") + (29).to_bytes(4, "big"))
    drain_commands = asyncio.create_task(_ignore_commands(reader))
    sample_index = 0
    try:
        while True:
            n = np.arange(sample_index, sample_index + IQ_CHUNK)
            sample_index += IQ_CHUNK
            phase = (
                2
                * np.pi
                * (
                    TONE_OFFSET_HZ * n / RTL_SAMPLE_RATE
                    + 0.5 * np.sin(2 * np.pi * 1_000 * n / RTL_SAMPLE_RATE)
                )
            )
            iq = np.empty(2 * IQ_CHUNK, dtype=np.uint8)
            iq[0::2] = np.clip(np.cos(phase) * 100 + 127.5, 0, 255)
            iq[1::2] = np.clip(np.sin(phase) * 100 + 127.5, 0, 255)
            writer.write(iq.tobytes())
            await writer.drain()
            await asyncio.sleep(IQ_CHUNK / RTL_SAMPLE_RATE)
    except (ConnectionError, OSError, asyncio.CancelledError):
        pass
    finally:
        drain_commands.cancel()


async def _ignore_commands(reader: asyncio.StreamReader) -> None:
    while await reader.read(5):
        pass


@dataclass
class LiveHub:
    """The app served over real HTTP, on a loop this test owns."""

    url: str
    loop: asyncio.AbstractEventLoop
    rtl_tcp_port: int

    def run(self, coroutine, timeout: float = 10.0):
        """Run a coroutine on the hub's loop (where its bridges and broadcasters live)."""
        return asyncio.run_coroutine_threadsafe(coroutine, self.loop).result(timeout)


@pytest.fixture()
def live_hub(client, monkeypatch) -> Iterator[LiveHub]:
    """`client` installs the in-memory test database on `app`; uvicorn then serves it."""
    monkeypatch.setattr(settings, "decoder_ingest_secret", SECRET)
    loop = asyncio.new_event_loop()
    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=0, lifespan="off", log_level="warning"
        )
    )
    thread = threading.Thread(
        target=loop.run_until_complete, args=(server.serve(),), daemon=True
    )
    thread.start()
    _wait_for(lambda: server.started, what="uvicorn to start")
    port = server.servers[0].sockets[0].getsockname()[1]
    rtl_tcp = asyncio.run_coroutine_threadsafe(
        asyncio.start_server(_fake_rtl_tcp, "127.0.0.1", 0), loop
    ).result(5)
    hub = LiveHub(
        url=f"http://127.0.0.1:{port}",
        loop=loop,
        rtl_tcp_port=rtl_tcp.sockets[0].getsockname()[1],
    )
    try:
        yield hub
    finally:
        hub.run(manifest_decode.shutdown_all())
        hub.run(sdr_svc.shutdown_all())
        rtl_tcp.close()
        server.should_exit = True
        thread.join(10)
        loop.close()
        for unsubscribers in manifest_decode._bus_unsubscribers.values():
            for unsubscribe in unsubscribers:
                unsubscribe()
        manifest_decode._bus_unsubscribers.clear()
        manifest_decode._manifests.clear()


class StubDecoder:
    """The stub decoder's supervisor loop, running in a thread as it would in its container."""

    def __init__(self, hub: LiveHub, channels_hz: tuple[int, ...]) -> None:
        self.config = stub.StubConfig(
            hub_url=hub.url,
            pcm_host="127.0.0.1",
            pcm_port=_free_port(),
            channels_hz=channels_hz,
            report_seconds=REPORT_SECONDS,
            poll_seconds=0.1,
        )
        self.registrations = 0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._supervise, daemon=True)

    def _supervise(self) -> None:
        hub_client = stub.HubClient(self.config.hub_url, SECRET)
        manifest = stub.build_manifest(self.config)
        registered = False
        while not self._stop.is_set():
            was_registered = registered
            registered = stub.supervise_once(
                hub_client, self.config, manifest, registered
            )
            if registered and not was_registered:
                self.registrations += 1
            self._stop.wait(self.config.poll_seconds)

    def __enter__(self) -> StubDecoder:
        self._thread.start()
        return self

    def __exit__(self, *exc_info) -> None:
        self._stop.set()
        self._thread.join(10)


@pytest.mark.parametrize(
    "channels_hz",
    [(), (161_975_000, 162_025_000)],
    ids=["relative-mono", "absolute-stereo"],
)
def test_the_stub_decoder_drives_the_whole_contract(live_hub, channels_hz):
    http = httpx.Client(base_url=live_hub.url, timeout=10)
    radio_id = http.post(
        "/api/sdr/radios",
        json={
            "name": "Fake dongle",
            "host": "127.0.0.1",
            "port": live_hub.rtl_tcp_port,
        },
    ).json()["id"]
    published: list[dict] = []

    async def _record(payload: dict) -> None:
        published.append(payload)

    unsubscribe = bus.subscribe(f"decode.stub.{radio_id}", _record)
    try:
        with StubDecoder(live_hub, channels_hz) as decoder:
            # 1. It registers itself.
            listed = _wait_for(
                lambda: [
                    entry
                    for entry in http.get("/api/sdr/decoders").json()
                    if entry["decoderKind"] == "stub"
                ],
                what="the stub to register",
            )
            assert listed[0]["pcm"]["port"] == decoder.config.pcm_port
            assert listed[0]["pcm"]["channels"] == max(1, len(channels_hz))

            # 2. Started on a radio, its summaries of real PCM come back as decode.stub.<radioId>.
            started = http.post(
                "/api/sdr/decoders/stub/start",
                json={"radio_id": radio_id, "offset_hz": TONE_OFFSET_HZ},
            )
            assert started.json() == {
                "status": "ok",
                "radio_id": radio_id,
                "active": True,
            }
            _wait_for(
                lambda: len(published) >= 2,
                timeout=15,
                what="decoded events on the bus",
            )
            for payload in published[:2]:
                assert payload["radio_id"] == radio_id
                event = payload["event"]
                assert event["frames"] == int(48_000 * REPORT_SECONDS)
                assert (
                    event["rms"] > 0 and event["peak"] > 0
                )  # demodulated signal, not silence

            status = http.get(f"/api/sdr/decoders/stub/status/{radio_id}").json()
            assert (status["active"], status["decoder_reachable"]) == (True, True)
            if channels_hz:
                assert status["channels_hz"] == list(channels_hz)
                assert (
                    status["on_channel"] is True
                )  # the bridge tuned the radio onto its channels

            # 3. Stopping the kind closes the feed; the session ends.
            http.post("/api/sdr/decoders/stub/stop", json={"radio_id": radio_id})
            assert http.get(
                "/api/sdr/decoders/stub/config", headers={"X-Decode-Secret": SECRET}
            ).json() == {"active": False}
            settled = len(published)
            time.sleep(REPORT_SECONDS * 2)
            assert len(published) == settled

            # 4. A hub that forgets the kind (a restart) gets it registered again.
            assert decoder.registrations == 1

            async def _forget_kind() -> None:
                for unsubscriber in manifest_decode._bus_unsubscribers.pop("stub"):
                    unsubscriber()
                manifest_decode._manifests.pop("stub")

            live_hub.run(_forget_kind())
            _wait_for(
                lambda: decoder.registrations == 2, what="the stub to register again"
            )
            assert manifest_decode.get_manifest("stub") is not None
    finally:
        unsubscribe()
        http.close()
