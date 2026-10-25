"""The adapters `sdr-manager-local` uses when it runs as a native Mac process (ADR 0007).

Docker Desktop has no USB passthrough, so on a Mac SDR Manager runs outside
Docker: USB discovery reads `ioreg` instead of sysfs, librtlsdr and the rtl
tools come from Homebrew, and there is no hotspot. `container.py` picks these
when `sys.platform == "darwin"`.
"""
