from __future__ import annotations

from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.empresa_relic import EmpresaRelic
from app.schemas.empresa_relic import EmpresaRelicRead, EmpresaRelicSincronizar
from app.services.relic_sync import RelicNotFoundError, sincronizar_empresa_relic
from app.services.semaforo_trigger import disparar_recalculo_semaforo

router = APIRouter()


async def _cargar_relic_or_404(
    db: AsyncSession, empresa_id: UUID
) -> EmpresaRelic:
    stmt = (
        select(EmpresaRelic)
        .where(EmpresaRelic.empresa_id == empresa_id)
        .options(selectinload(EmpresaRelic.clasificaciones_relic))
    )
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Esta empresa no tiene inscripción RELIC sincronizada",
        )
    return obj


@router.get(
    "",
    response_model=EmpresaRelicRead,
    summary="Devuelve los datos RELIC de una empresa (404 si no está sincronizada)",
)
async def obtener_relic(
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EmpresaRelic:
    return await _cargar_relic_or_404(db, empresa_id)


@router.post(
    "/sincronizar",
    response_model=EmpresaRelicRead,
    status_code=status.HTTP_200_OK,
    summary="Sincroniza una empresa con RELIC vía Socrata por n_registral",
)
async def sincronizar(
    data: EmpresaRelicSincronizar,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> EmpresaRelic:
    try:
        await sincronizar_empresa_relic(db, data.empresa_id, data.n_registral)
    except RelicNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Error consultando RELIC: {exc}",
        )

    # Tras el sync, las clasificaciones nuevas pueden cambiar el semáforo del
    # Radar. Idempotente: si no cambió nada, no escribe filas.
    disparar_recalculo_semaforo()

    # Recarga con clasificaciones eager para la respuesta
    return await _cargar_relic_or_404(db, data.empresa_id)


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Desconecta la empresa de RELIC (borra el registro local)",
)
async def desconectar(
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _cargar_relic_or_404(db, empresa_id)
    await db.delete(obj)
    await db.commit()
    disparar_recalculo_semaforo()
