from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.schemas.licitacion import IngestaTriggerResponse, LicitacionListResponse, LicitacionRead

router = APIRouter()


@router.get("", response_model=LicitacionListResponse)
async def list_licitaciones(
    semaforo: str | None = Query(None, description="Filtrar por semáforo: verde, amarillo, rojo, gris"),
    tipo_contrato: str | None = Query(None, description="Filtrar por tipo: obras, servicios, suministros…"),
    q: str | None = Query(None, description="Búsqueda en título y organismo"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> LicitacionListResponse:
    stmt = select(Licitacion)

    if semaforo:
        stmt = stmt.where(Licitacion.semaforo == semaforo)
    if tipo_contrato:
        stmt = stmt.where(Licitacion.tipo_contrato == tipo_contrato)
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            Licitacion.titulo.ilike(pattern) | Licitacion.organismo.ilike(pattern)
        )

    stmt = stmt.order_by(Licitacion.fecha_publicacion.desc().nulls_last())

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).scalars().all()

    return LicitacionListResponse(
        items=[LicitacionRead.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{expediente:path}", response_model=LicitacionRead)
async def get_licitacion(
    expediente: str,
    db: AsyncSession = Depends(get_db),
) -> LicitacionRead:
    from fastapi import HTTPException, status

    row = (
        await db.execute(select(Licitacion).where(Licitacion.expediente == expediente))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Licitación '{expediente}' no encontrada")
    return LicitacionRead.model_validate(row)


@router.post("/ingestar", response_model=IngestaTriggerResponse)
async def trigger_ingesta() -> IngestaTriggerResponse:
    """Lanza la tarea de ingestión del feed PLACSP en el worker Celery."""
    from workers.ingesta_placsp import ingestar_feed

    task = ingestar_feed.delay()
    return IngestaTriggerResponse(
        task_id=task.id,
        message="Tarea de ingestión lanzada. Puede tardar varios minutos.",
    )
