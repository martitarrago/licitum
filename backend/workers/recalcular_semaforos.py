"""Tarea Celery: recálculo masivo del semáforo del Radar.

Aplica el evaluador de solvencia (`app.services.solvencia_evaluator`) a TODAS
las licitaciones de la BD, sin tocar el resto de columnas. Reusable desde:

  - El endpoint `POST /api/v1/licitaciones/recalcular-semaforo` (botón
    "Recalcular semáforos" del frontend, llamado tras cambios en M3 —
    nuevos certificados, nuevas clasificaciones).
  - El final de la ingesta `workers.ingesta_pscp.ingestar_feed`, para
    asegurar consistencia tras la ronda de upsert (la ingesta ya evalúa
    in-place, pero esta tarea es idempotente y barata como red de seguridad).

Updates en batches con `CASE WHEN id IN ...` para minimizar round-trips.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.models.licitacion import Licitacion
from app.services.solvencia_evaluator import (
    LicitacionInput,
    SolvenciaEmpresa,
    cargar_solvencia_empresa,
    evaluar_semaforo,
)

logger = logging.getLogger(__name__)

EMPRESA_DEMO_ID = "00000000-0000-0000-0000-000000000001"
BATCH_SIZE = 500


@celery_app.task(name="workers.recalcular_semaforos.recalcular_todas", bind=True)
def recalcular_todas(self) -> dict[str, Any]:
    """Tarea Celery — recalcula el semáforo de todas las licitaciones."""
    return asyncio.run(_ejecutar_recalculo())


async def _ejecutar_recalculo() -> dict[str, Any]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    try:
        async with session_factory() as db:
            solvencia = await cargar_solvencia_empresa(db, uuid.UUID(EMPRESA_DEMO_ID))
            logger.info(
                "Recálculo semáforos iniciado · solvencia: clasificaciones=%s, certificados=%s",
                solvencia.max_categoria_por_grupo,
                {g: float(v) for g, v in solvencia.max_solvencia_certificada_por_grupo.items()},
            )
            stats = await _recalcular_en_db(db, solvencia)
    finally:
        await engine.dispose()

    logger.info(
        "Recálculo semáforos completado · distribución obras=%s · fallback duración %d/%d (%.1f%%) · "
        "actualizadas=%d · sin cambios=%d",
        stats["distribucion_obras"],
        stats["fallback_durada"],
        stats["obras"],
        stats["fallback_pct"],
        stats["actualizadas"],
        stats["sin_cambios"],
    )
    return stats


async def _recalcular_en_db(
    db: AsyncSession,
    solvencia: SolvenciaEmpresa,
) -> dict[str, Any]:
    """Evalúa todas las licitaciones y aplica updates solo donde cambia algo."""
    rows = (await db.execute(select(Licitacion))).scalars().all()

    now = datetime.now(tz=timezone.utc)
    updates: list[dict[str, Any]] = []
    distribucion: dict[str, int] = {"verde": 0, "amarillo": 0, "rojo": 0, "gris": 0}
    distribucion_obras: dict[str, int] = {"verde": 0, "amarillo": 0, "rojo": 0, "gris": 0}
    fallbacks = 0
    obras = 0
    sin_cambios = 0

    for r in rows:
        lic = LicitacionInput(
            tipo_contrato=r.tipo_contrato,
            importe=r.importe_licitacion,
            cpv_codes=r.cpv_codes or [],
            durada_text=(r.raw_data or {}).get("durada_contracte"),
        )
        ev = evaluar_semaforo(lic, solvencia)
        distribucion[ev.semaforo] = distribucion.get(ev.semaforo, 0) + 1
        if r.tipo_contrato in ("obras", "concesion_obras"):
            obras += 1
            distribucion_obras[ev.semaforo] = distribucion_obras.get(ev.semaforo, 0) + 1
            if ev.fallback_durada:
                fallbacks += 1

        if r.semaforo == ev.semaforo and (r.semaforo_razon or "") == ev.razon:
            sin_cambios += 1
            continue

        updates.append(
            {
                "id": r.id,
                "semaforo": ev.semaforo,
                "semaforo_razon": ev.razon,
                "ingestado_at": now,
            }
        )

    if updates:
        # ORM Bulk UPDATE by Primary Key (SQLA 2.x): la presencia de la key
        # `id` en cada dict hace que SQLA infiera el WHERE id=:id y emita
        # un único `executemany` por chunk.
        stmt = update(Licitacion)
        for i in range(0, len(updates), BATCH_SIZE):
            chunk = updates[i : i + BATCH_SIZE]
            await db.execute(stmt, chunk)
            logger.info(
                "Update batch %d/%d: %d filas",
                i // BATCH_SIZE + 1,
                (len(updates) + BATCH_SIZE - 1) // BATCH_SIZE,
                len(chunk),
            )
        await db.commit()

    fallback_pct = (100.0 * fallbacks / obras) if obras else 0.0
    return {
        "total": len(rows),
        "actualizadas": len(updates),
        "sin_cambios": sin_cambios,
        "distribucion": distribucion,
        "distribucion_obras": distribucion_obras,
        "obras": obras,
        "fallback_durada": fallbacks,
        "fallback_pct": fallback_pct,
    }
