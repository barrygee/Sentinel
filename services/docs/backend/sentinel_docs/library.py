"""The documentation set the docs service serves: the repo's own markdown, read from disk.

The in-app docs are the repo's `docs/**/*.md` plus the root `CONTRIBUTING.md`,
so the pages in the app and the files on GitHub are the same text. `docs/plans/`
is working design notes and is left out, as is the changelog. The menu is
`docs/nav.json`; the shell validates it against the files (`buildDocsLibrary`
in `frontend/vue/src/docs/docsNavigation.ts`), exactly as it did when the
markdown was bundled into the SPA.

Everything is read on each request: the set is small (about 140 KB of text),
and it means an edit to a page shows on the next load, with no rebuild or
restart — the compose service bind-mounts the checkout's `docs/`.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from backend.config import settings

DOCS_FOLDER = "docs"
CONTRIBUTING_FILE = "CONTRIBUTING.md"
NAVIGATION_FILE = f"{DOCS_FOLDER}/nav.json"
IMAGES_FOLDER = f"{DOCS_FOLDER}/images"
# Design notes, not user documentation (the SPA's glob left them out too).
EXCLUDED_FOLDERS = (f"{DOCS_FOLDER}/plans",)
IMAGE_SUFFIXES = frozenset({".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"})


class DocsSourceMissing(RuntimeError):
    """The docs folder or its menu is not where the service was told to find it."""


def docs_source_root() -> Path:
    """The folder holding `docs/` and `CONTRIBUTING.md`: `DOCS_SOURCE_DIRECTORY`, else the checkout's root."""
    if settings.docs_source_directory:
        return Path(settings.docs_source_directory).resolve()
    # services/docs/backend/sentinel_docs/library.py → the repo root (/app in the image).
    return Path(__file__).resolve().parents[4]


def _repo_relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _is_excluded(repo_file: str) -> bool:
    return any(repo_file == folder or repo_file.startswith(f"{folder}/") for folder in EXCLUDED_FOLDERS)


def _markdown_files(root: Path) -> list[Path]:
    files = [path for path in (root / DOCS_FOLDER).rglob("*.md") if path.is_file()]
    contributing = root / CONTRIBUTING_FILE
    if contributing.is_file():
        files.append(contributing)
    return sorted(path for path in files if not _is_excluded(_repo_relative(path, root)))


def image_files(root: Path) -> list[str]:
    """Every image under `docs/images/`, as repo-relative paths (`docs/images/x.png`)."""
    images_directory = root / IMAGES_FOLDER
    if not images_directory.is_dir():
        return []
    return sorted(
        _repo_relative(path, root)
        for path in images_directory.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
    )


def read_library(root: Path) -> dict[str, Any]:
    """The whole documentation set: the menu, every page's markdown and the image list.

    Shaped for the shell (`frontend/vue/src/docs/docsSources.ts`): `navigation`
    is `docs/nav.json` as parsed, `documents` maps each repo-relative markdown
    file to its text, and `images` lists the files `GET …/images/<path>` serves.

    Raises `DocsSourceMissing` when `docs/nav.json` cannot be read.
    """
    navigation_file = root / NAVIGATION_FILE
    try:
        navigation = json.loads(navigation_file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise DocsSourceMissing(f"cannot read {navigation_file}: {error}") from error
    documents = {_repo_relative(path, root): path.read_text(encoding="utf-8") for path in _markdown_files(root)}
    return {"navigation": navigation, "documents": documents, "images": image_files(root)}


def resolve_image(root: Path, image_path: str) -> Path | None:
    """The file `image_path` (relative to `docs/images/`) names, or None when it is not a served image.

    Refuses anything that resolves outside `docs/images/` (`..`, an absolute
    path, a symlink pointing out) and anything that is not an image by suffix,
    so the route can never be used to read another file in the container.
    """
    images_directory = (root / IMAGES_FOLDER).resolve()
    candidate = (images_directory / image_path).resolve()
    if not candidate.is_relative_to(images_directory) or candidate.suffix.lower() not in IMAGE_SUFFIXES:
        return None
    return candidate if candidate.is_file() else None
