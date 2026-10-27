"""Real `RtlSdrLibrary` binding `librtlsdr` via ctypes (Sentry architecture §4.2, Sentry ADR-0003).

Binds exactly the two entry points SDR Manager needs to resolve a spawn-time
`-d <index>`: `rtlsdr_get_device_count` and `rtlsdr_get_device_usb_strings`.
Must fail gracefully and diagnosably when `librtlsdr` is absent — a Mac
without Homebrew's `librtlsdr`, say — rather than crashing the whole process
at import time.
"""

from __future__ import annotations

import ctypes
import ctypes.util
from collections.abc import Sequence
from pathlib import Path

from sentinel_sdr_manager_local.interfaces.types import RtlSdrUsbStrings

_USB_STRING_BUFFER_SIZE = 256
"""librtlsdr's documented buffer size for each of manufacturer/product/serial."""


class RtlSdrLibraryUnavailableError(RuntimeError):
    """Raised when `librtlsdr` cannot be located or loaded on this system.

    Distinct from a plain `OSError` so callers (and `services.supervisor`'s
    `driver_conflict`/`index_unresolved` handling) can catch it specifically
    and report a diagnosable cause rather than a bare ctypes traceback.
    """


def decode_usb_string_buffer(buffer: bytes) -> str:
    """Decode one of librtlsdr's fixed-size, NUL-terminated USB string buffers.

    A pure helper, extracted so buffer-to-string decoding is unit-testable
    without a real `librtlsdr.so` (Sentry architecture §12.9): truncates at the
    first NUL and decodes as UTF-8, replacing any undecodable byte rather
    than raising — a corrupt EEPROM string must not crash enumeration.
    """
    terminator = buffer.find(b"\x00")
    raw = buffer if terminator == -1 else buffer[:terminator]
    return raw.decode("utf-8", errors="replace")


def librtlsdr_candidates(library_path: str | None = None, search_directories: Sequence[Path] = ()) -> list[str]:
    """Every name or path `CtypesRtlSdrLibrary` tries, in order.

    An explicit `library_path` (`SDR_MANAGER_LOCAL_LIBRTLSDR_PATH`) is the only
    candidate: the operator chose that file, so silently loading another would
    hide their mistake. Otherwise the loader's own lookup comes first, then the
    usual Linux and macOS names, then `<directory>/librtlsdr.dylib` in each
    `search_directories` — Homebrew's `lib/` folders on a Mac, which a
    LaunchAgent's process doesn't search by itself.
    """
    if library_path:
        return [library_path]
    candidate_names = ["librtlsdr.so.0", "librtlsdr.so", "librtlsdr.0.dylib", "librtlsdr.dylib"]
    resolved = ctypes.util.find_library("rtlsdr")
    if resolved:
        candidate_names.insert(0, resolved)
    candidate_names.extend(str(directory / "librtlsdr.dylib") for directory in search_directories)
    return candidate_names


def _load_librtlsdr(candidate_names: list[str]) -> tuple[ctypes.CDLL, str]:
    """Load the first of `candidate_names` that loads, and say which one it was.

    Raises `RtlSdrLibraryUnavailableError` with a diagnosable message
    (rather than letting a bare `OSError` propagate) when none can be
    loaded — this is the single untestable edge in this adapter (architecture
    §12.9): it requires the real shared library to be installed.
    """
    last_error: OSError | None = None
    for name in candidate_names:
        try:
            return ctypes.CDLL(name), name
        except OSError as error:  # pragma: no cover - requires the real library absent/present
            last_error = error
            continue
    raise RtlSdrLibraryUnavailableError(
        "librtlsdr could not be loaded (tried: "
        f"{', '.join(candidate_names)}). Install librtlsdr0 (Debian/Raspbian: "
        "`apt install librtlsdr0`; macOS: `brew install librtlsdr`), or set "
        "SDR_MANAGER_LOCAL_LIBRTLSDR_PATH to the library file."
    ) from last_error


class CtypesRtlSdrLibrary:
    """Real `RtlSdrLibrary` binding `librtlsdr_get_device_count`/`_get_device_usb_strings`.

    Construction is where the `CDLL` load and symbol binding happen, so a
    missing `librtlsdr` fails at composition-root time with a clear message
    rather than deep inside a request handler.
    """

    def __init__(self, library_path: str | None = None, search_directories: Sequence[Path] = ()) -> None:
        self._library, self.loaded_from = _load_librtlsdr(librtlsdr_candidates(library_path, search_directories))
        self._library.rtlsdr_get_device_count.restype = ctypes.c_uint32
        self._library.rtlsdr_get_device_count.argtypes = []
        self._library.rtlsdr_get_device_usb_strings.restype = ctypes.c_int
        self._library.rtlsdr_get_device_usb_strings.argtypes = [
            ctypes.c_uint32,
            ctypes.c_char_p,
            ctypes.c_char_p,
            ctypes.c_char_p,
        ]

    def is_available(self) -> bool:
        """Always `True`: reaching this point means `librtlsdr` loaded successfully."""
        return True

    def device_count(self) -> int:
        """Return `rtlsdr_get_device_count()` as a plain Python int."""
        return int(self._library.rtlsdr_get_device_count())

    def usb_strings(self, index: int) -> RtlSdrUsbStrings:
        """Return the decoded manufacturer/product/serial strings for `index`.

        Raises `IndexError` if librtlsdr reports the call failed (a negative
        return code), which is how it signals an out-of-range index.
        """
        manufacturer_buf = ctypes.create_string_buffer(_USB_STRING_BUFFER_SIZE)
        product_buf = ctypes.create_string_buffer(_USB_STRING_BUFFER_SIZE)
        serial_buf = ctypes.create_string_buffer(_USB_STRING_BUFFER_SIZE)
        result = self._library.rtlsdr_get_device_usb_strings(
            ctypes.c_uint32(index), manufacturer_buf, product_buf, serial_buf
        )
        if result != 0:
            raise IndexError(f"rtlsdr_get_device_usb_strings failed for index {index}")
        return RtlSdrUsbStrings(
            manufacturer=decode_usb_string_buffer(manufacturer_buf.raw),
            product=decode_usb_string_buffer(product_buf.raw),
            serial=decode_usb_string_buffer(serial_buf.raw),
        )
