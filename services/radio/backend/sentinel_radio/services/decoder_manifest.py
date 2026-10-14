"""Decoder manifests — how a new decoder kind declares itself to the radio hub.

A decoder container registers one of these (plan §3.1, `kind: decoder`) and the
hub runs a generic PCM bridge for it (see `manifest_decode.py`). Only the
fields the hub acts on are modelled; other manifest fields (displayName, icon,
health, …) are accepted and ignored, so a full service manifest validates too.

The PCM spec is held to what the hub's demodulator can actually produce today
— 48 kHz s16 FM-discriminator audio, mono, or stereo when the decoder owns two
absolute channels (as AIS does). A manifest asking for anything else is
rejected at registration rather than silently served the wrong audio.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# The kinds the hub serves through its dedicated bridges, plus the words its
# routes use. A manifest can't claim them: `decode.<kind>.<radioId>` and
# `/api/sdr/decoders/<kind>/…` must stay unambiguous.
RESERVED_DECODER_KINDS = frozenset({"voice", "decode", "aprs", "ais", "adsb", "register"})

# Anything an RTL-SDR can tune (the same range Settings accepts for the APRS channel).
TUNABLE_MIN_HZ = 24_000_000
TUNABLE_MAX_HZ = 1_766_000_000

_CONTRACTS_V1 = re.compile(r"\^?1(\.(\d+|x)){0,2}")


class PcmSpec(BaseModel):
    """The PCM feed a decoder expects on its TCP port."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    rate: Literal[48000] = 48000
    channels: Literal[1, 2] = 1
    demod: Literal["fm"] = "fm"
    port: int = Field(ge=1024, le=65535)
    bw_hz: int = Field(default=12_500, ge=1_000, le=200_000, alias="bwHz")
    # relative: demodulate wherever the caller points it (an offset from the
    # radio's centre), like the voice bridge. absolute: own `channelsHz` and keep
    # the radio tuned to them, like the APRS and AIS bridges.
    ownership: Literal["relative", "absolute"] = "relative"
    channels_hz: list[int] = Field(default_factory=list, alias="channelsHz", max_length=2)

    @field_validator("channels_hz")
    @classmethod
    def _tunable(cls, channels_hz: list[int]) -> list[int]:
        for channel_hz in channels_hz:
            if not TUNABLE_MIN_HZ <= channel_hz <= TUNABLE_MAX_HZ:
                raise ValueError(f"channelsHz must be between {TUNABLE_MIN_HZ} and {TUNABLE_MAX_HZ}")
        return channels_hz

    @model_validator(mode="after")
    def _ownership_matches_channels(self) -> PcmSpec:
        if self.ownership == "absolute":
            if len(self.channels_hz) != self.channels:
                raise ValueError("an absolute decoder declares one channelsHz entry per PCM channel")
        else:
            if self.channels != 1:
                raise ValueError("stereo PCM needs ownership 'absolute' with two channelsHz")
            if self.channels_hz:
                raise ValueError("channelsHz is only for ownership 'absolute'")
        return self


class DecoderManifest(BaseModel):
    """A decoder container's manifest, as far as the radio hub reads it."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    id: str = Field(pattern=r"^[a-z][a-z0-9-]{1,63}$")
    kind: Literal["decoder"]
    decoder_kind: str = Field(alias="decoderKind", pattern=r"^[a-z][a-z0-9-]{1,31}$")
    version: str = Field(min_length=1, max_length=32)
    contracts: str = Field(max_length=16)
    pcm: PcmSpec

    @field_validator("decoder_kind")
    @classmethod
    def _not_reserved(cls, decoder_kind: str) -> str:
        if decoder_kind in RESERVED_DECODER_KINDS:
            raise ValueError(f"decoderKind {decoder_kind!r} is reserved")
        return decoder_kind

    @field_validator("contracts")
    @classmethod
    def _contracts_v1(cls, contracts: str) -> str:
        if not _CONTRACTS_V1.fullmatch(contracts):
            raise ValueError("this hub speaks contracts 1.x")
        return contracts
