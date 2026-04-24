from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

SemaforoType = Literal["verde", "amarillo", "rojo", "gris"]


class LicitacionRead(BaseModel):
    id: uuid.UUID
    expediente: str
    titulo: str | None
    organismo: str | None
    importe_licitacion: Decimal | None
    fecha_publicacion: datetime | None
    fecha_limite: datetime | None
    cpv_codes: list[str]
    tipo_contrato: str | None
    tipo_procedimiento: str | None
    clasificacion_requerida: str | None
    url_placsp: str | None
    semaforo: SemaforoType
    semaforo_razon: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class LicitacionListResponse(BaseModel):
    items: list[LicitacionRead]
    total: int
    page: int
    page_size: int


class IngestaTriggerResponse(BaseModel):
    task_id: str
    message: str
