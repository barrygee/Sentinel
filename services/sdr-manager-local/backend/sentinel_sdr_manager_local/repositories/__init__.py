"""Persistence layer — the only modules that write `sdr_devices` (Sentry architecture §4.4).

Its concrete `DeviceRepository` satisfies the Protocol frozen at
`sentinel_sdr_manager_local.interfaces.repository.DeviceRepository`; the
tables it writes are built by `database.py`.
"""
