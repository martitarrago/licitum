from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.licitacion_estado_empresa import LicitacionEstadoEmpresa
from app.schemas.tracker import (
    DEADLINE_AUTO_DIAS,
    EstadoBasicoRead,
    EstadoUpdate,
    ResumenEstado,
    TrackerFeedItem,
    TrackerResumen,
)

router = APIRouter()

# Estados que se consideran "activos" en el pipeline (no terminales).
ESTADOS_ACTIVOS = {
    "en_preparacion",
    "presentada",
    "en_subsanacion",
    "en_resolucion",
    "documentacion_previa",
}


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


def _to_feed_item(
    estado: LicitacionEstadoEmpresa, licitacion: Licitacion
) -> TrackerFeedItem:
    return TrackerFeedItem(
        id=estado.id,
        empresa_id=estado.empresa_id,
        licitacion_id=estado.licitacion_id,
        estado=estado.estado,
        deadline_actual=estado.deadline_actual,
        nota=estado.nota,
        estado_actualizado_at=estado.estado_actualizado_at,
        created_at=estado.created_at,
        updated_at=estado.updated_at,
        expediente=licitacion.expediente,
        titulo=licitacion.titulo,
        organismo=licitacion.organismo,
        importe_licitacion=licitacion.importe_licitacion,
        fecha_limite_pliego=licitacion.fecha_limite,
    )


@router.put(
    "/{expediente:path}/estado",
    response_model=EstadoBasicoRead,
    summary="Upsert del estado de una licitación en el pipeline",
)
async def upsert_estado(
    expediente: str,
    data: EstadoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicitacionEstadoEmpresa:
    lic = await _get_licitacion_or_404(db, expediente)
    obj = (
        await db.execute(
            select(LicitacionEstadoEmpresa).where(
                LicitacionEstadoEmpresa.empresa_id == data.empresa_id,
                LicitacionEstadoEmpresa.licitacion_id == lic.id,
            )
        )
    ).scalar_one_or_none()

    # Auto-deadline para estados con reloj legal cuando el usuario no especifica
    # uno. Si llega a uno NO-deadline-state, dejar el valor del usuario (puede
    # ser None). Si transiciona DESDE un deadline-state a otro estado y el
    # usuario no envía deadline, lo limpiamos (deadline_actual=None).
    deadline = data.deadline_actual
    auto_dias = DEADLINE_AUTO_DIAS.get(data.estado)
    if data.deadline_actual is None and auto_dias is not None:
        deadline = date.today() + timedelta(days=auto_dias)
    elif data.deadline_actual is None and auto_dias is None:
        # Estado sin reloj legal y usuario no especifica → None.
        deadline = None

    now = datetime.now(tz=timezone.utc)
    if obj is None:
        obj = LicitacionEstadoEmpresa(
            empresa_id=data.empresa_id,
            licitacion_id=lic.id,
            estado=data.estado,
            deadline_actual=deadline,
            nota=data.nota,
            estado_actualizado_at=now,
        )
        db.add(obj)
    else:
        obj.estado = data.estado
        obj.deadline_actual = deadline
        obj.nota = data.nota
        obj.estado_actualizado_at = now

    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete(
    "/{expediente:path}/estado",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Saca la licitación del pipeline (vuelve al estado implícito)",
)
async def borrar_estado(
    expediente: str,
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    lic = await _get_licitacion_or_404(db, expediente)
    obj = (
        await db.execute(
            select(LicitacionEstadoEmpresa).where(
                LicitacionEstadoEmpresa.empresa_id == empresa_id,
                LicitacionEstadoEmpresa.licitacion_id == lic.id,
            )
        )
    ).scalar_one_or_none()
    if obj is None:
        return
    await db.delete(obj)
    await db.commit()


@router.get(
    "/{expediente:path}/estado",
    response_model=EstadoBasicoRead,
    summary="Devuelve el estado actual de una licitación en el pipeline",
)
async def obtener_estado(
    expediente: str,
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicitacionEstadoEmpresa:
    lic = await _get_licitacion_or_404(db, expediente)
    obj = (
        await db.execute(
            select(LicitacionEstadoEmpresa).where(
                LicitacionEstadoEmpresa.empresa_id == empresa_id,
                LicitacionEstadoEmpresa.licitacion_id == lic.id,
            )
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Licitación sin estado en el pipeline (no añadida aún)",
        )
    return obj


@router.get(
    "",
    response_model=list[TrackerFeedItem],
    summary="Feed del pipeline con info de la licitación; filtrable por estados",
)
async def feed(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
    estado: Annotated[
        list[str] | None,
        Query(description="Filtrar por uno o varios estados"),
    ] = None,
) -> list[TrackerFeedItem]:
    stmt = (
        select(LicitacionEstadoEmpresa, Licitacion)
        .join(Licitacion, Licitacion.id == LicitacionEstadoEmpresa.licitacion_id)
        .where(LicitacionEstadoEmpresa.empresa_id == empresa_id)
        .order_by(
            LicitacionEstadoEmpresa.deadline_actual.asc().nulls_last(),
            LicitacionEstadoEmpresa.estado_actualizado_at.desc(),
        )
    )
    if estado:
        stmt = stmt.where(LicitacionEstadoEmpresa.estado.in_(estado))
    rows = (await db.execute(stmt)).all()
    return [_to_feed_item(estado_obj, lic) for estado_obj, lic in rows]


@router.get(
    "/resumen",
    response_model=TrackerResumen,
    summary="Resumen agregado para el home: counts por estado + plazos críticos",
)
async def resumen(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
    dias_alerta: Annotated[
        int, Query(ge=1, le=60, description="Ventana de plazos críticos en días")
    ] = 7,
) -> TrackerResumen:
    # Counts por estado
    counts_stmt = (
        select(LicitacionEstadoEmpresa.estado, func.count())
        .where(LicitacionEstadoEmpresa.empresa_id == empresa_id)
        .group_by(LicitacionEstadoEmpresa.estado)
    )
    counts_rows = (await db.execute(counts_stmt)).all()
    por_estado = [ResumenEstado(estado=e, count=c) for e, c in counts_rows]
    total_activas = sum(r.count for r in por_estado if r.estado in ESTADOS_ACTIVOS)

    # Plazos críticos: items con deadline_actual ≤ hoy + dias_alerta
    today = date.today()
    horizon = today + timedelta(days=dias_alerta)
    deadlines_stmt = (
        select(LicitacionEstadoEmpresa, Licitacion)
        .join(Licitacion, Licitacion.id == LicitacionEstadoEmpresa.licitacion_id)
        .where(
            LicitacionEstadoEmpresa.empresa_id == empresa_id,
            LicitacionEstadoEmpresa.deadline_actual.isnot(None),
            LicitacionEstadoEmpresa.deadline_actual <= horizon,
        )
        .order_by(LicitacionEstadoEmpresa.deadline_actual.asc())
    )
    deadlines_rows = (await db.execute(deadlines_stmt)).all()
    deadlines_semana = [_to_feed_item(e, l) for e, l in deadlines_rows]

    return TrackerResumen(
        total_activas=total_activas,
        por_estado=por_estado,
        deadlines_semana=deadlines_semana,
    )
