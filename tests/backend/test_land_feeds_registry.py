"""Tests for `backend.services.land_feeds.registry` — the provider allow-list
`FeedConfig.provider` is validated against, and the single place the poller
and router resolve a provider string to its adapter instance."""

from __future__ import annotations

import pytest

from backend.services.land_feeds.adapters.durham import DurhamAdapter
from backend.services.land_feeds.adapters.snapshot import SnapshotAdapter
from backend.services.land_feeds.adapters.tfl_jamcams import TflJamCamsAdapter
from backend.services.land_feeds.registry import get_adapter


class TestGetAdapter:
    def test_snapshot_provider_resolves_to_the_snapshot_adapter(self):
        assert isinstance(get_adapter("snapshot"), SnapshotAdapter)

    def test_durham_provider_resolves_to_the_durham_adapter(self):
        assert isinstance(get_adapter("durham"), DurhamAdapter)

    def test_tfl_jamcams_provider_resolves_to_the_tfl_adapter(self):
        assert isinstance(get_adapter("tfl-jamcams"), TflJamCamsAdapter)

    def test_same_instance_is_returned_across_calls(self):
        """One adapter instance per process — its own internal ref-map cache
        must persist across polls, so `get_adapter` must not construct a new
        one on every call."""
        assert get_adapter("durham") is get_adapter("durham")

    def test_unknown_provider_raises_key_error(self):
        # `FeedConfig.provider` is itself allow-listed by pydantic, so a
        # provider string reaching here outside {snapshot, durham,
        # tfl-jamcams} means a bug upstream, not untrusted input — this
        # proves the registry itself still refuses rather than guessing.
        with pytest.raises(KeyError):
            get_adapter("some-unlisted-provider")
