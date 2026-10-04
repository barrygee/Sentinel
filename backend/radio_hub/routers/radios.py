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
from backend.radio_hub import radios as radio_registry
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

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
    # Sentry mirror fields (ADR-0009). `sentry_host_id` is None for a radio the
    # operator typed in by hand — that radio must keep behaving exactly as it
    # does today. When set, this radio mirrors one device on that Sentry host,
    # identified by `sentry_device_id` ("serial:<value>" or "usb:<path>").
    sentry_host_id: int | None = None
    sentry_device_id: str | None = None
    notes: str = ""
    antenna: str = ""
    visibility: str = "public"

    @field_validator("sentry_device_id")
    @classmethod
    def _bound_sentry_device_id(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 256:
            raise ValueError("sentry_device_id too long (max 256 characters)")
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


@router.get("/api/sdr/radios")
async def list_radios(db: AsyncSession = Depends(get_db)):
    radios = await radio_registry.get_radios(db)
    for radio in radios:
        available, reason = radio_registry.device_availability(radio)
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
            radios[i] = {**radio, **body.model_dump()}
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
