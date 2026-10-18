"""The documentation set the docs service reads from disk (sentinel_docs.library).

These pin which files make up the library (docs/**/*.md + CONTRIBUTING.md, never
docs/plans/), its shape for the shell, and that the image resolver can never be
used to read a file outside docs/images/.
"""

import json
from pathlib import Path

import pytest
from backend.config import settings

from sentinel_docs import library
from sentinel_docs.library import (
    DocsSourceMissing,
    docs_source_root,
    image_files,
    read_library,
    resolve_image,
)

NAVIGATION = [{"title": "START", "items": [{"title": "Index", "file": "docs/index.md"}]}]


def write_file(path: Path, content: str | bytes = "") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, bytes):
        path.write_bytes(content)
    else:
        path.write_text(content, encoding="utf-8")
    return path


@pytest.fixture
def source_root(tmp_path: Path) -> Path:
    """A minimal checkout: a menu, a page, a nested page, a plan and an image."""
    write_file(tmp_path / "docs" / "nav.json", json.dumps(NAVIGATION))
    write_file(tmp_path / "docs" / "index.md", "# Index\n")
    write_file(tmp_path / "docs" / "development" / "setup.md", "# Setup\n")
    write_file(tmp_path / "docs" / "plans" / "secret-plan.md", "# Plan\n")
    write_file(tmp_path / "docs" / "images" / "map.png", b"\x89PNG")
    return tmp_path


class TestDocsSourceRoot:
    def test_uses_the_configured_directory(self, monkeypatch, tmp_path: Path):
        monkeypatch.setattr(settings, "docs_source_directory", str(tmp_path))

        assert docs_source_root() == tmp_path.resolve()

    def test_defaults_to_the_checkouts_root(self, monkeypatch):
        monkeypatch.setattr(settings, "docs_source_directory", "")

        root = docs_source_root()

        assert (root / "docs" / "nav.json").is_file()
        assert (root / "services" / "docs" / "backend" / "sentinel_docs" / "library.py").is_file()


class TestReadLibrary:
    def test_returns_the_menu_pages_and_images(self, source_root: Path):
        result = read_library(source_root)

        assert result == {
            "navigation": NAVIGATION,
            "documents": {
                "docs/development/setup.md": "# Setup\n",
                "docs/index.md": "# Index\n",
            },
            "images": ["docs/images/map.png"],
        }

    def test_leaves_out_the_plans_folder(self, source_root: Path):
        assert not any(name.startswith("docs/plans") for name in read_library(source_root)["documents"])

    def test_a_file_merely_named_like_the_plans_folder_is_kept(self, source_root: Path):
        write_file(source_root / "docs" / "plans-overview.md", "# Overview\n")

        assert "docs/plans-overview.md" in read_library(source_root)["documents"]

    def test_includes_contributing_when_present(self, source_root: Path):
        write_file(source_root / "CONTRIBUTING.md", "# Contributing\n")

        assert read_library(source_root)["documents"]["CONTRIBUTING.md"] == "# Contributing\n"

    def test_only_markdown_files_are_pages(self, source_root: Path):
        write_file(source_root / "docs" / "notes.txt", "not a page")

        assert "docs/notes.txt" not in read_library(source_root)["documents"]

    def test_reads_edits_on_the_next_call(self, source_root: Path):
        read_library(source_root)
        write_file(source_root / "docs" / "index.md", "# Edited\n")

        assert read_library(source_root)["documents"]["docs/index.md"] == "# Edited\n"

    def test_a_missing_menu_raises(self, source_root: Path):
        (source_root / "docs" / "nav.json").unlink()

        with pytest.raises(DocsSourceMissing, match="nav.json"):
            read_library(source_root)

    def test_an_unparseable_menu_raises(self, source_root: Path):
        write_file(source_root / "docs" / "nav.json", "{not json")

        with pytest.raises(DocsSourceMissing):
            read_library(source_root)

    def test_a_root_without_docs_raises(self, tmp_path: Path):
        with pytest.raises(DocsSourceMissing):
            read_library(tmp_path)


class TestImageFiles:
    def test_lists_images_recursively_and_sorted(self, source_root: Path):
        write_file(source_root / "docs" / "images" / "sdr" / "panel.JPG", b"jpg")
        write_file(source_root / "docs" / "images" / "diagram.svg", "<svg/>")

        assert image_files(source_root) == [
            "docs/images/diagram.svg",
            "docs/images/map.png",
            "docs/images/sdr/panel.JPG",
        ]

    def test_skips_files_that_are_not_images(self, source_root: Path):
        write_file(source_root / "docs" / "images" / "README.md", "# not an image")

        assert image_files(source_root) == ["docs/images/map.png"]

    def test_no_images_folder_means_no_images(self, tmp_path: Path):
        assert image_files(tmp_path) == []


class TestResolveImage:
    def test_resolves_an_image_under_docs_images(self, source_root: Path):
        assert resolve_image(source_root, "map.png") == (source_root / "docs" / "images" / "map.png").resolve()

    def test_a_missing_image_is_none(self, source_root: Path):
        assert resolve_image(source_root, "absent.png") is None

    def test_a_directory_is_none(self, source_root: Path):
        (source_root / "docs" / "images" / "folder.png").mkdir()

        assert resolve_image(source_root, "folder.png") is None

    def test_refuses_a_non_image_suffix(self, source_root: Path):
        write_file(source_root / "docs" / "images" / "notes.md", "# notes")

        assert resolve_image(source_root, "notes.md") is None

    def test_refuses_parent_traversal(self, source_root: Path):
        write_file(source_root / "secret.png", b"secret")

        assert resolve_image(source_root, "../../secret.png") is None

    def test_refuses_an_absolute_path(self, source_root: Path):
        outside = write_file(source_root / "outside.png", b"outside")

        assert resolve_image(source_root, str(outside)) is None

    def test_refuses_a_symlink_pointing_out(self, source_root: Path):
        outside = write_file(source_root / "outside.png", b"outside")
        (source_root / "docs" / "images" / "link.png").symlink_to(outside)

        assert resolve_image(source_root, "link.png") is None


def test_the_module_reads_settings_at_call_time(monkeypatch, tmp_path: Path):
    """The root is not cached at import, so DOCS_SOURCE_DIRECTORY set late still applies."""
    monkeypatch.setattr(library.settings, "docs_source_directory", str(tmp_path))

    assert docs_source_root() == tmp_path.resolve()
