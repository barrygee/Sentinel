"""Unit tests for the trunk channel-map JSON↔CSV service.

Covers the pure helpers (filename safety, CSV render/parse, payload validation)
and the directory sync (import existing CSVs, write/prune, leave group lists
alone) in :mod:`backend.services.sdr_channel_maps`.
"""

from __future__ import annotations

import pytest

from backend.services import sdr_channel_maps as cm

GROUP_LIST_CSV = "DEC,Mode(A/B/DE),Name,Tag\n1449,A,Fire Dispatch,Fire\n"


class TestSafeMapFilename:
    def test_valid_name_gets_csv_suffix(self):
        assert cm.safe_map_filename("my-dmr_1.0") == "my-dmr_1.0.csv"

    def test_strips_surrounding_whitespace(self):
        assert cm.safe_map_filename("  site_a  ") == "site_a.csv"

    @pytest.mark.parametrize(
        "bad", ["", "   ", "../escape", "a/b", "a\\b", "spaces here", "café"]
    )
    def test_invalid_names_raise(self, bad):
        with pytest.raises(ValueError, match="invalid channel-map name"):
            cm.safe_map_filename(bad)


class TestBuildChannelMapCsv:
    def test_sorts_by_lsn_and_keeps_header(self):
        csv = cm.build_channel_map_csv(
            [
                {"lsn": 3, "frequency_hz": 859606250},
                {"lsn": 1, "frequency_hz": 858606250},
            ]
        )
        assert csv == (cm.CHANNEL_MAP_HEADER + "\n1,858606250\n3,859606250\n")

    def test_duplicate_lsn_last_value_wins(self):
        csv = cm.build_channel_map_csv(
            [
                {"lsn": 1, "frequency_hz": 858606250},
                {"lsn": 1, "frequency_hz": 999000000},
            ]
        )
        assert csv == cm.CHANNEL_MAP_HEADER + "\n1,999000000\n"

    def test_empty_channels_emits_header_only(self):
        assert cm.build_channel_map_csv([]) == cm.CHANNEL_MAP_HEADER + "\n"


class TestParseChannelMapCsv:
    def test_skips_header_and_parses_pairs(self):
        text = cm.CHANNEL_MAP_HEADER + "\n1,858606250\n2,859606250\n"
        assert cm.parse_channel_map_csv(text) == [
            {"lsn": 1, "frequency_hz": 858606250},
            {"lsn": 2, "frequency_hz": 859606250},
        ]

    def test_ignores_blank_short_and_non_integer_rows(self):
        text = "\n".join(
            [
                cm.CHANNEL_MAP_HEADER,
                "1,858606250",
                "",
                "noseparator",
                "x,y",
                "2,859606250",
            ]
        )
        assert cm.parse_channel_map_csv(text) == [
            {"lsn": 1, "frequency_hz": 858606250},
            {"lsn": 2, "frequency_hz": 859606250},
        ]

    def test_empty_text_yields_no_channels(self):
        assert cm.parse_channel_map_csv("") == []


class TestLooksLikeChannelMap:
    def test_channel_map_header_is_true(self, tmp_path):
        path = tmp_path / "a.csv"
        path.write_text(cm.CHANNEL_MAP_HEADER + "\n1,858606250\n")
        assert cm._looks_like_channel_map(path) is True

    def test_group_list_header_is_false(self, tmp_path):
        path = tmp_path / "g.csv"
        path.write_text(GROUP_LIST_CSV)
        assert cm._looks_like_channel_map(path) is False

    def test_missing_file_is_false(self, tmp_path):
        assert cm._looks_like_channel_map(tmp_path / "nope.csv") is False


class TestReadChannelMapsFromDir:
    def test_missing_dir_returns_empty(self, tmp_path):
        assert cm.read_channel_maps_from_dir(tmp_path / "absent") == []

    def test_imports_only_channel_maps(self, tmp_path):
        (tmp_path / "site.csv").write_text(cm.CHANNEL_MAP_HEADER + "\n1,858606250\n")
        (tmp_path / "groups.csv").write_text(GROUP_LIST_CSV)  # skipped: group list
        (tmp_path / "empty.csv").write_text("")  # skipped: empty
        (tmp_path / "notes.txt").write_text("ignore me")  # skipped: not .csv
        (tmp_path / "subdir.csv").mkdir()  # skipped: not a file
        result = cm.read_channel_maps_from_dir(tmp_path)
        assert result == [
            {"name": "site", "channels": [{"lsn": 1, "frequency_hz": 858606250}]}
        ]


class TestValidateChannelMapsPayload:
    def test_valid_payload_normalises(self):
        payload = {
            "channel_maps": [
                {
                    "name": "  my-dmr ",
                    "channels": [{"lsn": 1, "frequency_hz": 858606250}],
                }
            ]
        }
        assert cm.validate_channel_maps_payload(payload) == [
            {"name": "my-dmr", "channels": [{"lsn": 1, "frequency_hz": 858606250}]}
        ]

    @pytest.mark.parametrize("body", [[], "x", 5, {}, {"channel_maps": "nope"}])
    def test_non_object_or_missing_array_raises(self, body):
        with pytest.raises(ValueError, match="channel_maps array"):
            cm.validate_channel_maps_payload(body)

    def test_entry_not_object_raises(self):
        with pytest.raises(ValueError, match="must be an object"):
            cm.validate_channel_maps_payload({"channel_maps": ["nope"]})

    def test_bad_name_raises(self):
        with pytest.raises(ValueError, match="invalid channel-map name"):
            cm.validate_channel_maps_payload(
                {"channel_maps": [{"name": "../x", "channels": []}]}
            )

    def test_duplicate_name_raises(self):
        payload = {
            "channel_maps": [
                {"name": "dup", "channels": []},
                {"name": "dup", "channels": []},
            ]
        }
        with pytest.raises(ValueError, match="duplicate channel-map name"):
            cm.validate_channel_maps_payload(payload)

    def test_channels_not_list_raises(self):
        with pytest.raises(ValueError, match="must have a channels array"):
            cm.validate_channel_maps_payload(
                {"channel_maps": [{"name": "x", "channels": 1}]}
            )

    def test_channel_not_object_raises(self):
        with pytest.raises(ValueError, match="must be an object"):
            cm.validate_channel_maps_payload(
                {"channel_maps": [{"name": "x", "channels": [5]}]}
            )

    @pytest.mark.parametrize(
        "channel",
        [{"frequency_hz": 858606250}, {"lsn": 1}, {"lsn": "a", "frequency_hz": 1}],
    )
    def test_missing_or_non_integer_fields_raise(self, channel):
        with pytest.raises(ValueError, match="integer lsn and frequency_hz"):
            cm.validate_channel_maps_payload(
                {"channel_maps": [{"name": "x", "channels": [channel]}]}
            )

    def test_non_positive_lsn_raises(self):
        with pytest.raises(ValueError, match="lsn must be positive"):
            cm.validate_channel_maps_payload(
                {
                    "channel_maps": [
                        {
                            "name": "x",
                            "channels": [{"lsn": 0, "frequency_hz": 858606250}],
                        }
                    ]
                }
            )

    @pytest.mark.parametrize(
        "frequency_hz", [cm.MIN_FREQUENCY_HZ - 1, cm.MAX_FREQUENCY_HZ + 1]
    )
    def test_out_of_range_frequency_raises(self, frequency_hz):
        with pytest.raises(ValueError, match="out of range"):
            cm.validate_channel_maps_payload(
                {
                    "channel_maps": [
                        {
                            "name": "x",
                            "channels": [{"lsn": 1, "frequency_hz": frequency_hz}],
                        }
                    ]
                }
            )

    @pytest.mark.parametrize("frequency_hz", [cm.MIN_FREQUENCY_HZ, cm.MAX_FREQUENCY_HZ])
    def test_boundary_frequencies_accepted(self, frequency_hz):
        result = cm.validate_channel_maps_payload(
            {
                "channel_maps": [
                    {
                        "name": "x",
                        "channels": [{"lsn": 1, "frequency_hz": frequency_hz}],
                    }
                ]
            }
        )
        assert result[0]["channels"][0]["frequency_hz"] == frequency_hz


class TestWriteChannelMapsToDir:
    def test_creates_dir_and_writes_csv(self, tmp_path):
        maps_dir = tmp_path / "maps"
        cm.write_channel_maps_to_dir(
            maps_dir,
            [{"name": "site", "channels": [{"lsn": 1, "frequency_hz": 858606250}]}],
        )
        written = (maps_dir / "site.csv").read_text()
        assert written == cm.CHANNEL_MAP_HEADER + "\n1,858606250\n"

    def test_prunes_removed_channel_maps_but_keeps_group_lists(self, tmp_path):
        # Pre-existing: a stale channel map and a group list.
        (tmp_path / "old.csv").write_text(cm.CHANNEL_MAP_HEADER + "\n9,400000000\n")
        (tmp_path / "groups.csv").write_text(GROUP_LIST_CSV)
        cm.write_channel_maps_to_dir(
            tmp_path,
            [{"name": "site", "channels": [{"lsn": 1, "frequency_hz": 858606250}]}],
        )
        names = sorted(path.name for path in tmp_path.glob("*.csv"))
        # old.csv (a channel map not in the new set) is pruned; groups.csv stays.
        assert names == ["groups.csv", "site.csv"]
