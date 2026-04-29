from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

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
    provincias: list[str]
    tipo_organismo: str | None
    score_afinidad: Decimal | None
    # Puntuación del motor de ganabilidad (0-100). Nullable si la licitación
    # aún no ha sido scoreada para la empresa actual.
    score: int | None = None
    descartada: bool | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class LicitacionDetail(LicitacionRead):
    """Vista de detalle: añade campos que no se incluyen en la lista por
    coste/tamaño (raw_data completo del registro fuente, importe con IVA,
    organismo_id DIR3)."""

    organismo_id: str | None
    importe_presupuesto_base: Decimal | None
    raw_data: dict[str, Any]


class LicitacionListResponse(BaseModel):
    items: list[LicitacionRead]
    total: int
    page: int
    page_size: int


class IngestaTriggerResponse(BaseModel):
    task_id: str
    message: str
