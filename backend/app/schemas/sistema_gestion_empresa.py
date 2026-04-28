from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TipoSistemaGestion = Literal[
    "iso_9001",
    "iso_14001",
    "iso_45001",
    "ehs_propio",
    "plan_calidad_propio",
    "plan_ma_propio",
    "plan_seguridad_propio",
    "cae_construccion",
    "otros",
]


class SistemaGestionEmpresaBase(BaseModel):
    tipo: TipoSistemaGestion
    pdf_url: str | None = Field(default=None, max_length=1024)
    fecha_emision: date | None = None
    fecha_caducidad: date | None = None
    entidad_certificadora: str | None = Field(default=None, max_length=255)
    alcance: str | None = None
    notas: str | None = None


class SistemaGestionEmpresaCreate(SistemaGestionEmpresaBase):
    empresa_id: uuid.UUID


class SistemaGestionEmpresaUpdate(BaseModel):
    tipo: TipoSistemaGestion | None = None
    pdf_url: str | None = Field(default=None, max_length=1024)
    fecha_emision: date | None = None
    fecha_caducidad: date | None = None
    entidad_certificadora: str | None = Field(default=None, max_length=255)
    alcance: str | None = None
    notas: str | None = None


class SistemaGestionEmpresaRead(SistemaGestionEmpresaBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
