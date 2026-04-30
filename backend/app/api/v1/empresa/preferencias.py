from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.empresa_preferencias import (
    EmpresaPreferenciaCpv,
    EmpresaPreferenciaTerritorio,
    EmpresaPreferencias,
)
from app.schemas.empresa_preferencias import (
    EmpresaPreferenciasRead,
    EmpresaPreferenciasUpsert,
)
from app.services.scores_trigger import disparar_recalculo_scores

router = APIRouter()


async def _load_full(
    db: AsyncSession, empresa_id: UUID
) -> EmpresaPreferencias | None:
    stmt = (
        select(EmpresaPreferencias)
        .where(EmpresaPreferencias.empresa_id == empresa_id)
        .options(
            selectinload(EmpresaPreferencias.territorios),
            selectinload(EmpresaPreferencias.cpvs),
        )
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.get(
    "",
    response_model=EmpresaPreferenciasRead | None,
    summary="Lee las preferencias de match de una empresa (null si no existen)",
)
async def leer(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
) -> EmpresaPreferencias | None:
    return await _load_full(db, empresa_id)


@router.put(
    "",
    response_model=EmpresaPreferenciasRead,
    summary="Crea o reemplaza completamente las preferencias de una empresa",
)
async def upsert(
    data: EmpresaPreferenciasUpsert,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
) -> EmpresaPreferencias:
    if not empresa_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "empresa_id es obligatorio"
        )

    obj = await _load_full(db, empresa_id)
    scalar = data.model_dump(exclude={"territorios", "cpvs"})

    if obj is None:
        obj = EmpresaPreferencias(empresa_id=empresa_id, **scalar)
        db.add(obj)
        await db.flush()
    else:
        for field, value in scalar.items():
            setattr(obj, field, value)
        # Reemplazo total de listas anidadas (delete + insert).
        await db.execute(
            delete(EmpresaPreferenciaTerritorio).where(
                EmpresaPreferenciaTerritorio.preferencias_id == obj.id
            )
        )
        await db.execute(
            delete(EmpresaPreferenciaCpv).where(
                EmpresaPreferenciaCpv.preferencias_id == obj.id
            )
        )

    for t in data.territorios:
        db.add(
            EmpresaPreferenciaTerritorio(
                preferencias_id=obj.id,
                **t.model_dump(),
            )
        )
    for c in data.cpvs:
        db.add(
            EmpresaPreferenciaCpv(
                preferencias_id=obj.id,
                **c.model_dump(),
            )
        )

    await db.commit()
    refreshed = await _load_full(db, empresa_id)
    if refreshed is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "No se pudo recargar las preferencias tras guardar")
    # Las preferencias afectan a TODOS los hard filters + a la señal
    # preferencias_match. Cualquier upsert invalida los scores.
    disparar_recalculo_scores(empresa_id)
    return refreshed
