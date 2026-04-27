from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Estados del ciclo público de una licitación. Mantener sincronizado con el
# selector del frontend (`components/tracker/EstadoSelector.tsx`).
EstadoTracker = Literal[
    "en_preparacion",
    "presentada",
    "en_subsanacion",
    "apertura_sobres",
    "adjudicacion_provisional",
    "documentacion_previa",
    "adjudicada",
    "formalizada",
    "perdida",
    "rechazada",
]

# Estados con reloj legal que disparan auto-deadline al transicionar.
# Aproximación calendar-day (los días hábiles reales requieren calendario
# laboral por Comunidad Autónoma — fuera de MVP).
DEADLINE_AUTO_DIAS: dict[str, int] = {
    "en_subsanacion": 5,           # ~3 días hábiles
    "documentacion_previa": 14,    # ~10 días hábiles
}


class EstadoUpdate(BaseModel):
    """Body de PUT /tracker/{exp}/estado — upsert."""

    empresa_id: uuid.UUID
    estado: EstadoTracker
    deadline_actual: date | None = None
    nota: str | None = Field(default=None, max_length=2000)


class EstadoBasicoRead(BaseModel):
    """Estado puro, sin info enriquecida de la licitación."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    licitacion_id: uuid.UUID
    estado: str
    deadline_actual: date | None
    nota: str | None
    estado_actualizado_at: datetime
    created_at: datetime
    updated_at: datetime


class TrackerFeedItem(EstadoBasicoRead):
    """Item del feed con info de la licitación enriquecida vía join."""

    expediente: str
    titulo: str | None
    organismo: str | None
    importe_licitacion: Decimal | None
    fecha_limite_pliego: datetime | None


class ResumenEstado(BaseModel):
    estado: str
    count: int


class TrackerResumen(BaseModel):
    total_activas: int
    por_estado: list[ResumenEstado]
    deadlines_semana: list[TrackerFeedItem]
