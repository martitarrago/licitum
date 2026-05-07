from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class SobreAGenerar(BaseModel):
    """Body de POST /sobre-a/{exp}/generar.

    `empresa_id` ya no es obligatorio — el backend lo deriva del JWT.
    Aceptamos un body vacío `{}` o cualquier campo extra (se ignora).
    """

    model_config = ConfigDict(extra="ignore")


class SobreAListItem(BaseModel):
    """Item ligero del histórico — sin el HTML para no inflar la lista."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    licitacion_id: uuid.UUID
    expediente: str
    usa_relic: bool
    created_at: datetime
    updated_at: datetime


class SobreARead(SobreAListItem):
    """Detalle con HTML + snapshot."""

    html: str
    datos_snapshot: dict[str, Any]
