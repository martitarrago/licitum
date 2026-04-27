from __future__ import annotations

from typing import Annotated, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.sobre_a_generacion import SobreAGeneracion
from app.schemas.sobre_a import SobreAGenerar, SobreAListItem, SobreARead
from app.services.deuc_generator import generar_sobre_a

router = APIRouter()


async def _get_or_404(db: AsyncSession, sobre_id: UUID) -> SobreAGeneracion:
    obj = (
        await db.execute(
            select(SobreAGeneracion).where(SobreAGeneracion.id == sobre_id)
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Sobre A {sobre_id} no encontrado"
        )
    return obj


@router.post(
    "/{expediente:path}/generar",
    response_model=SobreARead,
    status_code=status.HTTP_201_CREATED,
    summary="Genera un Sobre A nuevo y guarda en histórico",
)
async def generar(
    expediente: str,
    data: SobreAGenerar,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SobreAGeneracion:
    licitacion = (
        await db.execute(
            select(Licitacion).where(Licitacion.expediente == expediente)
        )
    ).scalar_one_or_none()
    if licitacion is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Licitación con expediente {expediente!r} no encontrada",
        )

    try:
        result = await generar_sobre_a(db, data.empresa_id, expediente)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))

    obj = SobreAGeneracion(
        empresa_id=data.empresa_id,
        licitacion_id=licitacion.id,
        expediente=expediente,
        html=result.html,
        datos_snapshot=result.snapshot,
        usa_relic=result.usa_relic,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get(
    "",
    response_model=list[SobreAListItem],
    summary="Histórico de Sobres A generados (sin HTML)",
)
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
) -> Sequence[SobreAGeneracion]:
    stmt = (
        select(SobreAGeneracion)
        .where(SobreAGeneracion.empresa_id == empresa_id)
        .order_by(SobreAGeneracion.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


@router.get(
    "/{sobre_id}",
    response_model=SobreARead,
    summary="Detalle de un Sobre A generado (con HTML completo)",
)
async def obtener(
    sobre_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SobreAGeneracion:
    return await _get_or_404(db, sobre_id)


@router.delete(
    "/{sobre_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Borra un Sobre A del histórico",
)
async def eliminar(
    sobre_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _get_or_404(db, sobre_id)
    await db.delete(obj)
    await db.commit()
