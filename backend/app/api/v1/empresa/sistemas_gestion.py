from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.sistema_gestion_empresa import SistemaGestionEmpresa
from app.schemas.sistema_gestion_empresa import (
    SistemaGestionEmpresaCreate,
    SistemaGestionEmpresaRead,
    SistemaGestionEmpresaUpdate,
)

router = APIRouter()


async def _get_or_404(db: AsyncSession, sg_id: UUID) -> SistemaGestionEmpresa:
    stmt = select(SistemaGestionEmpresa).where(
        SistemaGestionEmpresa.id == sg_id,
        SistemaGestionEmpresa.deleted_at.is_(None),
    )
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Sistema {sg_id} no encontrado"
        )
    return obj


@router.post(
    "",
    response_model=SistemaGestionEmpresaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea un sistema de gestión / certificación",
)
async def crear(
    data: SistemaGestionEmpresaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SistemaGestionEmpresa:
    obj = SistemaGestionEmpresa(**data.model_dump())
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get(
    "",
    response_model=list[SistemaGestionEmpresaRead],
    summary="Lista sistemas de gestión de una empresa",
)
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
    tipo: str | None = None,
) -> list[SistemaGestionEmpresa]:
    stmt = (
        select(SistemaGestionEmpresa)
        .where(
            SistemaGestionEmpresa.empresa_id == empresa_id,
            SistemaGestionEmpresa.deleted_at.is_(None),
        )
        .order_by(
            SistemaGestionEmpresa.fecha_caducidad.asc().nulls_last(),
            SistemaGestionEmpresa.created_at.desc(),
        )
    )
    if tipo is not None:
        stmt = stmt.where(SistemaGestionEmpresa.tipo == tipo)
    return list((await db.execute(stmt)).scalars().all())


@router.patch(
    "/{sg_id}",
    response_model=SistemaGestionEmpresaRead,
    summary="Actualiza un sistema de gestión",
)
async def actualizar(
    sg_id: UUID,
    data: SistemaGestionEmpresaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SistemaGestionEmpresa:
    obj = await _get_or_404(db, sg_id)
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
    "/{sg_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete de un sistema de gestión",
)
async def eliminar(
    sg_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _get_or_404(db, sg_id)
    obj.deleted_at = datetime.now(timezone.utc)
    await db.commit()
