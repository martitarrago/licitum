from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PropiedadMaquinaria = Literal["propia", "leasing", "alquiler_largo_plazo"]


class MaquinariaEmpresaBase(BaseModel):
    tipo: str = Field(min_length=1, max_length=64)
    marca: str | None = Field(default=None, max_length=128)
    modelo: str | None = Field(default=None, max_length=128)
    anio: int | None = Field(default=None, ge=1900, le=2100)
    matricula: str | None = Field(default=None, max_length=32)
    propiedad: PropiedadMaquinaria = "propia"
    itv_caducidad: date | None = None
    notas: str | None = None


class MaquinariaEmpresaCreate(MaquinariaEmpresaBase):
    empresa_id: uuid.UUID


class MaquinariaEmpresaUpdate(BaseModel):
    tipo: str | None = Field(default=None, min_length=1, max_length=64)
    marca: str | None = Field(default=None, max_length=128)
    modelo: str | None = Field(default=None, max_length=128)
    anio: int | None = Field(default=None, ge=1900, le=2100)
    matricula: str | None = Field(default=None, max_length=32)
    propiedad: PropiedadMaquinaria | None = None
    itv_caducidad: date | None = None
    notas: str | None = None


class MaquinariaEmpresaRead(MaquinariaEmpresaBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
