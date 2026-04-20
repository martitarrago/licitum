from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import EstadoCertificado


class CertificadoObraBase(BaseModel):
    titulo: str = Field(min_length=1, max_length=512)
    organismo: str = Field(min_length=1, max_length=255)
    importe_adjudicacion: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    fecha_inicio: date
    fecha_fin: date
    cpv_codes: list[str] = Field(default_factory=list)
    clasificacion_grupo: str | None = Field(default=None, max_length=8)
    clasificacion_subgrupo: str | None = Field(default=None, max_length=8)
    numero_expediente: str = Field(min_length=1, max_length=128)


class CertificadoObraUpdate(BaseModel):
    """Campos editables por revisión humana. `estado` se cambia solo vía
    POST /validar y /rechazar. `pdf_url` es inmutable una vez subido."""

    titulo: str | None = Field(default=None, min_length=1, max_length=512)
    organismo: str | None = Field(default=None, min_length=1, max_length=255)
    importe_adjudicacion: Decimal | None = Field(
        default=None, ge=0, max_digits=14, decimal_places=2
    )
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    cpv_codes: list[str] | None = None
    clasificacion_grupo: str | None = Field(default=None, max_length=8)
    clasificacion_subgrupo: str | None = Field(default=None, max_length=8)
    numero_expediente: str | None = Field(default=None, min_length=1, max_length=128)
    extracted_data: dict[str, Any] | None = None


class CertificadoObraListItem(CertificadoObraBase):
    """Shape para listados — omite `extracted_data` (JSONB pesado)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    estado: EstadoCertificado
    pdf_url: str
    extraction_error: str | None = None
    created_at: datetime
    updated_at: datetime


class CertificadoObraRead(CertificadoObraListItem):
    """Shape para detalle — incluye `extracted_data`."""

    extracted_data: dict[str, Any] = Field(default_factory=dict)
