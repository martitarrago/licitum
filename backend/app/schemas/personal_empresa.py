from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

RolPersonal = Literal[
    "jefe_obra",
    "encargado",
    "tecnico_prl",
    "tecnico_calidad",
    "tecnico_ma",
    "ingeniero",
    "arquitecto",
    "otros",
]


class PersonalEmpresaBase(BaseModel):
    nombre_completo: str = Field(min_length=1, max_length=255)
    dni: str | None = Field(default=None, max_length=16)
    rol: RolPersonal
    titulacion: str | None = Field(default=None, max_length=255)
    anios_experiencia: int | None = Field(default=None, ge=0, le=70)
    cv_pdf_url: str | None = Field(default=None, max_length=1024)
    certificados_formacion: list[Any] | None = None
    obras_participadas: list[uuid.UUID] | None = None
    activo: bool = True
    notas: str | None = None


class PersonalEmpresaCreate(PersonalEmpresaBase):
    empresa_id: uuid.UUID


class PersonalEmpresaUpdate(BaseModel):
    nombre_completo: str | None = Field(default=None, min_length=1, max_length=255)
    dni: str | None = Field(default=None, max_length=16)
    rol: RolPersonal | None = None
    titulacion: str | None = Field(default=None, max_length=255)
    anios_experiencia: int | None = Field(default=None, ge=0, le=70)
    cv_pdf_url: str | None = Field(default=None, max_length=1024)
    certificados_formacion: list[Any] | None = None
    obras_participadas: list[uuid.UUID] | None = None
    activo: bool | None = None
    notas: str | None = None


class PersonalEmpresaRead(PersonalEmpresaBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
