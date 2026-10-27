"""Finding Homebrew's librtlsdr and rtl tools on a Mac.

A LaunchAgent starts with a bare `PATH` (`/usr/bin:/bin:/usr/sbin:/sbin`), so
`rtl_tcp` is found on `PATH` when it is there and otherwise in Homebrew's
prefixes: `/opt/homebrew` on Apple silicon, `/usr/local` on Intel.
"""

from __future__ import annotations

import shutil
from collections.abc import Callable, Sequence
from pathlib import Path

HOMEBREW_PREFIXES: tuple[Path, ...] = (Path("/opt/homebrew"), Path("/usr/local"))
"""Apple silicon's prefix first, then Intel's."""

LIBRTLSDR_FILENAME = "librtlsdr.dylib"


def homebrew_library_directories(prefixes: Sequence[Path] = HOMEBREW_PREFIXES) -> tuple[Path, ...]:
    """Every Homebrew `lib/` folder librtlsdr may be installed in."""
    return tuple(prefix / "lib" for prefix in prefixes)


def find_homebrew_tool(
    configured_path: str,
    prefixes: Sequence[Path] = HOMEBREW_PREFIXES,
    which: Callable[[str], str | None] = shutil.which,
) -> str:
    """Where `configured_path` (`rtl_tcp`, `rtl_eeprom`, or a full path) really is.

    A path with a folder in it is the operator's choice and is used as given.
    A bare name is looked up on `PATH`, then in each Homebrew `bin/`. When it is
    in neither, the bare name is returned, so the spawn fails with the usual
    "not found" a status check can explain.
    """
    if "/" in configured_path:
        return configured_path
    found = which(configured_path)
    if found:
        return found
    for prefix in prefixes:
        candidate = prefix / "bin" / configured_path
        if candidate.is_file():
            return str(candidate)
    return configured_path


def find_homebrew_executable(
    name: str,
    prefixes: Sequence[Path] = HOMEBREW_PREFIXES,
    which: Callable[[str], str | None] = shutil.which,
) -> str | None:
    """`find_homebrew_tool` for a status check: `None` when the tool is nowhere to be found."""
    resolved = find_homebrew_tool(name, prefixes, which)
    return resolved if "/" in resolved and Path(resolved).is_file() else None


def librtlsdr_version(library_path: Path) -> str | None:
    """The librtlsdr version a dylib path names, e.g. `2.0.1`, or `None` when it names none.

    Homebrew links `librtlsdr.dylib` → `librtlsdr.0.dylib` → `librtlsdr.2.0.1.dylib`,
    so the version is read from the file the links finally point at.
    """
    try:
        filename = library_path.resolve(strict=True).name
    except OSError:
        return None
    middle = filename.removeprefix("librtlsdr.").removesuffix(".dylib")
    if middle == filename or not middle or not all(part.isdigit() for part in middle.split(".")):
        return None
    return middle
