from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.core.enums import EstadoCertificado


class CertificadoObraUpdate(BaseModel):
    """Campos editables por revisión humana."""

    titulo: str | None = Field(default=None, min_length=1, max_length=512)
    organismo: str | None = Field(default=None, min_length=1, max_length=255)
    importe_adjudicacion: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    cpv_codes: list[str] | None = None
    clasificacion_grupo: str | None = Field(default=None, max_length=8)
    clasificacion_subgrupo: str | None = Field(default=None, max_length=8)
    numero_expediente: str | None = Field(default=None, min_length=1, max_length=128)
    extracted_data: dict[str, Any] | None = None
    porcentaje_ute: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    contratista_principal: bool | None = None
    es_valido_solvencia: bool | None = None
    razon_invalidez: str | None = None
    destacado_sobre_b: bool | None = None
    narrativa: str | None = None


class CertificadoObraListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    titulo: str | None = None
    organismo: str | None = None
    importe_adjudicacion: Decimal | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    cpv_codes: list[str] = Field(default_factory=list)
    clasificacion_grupo: str | None = None
    clasificacion_subgrupo: str | None = None
    numero_expediente: str | None = None
    estado: EstadoCertificado
    pdf_url: str | None = None
    extraction_error: str | None = None
    tipo_documento: str | None = None
    es_valido_solvencia: bool | None = None
    razon_invalidez: str | None = None
    porcentaje_ute: Decimal | None = None
    contratista_principal: bool = True
    destacado_sobre_b: bool = False
    narrativa: str | None = None
    created_at: datetime
    updated_at: datetime


class CertificadoObraRead(CertificadoObraListItem):
    extracted_data: dict[str, Any] = Field(default_factory=dict)
