"""sdr-manager-remote's table: the SDR hosts it polls and leases dongles through.

It lives in the service's own database (`sdr-manager-remote.db`). It shares
core's declarative `Base`, so the test suite's in-process app creates it
with the rest of the schema once this module is imported. The radios themselves
are not this service's to store: they are a core setting (`sdr.radios`).
"""

from backend.database import Base
from sqlalchemy import Boolean, Column, Index, Integer, Text, UniqueConstraint, text


class RemoteSdrHost(Base):
    """A machine running sdr-manager-local that this Sentinel manages over the SDR Manager API.

    sdr-manager-local stays the source of truth for device configuration; this
    row holds only what is genuinely this Sentinel's own — how to reach one host
    and its console password — plus a small amount of poll telemetry. Device
    state itself is never persisted here; it is cached in memory by
    ``sentinel_sdr_manager_remote.services.host_poller`` and always read live
    through the client.
    """

    __tablename__ = "remote_sdr_hosts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=True)  # operator label; falls back to `address` when unset
    address = Column(Text, nullable=False)  # hostname or IPv4 address of the host
    port = Column(Integer, nullable=False, default=8000)
    auth_token = Column(Text, nullable=False, default="")  # the host's console password — write-only over the API
    enabled = Column(Boolean, nullable=False, default=True)  # whether the host poller polls this host
    created_at = Column(Integer, nullable=False)  # Unix ms
    last_seen_at = Column(Integer, nullable=True)  # Unix ms of the last successful poll
    last_error = Column(Text, nullable=True)  # human-readable reason for the last poll failure, if any
    # The row for this machine's own sdr-manager-local, which the service keeps
    # in step with core's registry rather than the operator adding it by hand.
    is_local = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    # How the client proves itself: `password` signs in with the console
    # password; `service` (this machine only) presents the service bearer.
    auth_mode = Column(Text, nullable=False, default="password", server_default=text("'password'"))

    __table_args__ = (
        UniqueConstraint("address", "port", name="uq_remote_sdr_hosts_address_port"),
        # At most one "this machine" row, however its address changes.
        Index(
            "uq_remote_sdr_hosts_one_local",
            "is_local",
            unique=True,
            sqlite_where=text("is_local = 1"),
        ),
    )
