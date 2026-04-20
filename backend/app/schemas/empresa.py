from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmpresaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=255)
    cif: str = Field(min_length=8, max_length=16)
    email: EmailStr


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    nombre: str | None = Field(default=None, min_length=1, max_length=255)
    cif: str | None = Field(default=None, min_length=8, max_length=16)
    email: EmailStr | None = None


class EmpresaRead(EmpresaBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
