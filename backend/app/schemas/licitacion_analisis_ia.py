from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class LicitacionAnalisisIARead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    licitacion_id: uuid.UUID
    pdf_url: str | None
    estado: Literal["pendiente", "procesando", "completado", "fallido"]
    extracted_data: dict[str, Any]
    idioma_detectado: str | None
    confianza_global: Decimal | None
    error_mensaje: str | None
    procesado_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PliegoListItem(BaseModel):
    """Item ligero para el listing /pliegos — sin extracted_data."""

    licitacion_id: uuid.UUID
    expediente: str
    titulo: str | None
    organismo: str | None
    importe_licitacion: Decimal | None
    fecha_limite: datetime | None
    estado: str
    idioma_detectado: str | None
    confianza_global: Decimal | None
    procesado_at: datetime | None
    created_at: datetime
    # Veredicto resumen extraído del extracted_data si está completado;
    # None mientras procesa o si falló.
    veredicto_recomendado: str | None = None
    banderas_rojas_count: int | None = None


class BanderaRoja(BaseModel):
    tipo: str
    descripcion: str


class RecomendacionRead(BaseModel):
    veredicto: Literal["ir", "ir_con_riesgo", "no_ir", "incompleto"]
    titulo: str
    razones_a_favor: list[str]
    razones_riesgo: list[str]
    razones_no: list[str]
