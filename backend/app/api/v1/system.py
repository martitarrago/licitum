"""Endpoints de estado del sistema — visibilidad de los crons para la UI."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.licitacion_score_empresa import LicitacionScoreEmpresa

router = APIRouter()

EMPRESA_DEMO_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class SyncStatusResponse(BaseModel):
    """Timestamps del último éxito de cada pipeline.

    El frontend puede pintar 'hace X min' sin tener que recordar el calendario
    cron. None si nunca se ha ejecutado para esta empresa.
    """

    last_licitacion_at: datetime | None
    last_score_at: datetime | None


@router.get("/sync-status", response_model=SyncStatusResponse)
async def get_sync_status(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: uuid.UUID | None = Query(None),
) -> SyncStatusResponse:
    empresa_filtro = empresa_id or EMPRESA_DEMO_ID

    # Última licitación añadida al feed (proxy del último ingesta_pscp exitoso).
    last_lic = (
        await db.execute(select(func.max(Licitacion.created_at)))
    ).scalar()

    # Último recálculo de scores para esta empresa.
    last_score = (
        await db.execute(
            select(func.max(LicitacionScoreEmpresa.computed_at)).where(
                LicitacionScoreEmpresa.empresa_id == empresa_filtro
            )
        )
    ).scalar()

    return SyncStatusResponse(
        last_licitacion_at=last_lic,
        last_score_at=last_score,
    )
