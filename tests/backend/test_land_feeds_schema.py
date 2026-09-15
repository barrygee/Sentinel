"""Validation rules for `backend.services.land_feeds.schema.FeedConfig` and its
related models — the single boundary every Land feed config edit (Settings UI,
raw `PUT /api/settings/land/feeds`, config upload) must pass through.

These are deliberately negative-heavy: the schema is the SSRF/config-integrity
gate described in its own docstring, so every rule it claims to enforce needs
a test proving a violation is rejected, not just that a valid config passes.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.services.land_feeds.schema import (
    FEED_ID_PATTERN,
    FEED_REF_PATTERN,
    REFRESH_SECONDS_MAX,
    REFRESH_SECONDS_MIN,
    FeedAuth,
    FeedConfig,
    FeedLocation,
)


def _base_feed(**overrides) -> dict:
    """A minimal valid non-snapshot feed config, overridable per test."""
    feed = {
        "id": "durham-cc",
        "name": "Durham County Council",
        "category": "traffic-cameras",
        "provider": "durham",
        "url": "https://example.org/layer",
        "enabled": False,
        "refreshSeconds": 60,
        "datasets": ["cameras"],
        "bbox": None,
        "location": None,
        "auth": {"type": "none"},
    }
    feed.update(overrides)
    return feed


class TestFeedIdPattern:
    """`id` is interpolated into URL paths, DB keys and log lines, so its
    charset is deliberately stricter than a general slug."""

    @pytest.mark.parametrize("feed_id", ["durham-cc", "a1", "tfl-jamcams", "x" * 40])
    def test_accepted_ids_match_the_pattern_directly(self, feed_id):
        assert FEED_ID_PATTERN.match(feed_id)
        FeedConfig(**_base_feed(id=feed_id))  # does not raise

    @pytest.mark.parametrize(
        "feed_id",
        [
            "",  # empty
            "a",  # too short (min length 2)
            "-leading-dash",
            "Durham-CC",  # uppercase not allowed
            "has spaces",
            "has/slash",
            "x" * 41,  # exceeds the 40-char cap
            "under_score",
        ],
    )
    def test_rejected_ids_raise_validation_error(self, feed_id):
        with pytest.raises(ValidationError, match="id must match"):
            FeedConfig(**_base_feed(id=feed_id))


class TestFeedRefPattern:
    """Bounds every /image/{ref} and /clip/{ref} path parameter."""

    @pytest.mark.parametrize("ref", ["a", "A1._-", "x" * 80])
    def test_accepted_refs(self, ref):
        assert FEED_REF_PATTERN.match(ref)

    @pytest.mark.parametrize(
        "ref", ["", "x" * 81, "has space", "has/slash", "has?query"]
    )
    def test_rejected_refs(self, ref):
        assert not FEED_REF_PATTERN.match(ref)


class TestUrlHttpsOnly:
    def test_https_url_is_accepted(self):
        config = FeedConfig(**_base_feed(url="https://example.org/api"))
        assert config.url == "https://example.org/api"

    def test_trailing_slash_is_stripped(self):
        config = FeedConfig(**_base_feed(url="https://example.org/api/"))
        assert config.url == "https://example.org/api"

    @pytest.mark.parametrize(
        "bad_url",
        [
            "http://example.org/api",  # plain http
            "ftp://example.org/api",
            "//example.org/api",
            "javascript:alert(1)",
            "",
        ],
    )
    def test_non_https_url_is_rejected(self, bad_url):
        with pytest.raises(ValidationError, match="url must be an https"):
            FeedConfig(**_base_feed(url=bad_url))

    def test_oversized_url_is_rejected(self):
        oversized = "https://example.org/" + ("a" * 2048)
        with pytest.raises(ValidationError, match="url must be an https"):
            FeedConfig(**_base_feed(url=oversized))


class TestProviderAllowList:
    @pytest.mark.parametrize("provider", ["snapshot", "durham", "tfl-jamcams"])
    def test_allow_listed_providers_are_accepted(self, provider):
        overrides = {"provider": provider}
        if provider == "snapshot":
            overrides["location"] = {"latitude": 54.9, "longitude": -1.6}
        FeedConfig(**_base_feed(**overrides))

    def test_arbitrary_provider_string_is_rejected(self):
        # Guards the allow-list itself: `provider` must never accept an
        # arbitrary import-path-shaped string.
        with pytest.raises(ValidationError):
            FeedConfig(**_base_feed(provider="backend.services.evil.Adapter"))


class TestRefreshSecondsClamp:
    def test_minimum_boundary_is_accepted(self):
        config = FeedConfig(**_base_feed(refreshSeconds=REFRESH_SECONDS_MIN))
        assert config.refresh_seconds == REFRESH_SECONDS_MIN

    def test_maximum_boundary_is_accepted(self):
        config = FeedConfig(**_base_feed(refreshSeconds=REFRESH_SECONDS_MAX))
        assert config.refresh_seconds == REFRESH_SECONDS_MAX

    def test_below_minimum_is_rejected(self):
        with pytest.raises(ValidationError):
            FeedConfig(**_base_feed(refreshSeconds=REFRESH_SECONDS_MIN - 1))

    def test_above_maximum_is_rejected(self):
        with pytest.raises(ValidationError):
            FeedConfig(**_base_feed(refreshSeconds=REFRESH_SECONDS_MAX + 1))

    def test_default_is_sixty_seconds(self):
        entry = _base_feed()
        del entry["refreshSeconds"]
        assert FeedConfig(**entry).refresh_seconds == 60


class TestBboxSanity:
    def test_valid_bbox_is_normalised(self):
        config = FeedConfig(**_base_feed(bbox=[[-2.0, 54.0], [-1.0, 55.0]]))
        assert config.bbox == [[-2.0, 54.0], [-1.0, 55.0]]

    def test_none_bbox_is_accepted(self):
        assert FeedConfig(**_base_feed(bbox=None)).bbox is None

    @pytest.mark.parametrize(
        "bbox",
        [
            [[-2.0, 54.0]],  # only one corner
            [[-2.0], [-1.0, 55.0]],  # corner missing a coordinate
            [[-2.0, 54.0], [-1.0, 55.0], [0.0, 56.0]],  # too many corners
        ],
    )
    def test_malformed_shape_is_rejected(self, bbox):
        with pytest.raises(ValidationError, match=r"bbox must be"):
            FeedConfig(**_base_feed(bbox=bbox))

    @pytest.mark.parametrize(
        "bbox",
        [
            [[-181.0, 54.0], [-1.0, 55.0]],
            [[-2.0, 54.0], [181.0, 55.0]],
        ],
    )
    def test_out_of_range_longitude_is_rejected(self, bbox):
        with pytest.raises(ValidationError, match="longitude out of range"):
            FeedConfig(**_base_feed(bbox=bbox))

    @pytest.mark.parametrize(
        "bbox",
        [
            [[-2.0, -91.0], [-1.0, 55.0]],
            [[-2.0, 54.0], [-1.0, 91.0]],
        ],
    )
    def test_out_of_range_latitude_is_rejected(self, bbox):
        with pytest.raises(ValidationError, match="latitude out of range"):
            FeedConfig(**_base_feed(bbox=bbox))

    def test_min_must_be_less_than_max(self):
        with pytest.raises(ValidationError, match="min must be less than max"):
            FeedConfig(**_base_feed(bbox=[[-1.0, 55.0], [-2.0, 54.0]]))

    def test_equal_min_and_max_is_rejected(self):
        with pytest.raises(ValidationError, match="min must be less than max"):
            FeedConfig(**_base_feed(bbox=[[-2.0, 54.0], [-2.0, 54.0]]))


class TestLocationRequiredForSnapshot:
    def test_snapshot_without_location_is_rejected(self):
        with pytest.raises(
            ValidationError, match="location is required for the snapshot provider"
        ):
            FeedConfig(**_base_feed(provider="snapshot", location=None))

    def test_snapshot_with_location_is_accepted(self):
        config = FeedConfig(
            **_base_feed(
                provider="snapshot", location={"latitude": 54.9, "longitude": -1.6}
            )
        )
        assert config.location == FeedLocation(latitude=54.9, longitude=-1.6)

    def test_non_snapshot_with_location_is_rejected(self):
        with pytest.raises(
            ValidationError, match="location is only valid for the snapshot provider"
        ):
            FeedConfig(
                **_base_feed(
                    provider="durham", location={"latitude": 54.9, "longitude": -1.6}
                )
            )

    @pytest.mark.parametrize(
        "coords",
        [
            {"latitude": 91.0, "longitude": 0.0},
            {"latitude": -91.0, "longitude": 0.0},
            {"latitude": 0.0, "longitude": 181.0},
            {"latitude": 0.0, "longitude": -181.0},
        ],
    )
    def test_location_out_of_range_is_rejected(self, coords):
        with pytest.raises(ValidationError):
            FeedLocation(**coords)


class TestDatasets:
    def test_default_is_empty_list(self):
        entry = _base_feed()
        del entry["datasets"]
        assert FeedConfig(**entry).datasets == []

    def test_too_many_datasets_is_rejected(self):
        with pytest.raises(ValidationError, match="datasets list is too long"):
            FeedConfig(**_base_feed(datasets=[f"d{i}" for i in range(21)]))

    def test_oversized_dataset_name_is_rejected(self):
        with pytest.raises(ValidationError, match="1-40 character string"):
            FeedConfig(**_base_feed(datasets=["x" * 41]))

    def test_empty_dataset_name_is_rejected(self):
        with pytest.raises(ValidationError, match="1-40 character string"):
            FeedConfig(**_base_feed(datasets=[""]))


class TestNameLength:
    def test_empty_name_is_rejected(self):
        with pytest.raises(ValidationError):
            FeedConfig(**_base_feed(name=""))

    def test_oversized_name_is_rejected(self):
        with pytest.raises(ValidationError):
            FeedConfig(**_base_feed(name="x" * 61))


class TestFeedAuthShapeVariants:
    def test_default_auth_is_none(self):
        assert FeedAuth().type == "none"

    @pytest.mark.parametrize("auth_type", ["none", "basic", "apiKey"])
    def test_all_auth_types_are_accepted(self, auth_type):
        assert FeedAuth(type=auth_type).type == auth_type

    def test_unknown_auth_type_is_rejected(self):
        with pytest.raises(ValidationError):
            FeedAuth(type="oauth2")

    def test_header_name_and_query_param_accept_valid_tokens(self):
        auth = FeedAuth(type="apiKey", headerName="X-Api-Key", queryParam="app_key")
        assert auth.header_name == "X-Api-Key"
        assert auth.query_param == "app_key"

    @pytest.mark.parametrize("bad_name", ["has space", "x" * 65, "has/slash", ""])
    def test_header_name_rejects_unsafe_values(self, bad_name):
        with pytest.raises(ValidationError, match="header/query parameter names"):
            FeedAuth(type="apiKey", headerName=bad_name)

    def test_optional_flag_defaults_false(self):
        assert FeedAuth().optional is False

    def test_none_header_name_is_accepted(self):
        assert FeedAuth(type="none", headerName=None).header_name is None


class TestFeedConfigDefaults:
    def test_enabled_defaults_false(self):
        entry = _base_feed()
        del entry["enabled"]
        assert FeedConfig(**entry).enabled is False

    def test_round_trips_by_alias(self):
        config = FeedConfig(**_base_feed())
        dumped = config.model_dump(by_alias=True)
        assert dumped["refreshSeconds"] == 60
        assert "refresh_seconds" not in dumped
