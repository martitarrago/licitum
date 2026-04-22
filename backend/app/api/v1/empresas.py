from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.empresa import Empresa
from app.schemas.empresa import EmpresaCreate, EmpresaRead, EmpresaUpdate

router = APIRouter()


async def _get_empresa_or_404(db: AsyncSession, empresa_id: UUID) -> Empresa:
    result = await db.execute(
        select(Empresa).where(
            Empresa.id == empresa_id,
            Empresa.deleted_at.is_(None),
        )
    )
    empresa = result.scalar_one_or_none()
    if empresa is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Empresa {empresa_id} no encontrada")
    return empresa


@router.post(
    "",
    response_model=EmpresaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea una nueva empresa",
)
async def crear_empresa(
    data: EmpresaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Empresa:
    empresa = Empresa(**data.model_dump())
    db.add(empresa)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "CIF o email ya registrado")
    await db.refresh(empresa)
    return empresa


@router.get(
    "",
    response_model=list[EmpresaRead],
    summary="Lista todas las empresas activas",
)
async def listar_empresas(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Empresa]:
    result = await db.execute(
        select(Empresa)
        .where(Empresa.deleted_at.is_(None))
        .order_by(Empresa.created_at)
    )
    return list(result.scalars().all())


@router.get(
    "/{empresa_id}",
    response_model=EmpresaRead,
    summary="Detalle de una empresa",
)
async def obtener_empresa(
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Empresa:
    return await _get_empresa_or_404(db, empresa_id)


@router.patch(
    "/{empresa_id}",
    response_model=EmpresaRead,
    summary="Actualiza campos de una empresa",
)
async def actualizar_empresa(
    empresa_id: UUID,
    data: EmpresaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Empresa:
    empresa = await _get_empresa_or_404(db, empresa_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se enviaron campos para actualizar")
    for field, value in updates.items():
        setattr(empresa, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "CIF o email ya en uso por otra empresa")
    await db.refresh(empresa)
    return empresa


@router.delete(
    "/{empresa_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete de una empresa",
)
async def eliminar_empresa(
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    empresa = await _get_empresa_or_404(db, empresa_id)
    empresa.deleted_at = datetime.now(timezone.utc)
    await db.commit()
