"""SDR Manager for SDR hosts on other machines (ADR 0007).

Moved out of the radio hub: the hosts this Sentinel manages, the SDR Manager
API client it manages them with, the poller that caches their live status and
the bus responders that lease their dongles to Air. The hub keeps the streams.
"""
