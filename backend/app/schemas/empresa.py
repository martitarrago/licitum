from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

TamanoPyme = Literal["micro", "pequena", "mediana", "grande"]


class EmpresaBase(BaseModel):
    nombre: str = Field(min_length=1, max_length=255)
    cif: str = Field(min_length=8, max_length=16)
    email: EmailStr


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    # Identificación
    nombre: str | None = Field(default=None, min_length=1, max_length=255)
    cif: str | None = Field(default=None, min_length=8, max_length=16)
    email: EmailStr | None = None
    telefono: str | None = Field(default=None, max_length=32)
    iae: str | None = Field(default=None, max_length=16)
    cnae: str | None = Field(default=None, max_length=16)
    tamano_pyme: TamanoPyme | None = None

    # Dirección
    direccion_calle: str | None = Field(default=None, max_length=255)
    direccion_codigo_postal: str | None = Field(default=None, max_length=16)
    direccion_ciudad: str | None = Field(default=None, max_length=128)
    direccion_provincia: str | None = Field(default=None, max_length=64)
    direccion_provincia_codigo: str | None = Field(
        default=None, min_length=2, max_length=2
    )
    direccion_pais: str | None = Field(default=None, max_length=64)

    # Representante legal
    representante_nombre: str | None = Field(default=None, max_length=255)
    representante_nif: str | None = Field(default=None, max_length=16)
    representante_cargo: str | None = Field(default=None, max_length=128)

    # Datos del poder notarial (DEUC II.B)
    poder_notario: str | None = Field(default=None, max_length=255)
    poder_fecha_escritura: date | None = None
    poder_protocolo: str | None = Field(default=None, max_length=64)
    poder_registro_mercantil: str | None = Field(default=None, max_length=255)

    # Código de cuenta de cotización principal
    ccc_seguridad_social: str | None = Field(default=None, max_length=32)

    # Volumen de negocio + plantilla
    volumen_negocio_n: Decimal | None = Field(default=None, ge=0)
    volumen_negocio_n1: Decimal | None = Field(default=None, ge=0)
    volumen_negocio_n2: Decimal | None = Field(default=None, ge=0)
    plantilla_media: int | None = Field(default=None, ge=0)


class EmpresaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    cif: str
    email: str
    telefono: str | None = None
    iae: str | None = None
    cnae: str | None = None
    tamano_pyme: str | None = None
    direccion_calle: str | None = None
    direccion_codigo_postal: str | None = None
    direccion_ciudad: str | None = None
    direccion_provincia: str | None = None
    direccion_provincia_codigo: str | None = None
    direccion_pais: str | None = None
    representante_nombre: str | None = None
    representante_nif: str | None = None
    representante_cargo: str | None = None
    poder_notario: str | None = None
    poder_fecha_escritura: date | None = None
    poder_protocolo: str | None = None
    poder_registro_mercantil: str | None = None
    ccc_seguridad_social: str | None = None
    volumen_negocio_n: Decimal | None = None
    volumen_negocio_n1: Decimal | None = None
    volumen_negocio_n2: Decimal | None = None
    plantilla_media: int | None = None
    created_at: datetime
    updated_at: datetime
