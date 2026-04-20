from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.clasificacion_rolece import ClasificacionRolece
from app.schemas.clasificacion_rolece import (
    ClasificacionRoleceCreate,
    ClasificacionRoleceRead,
    ClasificacionRoleceUpdate,
)

router = APIRouter()


async def _get_or_404(
    db: AsyncSession, clasificacion_id: UUID
) -> ClasificacionRolece:
    stmt = select(ClasificacionRolece).where(
        ClasificacionRolece.id == clasificacion_id,
        ClasificacionRolece.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Clasificación {clasificacion_id} no encontrada",
        )
    return obj


@router.post(
    "",
    response_model=ClasificacionRoleceRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una clasificación ROLECE para una empresa",
)
async def crear_clasificacion(
    data: ClasificacionRoleceCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClasificacionRolece:
    obj = ClasificacionRolece(**data.model_dump())
    db.add(obj)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ya existe esa clasificación (grupo/subgrupo/categoría) para esta empresa",
        )
    await db.refresh(obj)
    return obj


@router.get(
    "",
    response_model=list[ClasificacionRoleceRead],
    summary="Lista clasificaciones con filtros opcionales",
)
async def listar_clasificaciones(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID | None = None,
    activa: bool | None = None,
) -> Sequence[ClasificacionRolece]:
    stmt = select(ClasificacionRolece).where(ClasificacionRolece.deleted_at.is_(None))
    if empresa_id is not None:
        stmt = stmt.where(ClasificacionRolece.empresa_id == empresa_id)
    if activa is not None:
        stmt = stmt.where(ClasificacionRolece.activa == activa)
    stmt = stmt.order_by(
        ClasificacionRolece.grupo.asc(),
        ClasificacionRolece.subgrupo.asc(),
        ClasificacionRolece.categoria.asc(),
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch(
    "/{clasificacion_id}",
    response_model=ClasificacionRoleceRead,
    summary="Actualiza campos de una clasificación (incluye activar/desactivar)",
)
async def actualizar_clasificacion(
    clasificacion_id: UUID,
    data: ClasificacionRoleceUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClasificacionRolece:
    obj = await _get_or_404(db, clasificacion_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se han enviado campos para actualizar",
        )
    for field, value in updates.items():
        setattr(obj, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Conflicto de unicidad al actualizar (grupo/subgrupo/categoría duplicados)",
        )
    await db.refresh(obj)
    return obj


@router.delete(
    "/{clasificacion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete de una clasificación",
)
async def eliminar_clasificacion(
    clasificacion_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _get_or_404(db, clasificacion_id)
    obj.deleted_at = datetime.now(timezone.utc)
    await db.commit()
