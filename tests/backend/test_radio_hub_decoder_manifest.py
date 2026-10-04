"""
tests/backend/test_radio_hub_decoder_manifest.py

Tests for backend/radio_hub/services/decoder_manifest.py — what a decoder
container may declare when it registers a new kind with the radio hub
(section-containers plan §3.1 / §3.4).

The model is the hub's edge: it must accept a full service manifest (extra
fields ignored) and reject, at registration, any PCM spec the hub's demodulator
cannot actually serve — rather than accept it and send the wrong audio.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.radio_hub.services.decoder_manifest import (
    RESERVED_DECODER_KINDS,
    TUNABLE_MAX_HZ,
    TUNABLE_MIN_HZ,
    DecoderManifest,
    PcmSpec,
)


def _manifest(**overrides) -> dict:
    pcm = overrides.pop("pcm", {})
    return {
        "id": "decoder-pocsag",
        "kind": "decoder",
        "decoderKind": "pocsag",
        "version": "1.2.0",
        "contracts": "^1",
        "pcm": {"port": 7360, **pcm},
        **overrides,
    }


class TestValidManifests:
    def test_minimal_relative_manifest_gets_the_hubs_defaults(self):
        manifest = DecoderManifest.model_validate(_manifest())
        assert manifest.decoder_kind == "pocsag"
        assert manifest.pcm == PcmSpec(port=7360)
        assert (manifest.pcm.rate, manifest.pcm.channels, manifest.pcm.demod) == (
            48000,
            1,
            "fm",
        )
        assert (
            manifest.pcm.bw_hz,
            manifest.pcm.ownership,
            manifest.pcm.channels_hz,
        ) == (12_500, "relative", [])

    def test_a_full_service_manifest_validates_with_extra_fields_ignored(self):
        manifest = DecoderManifest.model_validate(
            _manifest(
                displayName="POCSAG",
                icon="pager",
                health="/health",
                internalUrl="http://pocsag:8000",
            )
        )
        assert manifest.id == "decoder-pocsag"

    def test_absolute_mono_owns_one_channel(self):
        manifest = DecoderManifest.model_validate(
            _manifest(
                pcm={
                    "ownership": "absolute",
                    "channelsHz": [153_350_000],
                    "bwHz": 25_000,
                }
            )
        )
        assert manifest.pcm.channels_hz == [153_350_000]
        assert manifest.pcm.bw_hz == 25_000

    def test_absolute_stereo_owns_two_channels(self):
        manifest = DecoderManifest.model_validate(
            _manifest(
                pcm={
                    "ownership": "absolute",
                    "channels": 2,
                    "channelsHz": [161_975_000, 162_025_000],
                }
            )
        )
        assert manifest.pcm.channels == 2

    @pytest.mark.parametrize("contracts", ["^1", "1", "1.4", "^1.2.3", "1.x"])
    def test_any_contracts_1x_is_accepted(self, contracts):
        assert (
            DecoderManifest.model_validate(_manifest(contracts=contracts)).contracts
            == contracts
        )

    @pytest.mark.parametrize("channel_hz", [TUNABLE_MIN_HZ, TUNABLE_MAX_HZ])
    def test_tunable_range_edges_are_accepted(self, channel_hz):
        manifest = DecoderManifest.model_validate(
            _manifest(pcm={"ownership": "absolute", "channelsHz": [channel_hz]})
        )
        assert manifest.pcm.channels_hz == [channel_hz]

    def test_round_trips_through_its_wire_names(self):
        manifest = DecoderManifest.model_validate(_manifest())
        assert (
            DecoderManifest.model_validate(manifest.model_dump(by_alias=True))
            == manifest
        )


class TestRejectedManifests:
    @pytest.mark.parametrize("kind", sorted(RESERVED_DECODER_KINDS))
    def test_reserved_kinds_cannot_be_claimed(self, kind):
        with pytest.raises(ValidationError, match="reserved"):
            DecoderManifest.model_validate(_manifest(decoderKind=kind))

    @pytest.mark.parametrize(
        "kind", ["", "x", "POCSAG", "1pager", "pager.decode", "pa ger", "a*", "a" * 33]
    )
    def test_kind_must_be_safe_in_a_bus_subject_and_a_url(self, kind):
        with pytest.raises(ValidationError):
            DecoderManifest.model_validate(_manifest(decoderKind=kind))

    @pytest.mark.parametrize("contracts", ["^2", "2.0", "0.9", "", "latest"])
    def test_other_contract_majors_are_refused(self, contracts):
        with pytest.raises(ValidationError):
            DecoderManifest.model_validate(_manifest(contracts=contracts))

    def test_must_be_a_decoder_manifest(self):
        with pytest.raises(ValidationError):
            DecoderManifest.model_validate(_manifest(kind="section"))

    @pytest.mark.parametrize(
        "field", ["id", "decoderKind", "version", "contracts", "pcm"]
    )
    def test_required_fields(self, field):
        body = _manifest()
        del body[field]
        with pytest.raises(ValidationError):
            DecoderManifest.model_validate(body)

    @pytest.mark.parametrize(
        "pcm",
        [
            {"rate": 44100},  # the demod chain emits 48 kHz only
            {"demod": "am"},  # only the FM discriminator exists
            {"channels": 3},
            {"port": 1023},
            {"port": 65536},
            {"bwHz": 999},
            {"bwHz": 200_001},
            {"ownership": "shared"},
            {"gain": 30},  # unknown PCM fields are an error, not ignored
        ],
    )
    def test_pcm_specs_the_hub_cannot_serve(self, pcm):
        with pytest.raises(ValidationError):
            DecoderManifest.model_validate(_manifest(pcm=pcm))

    def test_stereo_needs_absolute_ownership(self):
        with pytest.raises(
            ValidationError, match="stereo PCM needs ownership 'absolute'"
        ):
            DecoderManifest.model_validate(_manifest(pcm={"channels": 2}))

    def test_relative_kinds_declare_no_channels(self):
        with pytest.raises(
            ValidationError, match="channelsHz is only for ownership 'absolute'"
        ):
            DecoderManifest.model_validate(_manifest(pcm={"channelsHz": [144_800_000]}))

    @pytest.mark.parametrize(
        "pcm",
        [
            {"ownership": "absolute"},  # no channel at all
            {
                "ownership": "absolute",
                "channelsHz": [161_975_000, 162_025_000],
            },  # two channels, mono
            {
                "ownership": "absolute",
                "channels": 2,
                "channelsHz": [161_975_000],
            },  # one channel, stereo
        ],
    )
    def test_absolute_kinds_declare_one_channel_per_pcm_channel(self, pcm):
        with pytest.raises(
            ValidationError, match="one channelsHz entry per PCM channel"
        ):
            DecoderManifest.model_validate(_manifest(pcm=pcm))

    @pytest.mark.parametrize("channel_hz", [TUNABLE_MIN_HZ - 1, TUNABLE_MAX_HZ + 1])
    def test_channels_outside_the_tunable_range(self, channel_hz):
        with pytest.raises(ValidationError, match="channelsHz must be between"):
            DecoderManifest.model_validate(
                _manifest(pcm={"ownership": "absolute", "channelsHz": [channel_hz]})
            )

    def test_at_most_two_channels(self):
        with pytest.raises(ValidationError, match="at most 2 items"):
            DecoderManifest.model_validate(
                _manifest(
                    pcm={
                        "ownership": "absolute",
                        "channels": 2,
                        "channelsHz": [161_975_000, 162_000_000, 162_025_000],
                    }
                )
            )
