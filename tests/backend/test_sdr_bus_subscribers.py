"""
tests/backend/test_sdr_bus_subscribers.py

The SDR router's event-bus subscribers (P1.1 of the section-containers split):

    settings.changed.land        → retune a running APRS bridge on aprsChannelHz
    sdr.decode.radio-reassigned  → move the APRS/AIS bridge to the new radio

They replace direct calls from routers/settings.py and services/app_config.py,
so these tests pin that the triggers fire exactly where the old calls did —
and nowhere else.
"""

from unittest.mock import AsyncMock

import pytest

from backend.platform.bus import bus
from backend.radio_hub.routers import decode as decode_router


class TestLandSettingsSubscriber:
    def test_a_different_land_key_does_not_retune(self, client, monkeypatch):
        apply_channel = AsyncMock()
        monkeypatch.setattr(decode_router, "apply_aprs_channel", apply_channel)

        resp = client.put("/api/settings/land/aprsRetentionMinutes", json={"value": 45})

        assert resp.status_code == 200
        apply_channel.assert_not_awaited()

    def test_a_retune_failure_still_fails_the_request(self, client, monkeypatch):
        # Before the bus, apply_aprs_channel was called inline and its error
        # escaped the endpoint; publish(raise_errors=True) must keep that.
        monkeypatch.setattr(
            decode_router,
            "apply_aprs_channel",
            AsyncMock(side_effect=RuntimeError("radio gone")),
        )

        with pytest.raises(RuntimeError, match="radio gone"):
            client.put("/api/settings/land/aprsChannelHz", json={"value": 144390000})


class TestDecodeRadioReassignedSubscriber:
    def test_a_plain_sdr_setting_write_never_reconciles_a_bridge(
        self, client, monkeypatch
    ):
        # Regression: the generic settings.changed.sdr feed must not reach the
        # reconcile path — only a config upload/file-sync reassignment does.
        reconcile_aprs = AsyncMock()
        reconcile_ais = AsyncMock()
        monkeypatch.setattr(decode_router, "reconcile_aprs_decode", reconcile_aprs)
        monkeypatch.setattr(decode_router, "reconcile_ais_decode", reconcile_ais)

        client.put("/api/settings/sdr/aprs_radio_id", json={"value": 3})
        client.put("/api/settings/sdr/ais_radio_id", json={"value": 4})

        reconcile_aprs.assert_not_awaited()
        reconcile_ais.assert_not_awaited()

    @pytest.mark.parametrize(
        ("decoder", "called", "not_called"),
        [
            ("aprs", "reconcile_aprs_decode", "reconcile_ais_decode"),
            ("ais", "reconcile_ais_decode", "reconcile_aprs_decode"),
        ],
    )
    async def test_dispatches_to_the_named_decoders_reconcile(
        self, monkeypatch, decoder, called, not_called
    ):
        called_mock = AsyncMock()
        not_called_mock = AsyncMock()
        monkeypatch.setattr(decode_router, called, called_mock)
        monkeypatch.setattr(decode_router, not_called, not_called_mock)
        session = object()

        await bus.publish(
            "sdr.decode.radio-reassigned",
            {"decoder": decoder, "db": session, "previous": 1, "next": 2},
        )

        called_mock.assert_awaited_once_with(session, 1, 2)
        not_called_mock.assert_not_awaited()
