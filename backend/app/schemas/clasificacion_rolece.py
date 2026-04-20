from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class ClasificacionRoleceBase(BaseModel):
    grupo: str = Field(min_length=1, max_length=8)
    subgrupo: str = Field(min_length=1, max_length=8)
    categoria: str = Field(min_length=1, max_length=4)
    fecha_obtencion: date
    fecha_caducidad: date
    activa: bool = True


class ClasificacionRoleceCreate(ClasificacionRoleceBase):
    empresa_id: uuid.UUID


class ClasificacionRoleceUpdate(BaseModel):
    grupo: str | None = None
    subgrupo: str | None = None
    categoria: str | None = None
    fecha_obtencion: date | None = None
    fecha_caducidad: date | None = None
    activa: bool | None = None


class ClasificacionRoleceRead(ClasificacionRoleceBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
