from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ClasificacionRelicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tipus_cl: str
    sigles_cl: str
    grupo: str
    subgrupo: str | None
    categoria: int | None
    subgrup_cl_text: str | None
    categoria_cl_text: str | None
    suspensio: bool
    data_atorgament: date | None


class EmpresaRelicSincronizar(BaseModel):
    """Body de POST /api/v1/empresa/relic/sincronizar."""

    empresa_id: uuid.UUID
    n_registral: str = Field(min_length=3, max_length=64)


class EmpresaRelicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    n_registral: str
    nom_empresa: str | None
    prohibicio: bool
    prohibicio_data: dict[str, Any] | None
    data_actualitzacio: date | None
    ultima_sincronizacion: datetime | None
    created_at: datetime
    updated_at: datetime
    clasificaciones_relic: list[ClasificacionRelicRead] = []
