from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_empresa_id
from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.licitacion_favorita_empresa import LicitacionFavoritaEmpresa

router = APIRouter()


class FavoritoState(BaseModel):
    favorito: bool


async def _get_licitacion_or_404(db: AsyncSession, expediente: str) -> Licitacion:
    obj = (
        await db.execute(
            select(Licitacion).where(Licitacion.expediente == expediente)
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Licitación con expediente {expediente!r} no encontrada",
        )
    return obj


@router.put(
    "/{expediente:path}",
    response_model=FavoritoState,
    summary="Marca una licitación como favorita para la empresa",
)
async def marcar_favorito(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> FavoritoState:
    lic = await _get_licitacion_or_404(db, expediente)
    existing = (
        await db.execute(
            select(LicitacionFavoritaEmpresa).where(
                LicitacionFavoritaEmpresa.empresa_id == empresa_id,
                LicitacionFavoritaEmpresa.licitacion_id == lic.id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add(
            LicitacionFavoritaEmpresa(
                empresa_id=empresa_id,
                licitacion_id=lic.id,
            )
        )
        await db.commit()
    return FavoritoState(favorito=True)


@router.delete(
    "/{expediente:path}",
    response_model=FavoritoState,
    summary="Quita una licitación de favoritos",
)
async def quitar_favorito(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> FavoritoState:
    lic = await _get_licitacion_or_404(db, expediente)
    obj = (
        await db.execute(
            select(LicitacionFavoritaEmpresa).where(
                LicitacionFavoritaEmpresa.empresa_id == empresa_id,
                LicitacionFavoritaEmpresa.licitacion_id == lic.id,
            )
        )
    ).scalar_one_or_none()
    if obj is not None:
        await db.delete(obj)
        await db.commit()
    return FavoritoState(favorito=False)
