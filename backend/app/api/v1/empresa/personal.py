from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_empresa_id
from app.db.session import get_db
from app.models.personal_empresa import PersonalEmpresa
from app.schemas.personal_empresa import (
    PersonalEmpresaCreate,
    PersonalEmpresaRead,
    PersonalEmpresaUpdate,
)

router = APIRouter()


async def _get_or_404(db: AsyncSession, persona_id: UUID) -> PersonalEmpresa:
    stmt = select(PersonalEmpresa).where(
        PersonalEmpresa.id == persona_id,
        PersonalEmpresa.deleted_at.is_(None),
    )
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Personal {persona_id} no encontrado"
        )
    return obj


@router.post(
    "",
    response_model=PersonalEmpresaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una persona del equipo técnico",
)
async def crear(
    data: PersonalEmpresaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> PersonalEmpresa:
    payload = data.model_dump()
    payload["empresa_id"] = empresa_id
    obj = PersonalEmpresa(**payload)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get(
    "",
    response_model=list[PersonalEmpresaRead],
    summary="Lista personal de una empresa",
)
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    rol: str | None = None,
    activo: bool | None = None,
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> list[PersonalEmpresa]:
    stmt = (
        select(PersonalEmpresa)
        .where(
            PersonalEmpresa.empresa_id == empresa_id,
            PersonalEmpresa.deleted_at.is_(None),
        )
        .order_by(PersonalEmpresa.nombre_completo.asc())
    )
    if rol is not None:
        stmt = stmt.where(PersonalEmpresa.rol == rol)
    if activo is not None:
        stmt = stmt.where(PersonalEmpresa.activo.is_(activo))
    return list((await db.execute(stmt)).scalars().all())


@router.patch(
    "/{persona_id}",
    response_model=PersonalEmpresaRead,
    summary="Actualiza campos de una persona",
)
async def actualizar(
    persona_id: UUID,
    data: PersonalEmpresaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PersonalEmpresa:
    obj = await _get_or_404(db, persona_id)
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
    "/{persona_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete de una persona",
)
async def eliminar(
    persona_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _get_or_404(db, persona_id)
    obj.deleted_at = datetime.now(timezone.utc)
    await db.commit()
