"""Radio hub — radio CRUD, backed by the `sdr.radios` setting.

GET    /api/sdr/radios                  — list configured SDR radios
POST   /api/sdr/radios                  — add a new radio
PUT    /api/sdr/radios/{id}             — update a radio
DELETE /api/sdr/radios/{id}             — delete a radio
"""

from __future__ import annotations

import logging

from backend.cache import now_ms
from backend.database import get_db
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel_radio import radios as radio_registry

logger = logging.getLogger(__name__)

router = APIRouter(tags=["sdr"])


class RadioIn(BaseModel):
    name: str
    host: str
    port: int = 1234
    description: str = ""
    enabled: bool = True
    bandwidth: int | None = None
    rf_gain: float | None = None
    agc: bool | None = None
    # SDR host mirror fields (ADR 0007). `sdr_manager_host_id` is None for a radio the
    # operator typed in by hand — that radio must keep behaving exactly as it
    # does today. When set, this radio mirrors one device on that SDR host,
    # identified by `sdr_manager_device_id` ("serial:<value>" or "usb:<path>").
    sdr_manager_host_id: int | None = None
    sdr_manager_device_id: str | None = None
    notes: str = ""
    antenna: str = ""
    visibility: str = "public"
    # Where a radio added by IP and port is, so maps can show it like an SDR
    # host's site. Optional, and both or neither. A radio mirroring an SDR host's
    # device has its host's position instead and leaves these unset.
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @field_validator("sdr_manager_device_id")
    @classmethod
    def _bound_sdr_manager_device_id(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 256:
            raise ValueError("sdr_manager_device_id too long (max 256 characters)")
        return value

    @field_validator("notes", "antenna")
    @classmethod
    def _bound_text(cls, value: str) -> str:
        if len(value) > 2000:
            raise ValueError("text too long (max 2000 characters)")
        return value

    @field_validator("visibility")
    @classmethod
    def _validate_visibility(cls, value: str) -> str:
        if value not in ("public", "private"):
            raise ValueError("visibility must be 'public' or 'private'")
        return value

    @model_validator(mode="after")
    def _both_coordinates_or_neither(self) -> RadioIn:
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("give both latitude and longitude, or neither")
        return self

    def stored_fields(self) -> dict:
        """What a save writes. A body that leaves the position out keeps the stored one.

        Settings that edit other fields (gain, bandwidth, an SDR host's mirror
        sync) send no position, and must not wipe one the operator set.
        """
        fields = self.model_dump()
        if not POSITION_FIELDS & self.model_fields_set:
            for name in POSITION_FIELDS:
                fields.pop(name)
        return fields


POSITION_FIELDS = frozenset({"latitude", "longitude"})


@router.get("/api/sdr/radios")
async def list_radios(db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    for radio in radios:
        available, reason = await radio_registry.device_availability(radio)
        radio["device_available"] = available
        radio["unavailable_reason"] = reason
    return JSONResponse(radios)


@router.post("/api/sdr/radios", status_code=201)
async def create_radio(body: RadioIn, db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    new_id = max((r.get("id", 0) for r in radios if isinstance(r.get("id"), int)), default=0) + 1
    new_radio = {"id": new_id, "created_at": now_ms(), **body.model_dump()}
    radios.append(new_radio)
    await radio_registry.save_radios(db, radios)
    return JSONResponse(new_radio, status_code=201)


@router.put("/api/sdr/radios/{radio_id}")
async def update_radio(radio_id: int, body: RadioIn, db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    for i, radio in enumerate(radios):
        if radio.get("id") == radio_id:
            radios[i] = {**radio, **body.stored_fields()}
            await radio_registry.save_radios(db, radios)
            return JSONResponse(radios[i])
    raise HTTPException(404, "Radio not found")


@router.delete("/api/sdr/radios/{radio_id}", status_code=204)
async def delete_radio(radio_id: int, db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    new_radios = [radio for radio in radios if radio.get("id") != radio_id]
    if len(new_radios) == len(radios):
        raise HTTPException(404, "Radio not found")
    await radio_registry.save_radios(db, new_radios)
