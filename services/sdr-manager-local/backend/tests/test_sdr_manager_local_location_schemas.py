"""Tests for the published position's two rules: coordinate bounds, and both-or-neither.

Both would fail silently in the way that matters most here. An out-of-range
longitude is still a number, and a half-set pair is still a valid-looking
object — neither raises anywhere until another Sentinel tries to place a
marker and puts this machine somewhere it is not.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_location_schemas.py
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from sentinel_sdr_manager_local.schemas.location import SdrManagerLocation

LATITUDE = 54.95149
LONGITUDE = -1.53586


class TestTheUnsetPosition:
    def test_defaults_to_no_position(self) -> None:
        location = SdrManagerLocation()

        assert location.latitude is None
        assert location.longitude is None
        assert location.updated_at == 0
        assert location.is_set is False

    def test_a_complete_pair_reports_itself_set(self) -> None:
        location = SdrManagerLocation(latitude=LATITUDE, longitude=LONGITUDE)

        assert location.is_set is True

    def test_zero_zero_is_a_set_position_not_an_unset_one(self) -> None:
        # Null Island is a real coordinate. If `0.0` were treated as "unset",
        # a machine deliberately placed there would vanish from Sentinel's map —
        # which is exactly why the unset state is `None` and not `0`.
        location = SdrManagerLocation(latitude=0.0, longitude=0.0)

        assert location.is_set is True


class TestCoordinateBounds:
    @pytest.mark.parametrize("latitude", [-90.0, 0.0, 90.0])
    def test_accepts_latitudes_at_and_inside_the_limits(self, latitude: float) -> None:
        assert SdrManagerLocation(latitude=latitude, longitude=0.0).latitude == latitude

    @pytest.mark.parametrize("longitude", [-180.0, 0.0, 180.0])
    def test_accepts_longitudes_at_and_inside_the_limits(self, longitude: float) -> None:
        assert SdrManagerLocation(latitude=0.0, longitude=longitude).longitude == longitude

    @pytest.mark.parametrize("latitude", [-90.1, 90.1, 900.0])
    def test_rejects_a_latitude_off_the_globe(self, latitude: float) -> None:
        with pytest.raises(ValidationError):
            SdrManagerLocation(latitude=latitude, longitude=0.0)

    @pytest.mark.parametrize("longitude", [-180.1, 180.1, 900.0])
    def test_rejects_a_longitude_off_the_globe(self, longitude: float) -> None:
        with pytest.raises(ValidationError):
            SdrManagerLocation(latitude=0.0, longitude=longitude)


class TestTheBothOrNeitherRule:
    """Half a position cannot be plotted, so it is never a state worth storing."""

    def test_rejects_a_latitude_without_a_longitude(self) -> None:
        with pytest.raises(ValidationError, match="set together"):
            SdrManagerLocation(latitude=LATITUDE)

    def test_rejects_a_longitude_without_a_latitude(self) -> None:
        with pytest.raises(ValidationError, match="set together"):
            SdrManagerLocation(longitude=LONGITUDE)
