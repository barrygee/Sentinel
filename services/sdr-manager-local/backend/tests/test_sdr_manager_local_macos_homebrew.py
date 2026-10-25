"""Tests for `adapters/macos/homebrew.py` and librtlsdr's lookup in `adapters/ctypes_rtlsdr.py`.

A LaunchAgent runs with a bare `PATH`, so Homebrew's tools and library must be
found in its prefixes too. Every prefix here is a temporary folder.

Run with:  uv run --project backend pytest services/sdr-manager-local/backend/tests/test_sdr_manager_local_macos_homebrew.py
"""

from __future__ import annotations

import ctypes
from pathlib import Path
from typing import Any

import pytest

from sentinel_sdr_manager_local.adapters import ctypes_rtlsdr
from sentinel_sdr_manager_local.adapters.ctypes_rtlsdr import (
    CtypesRtlSdrLibrary,
    RtlSdrLibraryUnavailableError,
    librtlsdr_candidates,
)
from sentinel_sdr_manager_local.adapters.macos.homebrew import (
    HOMEBREW_PREFIXES,
    find_homebrew_executable,
    find_homebrew_tool,
    homebrew_library_directories,
    librtlsdr_version,
)


def _not_on_path(_name: str) -> None:
    return None


def _install(prefix: Path, tool: str) -> Path:
    executable = prefix / "bin" / tool
    executable.parent.mkdir(parents=True, exist_ok=True)
    executable.write_text("#!/bin/sh\n")
    return executable


class TestPrefixes:
    def test_apple_silicon_first_then_intel(self) -> None:
        assert HOMEBREW_PREFIXES == (Path("/opt/homebrew"), Path("/usr/local"))

    def test_library_directories_are_each_prefixs_lib(self) -> None:
        assert homebrew_library_directories() == (Path("/opt/homebrew/lib"), Path("/usr/local/lib"))
        assert homebrew_library_directories([Path("/x")]) == (Path("/x/lib"),)


class TestFindHomebrewTool:
    def test_a_path_with_a_folder_is_used_as_given(self) -> None:
        def which(_name: str) -> str:
            raise AssertionError("an explicit path is never looked up")

        assert find_homebrew_tool("/opt/rtl/rtl_tcp", which=which) == "/opt/rtl/rtl_tcp"

    def test_found_on_path_first(self, tmp_path: Path) -> None:
        _install(tmp_path, "rtl_tcp")

        assert find_homebrew_tool("rtl_tcp", [tmp_path], which=lambda _name: "/usr/bin/rtl_tcp") == "/usr/bin/rtl_tcp"

    def test_otherwise_in_the_first_prefix_that_has_it(self, tmp_path: Path) -> None:
        apple_silicon, intel = tmp_path / "opt-homebrew", tmp_path / "usr-local"
        _install(intel, "rtl_tcp")
        expected = _install(apple_silicon, "rtl_tcp")

        assert find_homebrew_tool("rtl_tcp", [apple_silicon, intel], which=_not_on_path) == str(expected)

    def test_falls_through_to_a_later_prefix(self, tmp_path: Path) -> None:
        expected = _install(tmp_path / "usr-local", "rtl_eeprom")

        found = find_homebrew_tool("rtl_eeprom", [tmp_path / "opt-homebrew", tmp_path / "usr-local"], _not_on_path)

        assert found == str(expected)

    def test_a_folder_with_the_tools_name_is_not_the_tool(self, tmp_path: Path) -> None:
        (tmp_path / "bin" / "rtl_tcp").mkdir(parents=True)

        assert find_homebrew_tool("rtl_tcp", [tmp_path], which=_not_on_path) == "rtl_tcp"

    def test_nowhere_leaves_the_bare_name(self, tmp_path: Path) -> None:
        assert find_homebrew_tool("rtl_tcp", [tmp_path], which=_not_on_path) == "rtl_tcp"


class TestFindHomebrewExecutable:
    def test_the_path_of_an_installed_tool(self, tmp_path: Path) -> None:
        expected = _install(tmp_path, "brew")

        assert find_homebrew_executable("brew", [tmp_path], which=_not_on_path) == str(expected)

    def test_none_when_it_is_nowhere(self, tmp_path: Path) -> None:
        assert find_homebrew_executable("brew", [tmp_path], which=_not_on_path) is None

    def test_none_when_path_names_a_file_that_is_gone(self, tmp_path: Path) -> None:
        missing = str(tmp_path / "gone" / "brew")

        assert find_homebrew_executable("brew", [tmp_path], which=lambda _name: missing) is None


class TestLibrtlsdrVersion:
    def test_read_from_the_file_homebrews_links_point_at(self, tmp_path: Path) -> None:
        (tmp_path / "librtlsdr.2.0.1.dylib").write_bytes(b"")
        (tmp_path / "librtlsdr.0.dylib").symlink_to("librtlsdr.2.0.1.dylib")
        (tmp_path / "librtlsdr.dylib").symlink_to("librtlsdr.0.dylib")

        assert librtlsdr_version(tmp_path / "librtlsdr.dylib") == "2.0.1"

    @pytest.mark.parametrize(
        "filename", ["librtlsdr.dylib", "librtlsdr..dylib", "librtlsdr.beta.dylib", "libusb.dylib", "librtlsdr.so.0"]
    )
    def test_none_when_the_name_carries_no_version(self, tmp_path: Path, filename: str) -> None:
        (tmp_path / filename).write_bytes(b"")

        assert librtlsdr_version(tmp_path / filename) is None

    def test_none_for_a_missing_file(self, tmp_path: Path) -> None:
        assert librtlsdr_version(tmp_path / "librtlsdr.2.0.1.dylib") is None


class TestLibrtlsdrCandidates:
    def test_an_explicit_path_is_the_only_candidate(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(ctypes_rtlsdr.ctypes.util, "find_library", lambda _name: "found-by-loader")

        assert librtlsdr_candidates("/custom/librtlsdr.dylib", [Path("/opt/homebrew/lib")]) == [
            "/custom/librtlsdr.dylib"
        ]

    def test_the_loaders_answer_then_the_usual_names_then_each_folder(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(ctypes_rtlsdr.ctypes.util, "find_library", lambda _name: "found-by-loader")

        assert librtlsdr_candidates(None, [Path("/opt/homebrew/lib"), Path("/usr/local/lib")]) == [
            "found-by-loader",
            "librtlsdr.so.0",
            "librtlsdr.so",
            "librtlsdr.0.dylib",
            "librtlsdr.dylib",
            "/opt/homebrew/lib/librtlsdr.dylib",
            "/usr/local/lib/librtlsdr.dylib",
        ]

    def test_without_the_loaders_answer_the_usual_names_lead(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(ctypes_rtlsdr.ctypes.util, "find_library", lambda _name: None)

        assert librtlsdr_candidates() == ["librtlsdr.so.0", "librtlsdr.so", "librtlsdr.0.dylib", "librtlsdr.dylib"]


class _FakeFunction:
    restype: Any = None
    argtypes: Any = None


class _FakeLibrary:
    def __init__(self) -> None:
        self.rtlsdr_get_device_count = _FakeFunction()
        self.rtlsdr_get_device_usb_strings = _FakeFunction()


class TestCtypesRtlSdrLibraryLoading:
    def test_loads_the_first_candidate_that_loads_and_says_which(self, monkeypatch: pytest.MonkeyPatch) -> None:
        tried: list[str] = []

        def fake_cdll(name: str) -> _FakeLibrary:
            tried.append(name)
            if name != "/usr/local/lib/librtlsdr.dylib":
                raise OSError(f"no {name}")
            return _FakeLibrary()

        monkeypatch.setattr(ctypes_rtlsdr.ctypes.util, "find_library", lambda _name: None)
        monkeypatch.setattr(ctypes_rtlsdr.ctypes, "CDLL", fake_cdll)

        library = CtypesRtlSdrLibrary(None, [Path("/opt/homebrew/lib"), Path("/usr/local/lib")])

        assert library.loaded_from == "/usr/local/lib/librtlsdr.dylib"
        assert tried[-2:] == ["/opt/homebrew/lib/librtlsdr.dylib", "/usr/local/lib/librtlsdr.dylib"]
        assert library._library.rtlsdr_get_device_count.restype is ctypes.c_uint32

    def test_an_explicit_path_that_does_not_load_is_named_in_the_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def missing(name: str) -> None:
            raise OSError(f"no {name}")

        monkeypatch.setattr(ctypes_rtlsdr.ctypes, "CDLL", missing)

        with pytest.raises(RtlSdrLibraryUnavailableError) as raised:
            CtypesRtlSdrLibrary("/wrong/librtlsdr.dylib")

        message = str(raised.value)
        assert "tried: /wrong/librtlsdr.dylib)" in message
        assert "brew install librtlsdr" in message
        assert "SDR_MANAGER_LOCAL_LIBRTLSDR_PATH" in message
        assert isinstance(raised.value.__cause__, OSError)
