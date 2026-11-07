"""The list of addresses allowed to use private dongles."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator

from sentinel_sdr_manager_local.services.private_access import MAX_ALLOWED_ADDRESSES, normalize_allowed_address

MAX_ADDRESS_LENGTH = 45
"""The longest text form of an IPv6 address."""


class PrivateAccessState(BaseModel):
    """`GET`/`PUT /api/private-access`."""

    model_config = ConfigDict(frozen=True)

    addresses: list[str] = Field(description="Addresses, besides this machine, that may use private dongles")


class PrivateAccessUpdate(BaseModel):
    """The whole list, replacing what is stored."""

    model_config = ConfigDict(extra="forbid")

    addresses: list[str] = Field(max_length=MAX_ALLOWED_ADDRESSES)

    @field_validator("addresses")
    @classmethod
    def normalize_addresses(cls, addresses: list[str]) -> list[str]:
        """Canonical forms, without duplicates, keeping the order given."""
        if any(len(address) > MAX_ADDRESS_LENGTH for address in addresses):
            raise ValueError("That is too long to be an address.")
        return list(dict.fromkeys(normalize_allowed_address(address) for address in addresses))
