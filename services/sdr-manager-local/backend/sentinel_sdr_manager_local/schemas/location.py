"""This machine's geographic position, as published to other Sentinels.

It is Sentinel's own Location setting (`app.location`, read from core by
`location_source.py`), not something SDR Manager stores: SDR Manager's separate
fixed-location feature was not ported (ADR 0007). Every Sentinel that queries
this machine can plot it on a map without being told separately where it is.

The position is published on `GET /api/status` and in `GET /api/v1/sdrs`'s
`source` block, so it arrives alongside the device list in the one call
Sentinel already makes rather than needing a second round trip.

**These coordinates are readable by anyone who can reach `/api/v1/sdrs`**,
which is unauthenticated by design (Sentry ADR-0010). That is the same trade the
export already makes for device names and IQ ports, and it is what lets a
Sentinel with no credential draw the map at all — but it does mean the
position of the Pi is not a secret from the network it sits on.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

MINIMUM_LATITUDE = -90.0
MAXIMUM_LATITUDE = 90.0
MINIMUM_LONGITUDE = -180.0
MAXIMUM_LONGITUDE = 180.0


class SdrManagerLocation(BaseModel):
    """This machine's position — the value published to other Sentinels.

    `latitude`/`longitude` are both `None` until an operator sets a position.
    They are always both-or-neither: a lone latitude cannot be plotted, so
    the pair is validated as a unit rather than letting one arrive without the
    other.
    """

    model_config = ConfigDict(frozen=True)

    latitude: float | None = Field(
        default=None,
        ge=MINIMUM_LATITUDE,
        le=MAXIMUM_LATITUDE,
        description="Decimal degrees. Null when the operator has not set a position",
    )
    longitude: float | None = Field(
        default=None,
        ge=MINIMUM_LONGITUDE,
        le=MAXIMUM_LONGITUDE,
        description="Decimal degrees. Null when the operator has not set a position",
    )
    updated_at: int = Field(
        default=0, description="Unix ms the position was last read from Sentinel's Location setting"
    )

    @property
    def is_set(self) -> bool:
        """Whether a plottable position exists. Both coordinates or neither."""
        return self.latitude is not None and self.longitude is not None

    @model_validator(mode="after")
    def _check_pair_is_complete(self) -> SdrManagerLocation:
        """Refuse half a position.

        Nothing downstream can do anything useful with one coordinate, and a
        stored half-pair would be indistinguishable from a set position right
        up until Sentinel tried to place the marker.
        """
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be set together, or both left empty.")
        return self
