from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_empresa_id
from app.db.session import get_db
from app.models.maquinaria_empresa import MaquinariaEmpresa
from app.schemas.maquinaria_empresa import (
    MaquinariaEmpresaCreate,
    MaquinariaEmpresaRead,
    MaquinariaEmpresaUpdate,
)

router = APIRouter()


async def _get_or_404(db: AsyncSession, maq_id: UUID) -> MaquinariaEmpresa:
    stmt = select(MaquinariaEmpresa).where(
        MaquinariaEmpresa.id == maq_id,
        MaquinariaEmpresa.deleted_at.is_(None),
    )
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Maquinaria {maq_id} no encontrada"
        )
    return obj


@router.post(
    "",
    response_model=MaquinariaEmpresaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una entrada de maquinaria/equipo",
)
async def crear(
    data: MaquinariaEmpresaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> MaquinariaEmpresa:
    payload = data.model_dump()
    payload["empresa_id"] = empresa_id
    obj = MaquinariaEmpresa(**payload)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get(
    "",
    response_model=list[MaquinariaEmpresaRead],
    summary="Lista maquinaria de una empresa",
)
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    propiedad: str | None = None,
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> list[MaquinariaEmpresa]:
    stmt = (
        select(MaquinariaEmpresa)
        .where(
            MaquinariaEmpresa.empresa_id == empresa_id,
            MaquinariaEmpresa.deleted_at.is_(None),
        )
        .order_by(MaquinariaEmpresa.tipo.asc(), MaquinariaEmpresa.created_at.desc())
    )
    if propiedad is not None:
        stmt = stmt.where(MaquinariaEmpresa.propiedad == propiedad)
    return list((await db.execute(stmt)).scalars().all())


@router.patch(
    "/{maq_id}",
    response_model=MaquinariaEmpresaRead,
    summary="Actualiza campos de una maquinaria",
)
async def actualizar(
    maq_id: UUID,
    data: MaquinariaEmpresaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MaquinariaEmpresa:
    obj = await _get_or_404(db, maq_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "No se enviaron campos para actualizar"
        )
    for field, value in updates.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete(
    "/{maq_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete de una maquinaria",
)
async def eliminar(
    maq_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _get_or_404(db, maq_id)
    obj.deleted_at = datetime.now(timezone.utc)
    await db.commit()
