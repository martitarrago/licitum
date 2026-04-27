"""Worker de sincronización RELIC (Catalunya).

Tarea diaria que recorre todas las empresas con `n_registral` guardado y las
sincroniza contra el dataset Socrata `t3wj-j4pu`. Actualiza datos generales
(prohibición, nombre) y reemplaza clasificaciones en bloque.

El dataset RELIC se actualiza diariamente. Ejecutar al día siguiente cubre
los cambios de altas, bajas, suspensiones y nuevas clasificaciones.

Idempotente: una empresa que no cambió desde la última sync se vuelve a
escribir igual. Coste: una llamada HTTP por empresa registrada (~50-100ms).
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.models.empresa_relic import EmpresaRelic
from app.services.relic_sync import RelicNotFoundError, sincronizar_empresa_relic

logger = logging.getLogger(__name__)


@celery_app.task(name="workers.sync_relic.sincronizar_todas", bind=True)
def sincronizar_todas(self) -> dict[str, int]:
    return asyncio.run(_ejecutar())


async def _ejecutar() -> dict[str, int]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    stats: dict[str, int] = {"total": 0, "ok": 0, "no_encontradas": 0, "errores": 0}
    try:
        async with session_factory() as db:
            empresas = (await db.execute(select(EmpresaRelic))).scalars().all()
            stats["total"] = len(empresas)
            logger.info("RELIC sync diaria: %d empresas a sincronizar", len(empresas))
            for er in empresas:
                try:
                    await sincronizar_empresa_relic(db, er.empresa_id, er.n_registral)
                    stats["ok"] += 1
                except RelicNotFoundError:
                    logger.warning(
                        "RELIC sync: %s sin filas en Socrata (¿baja del registro?)",
                        er.n_registral,
                    )
                    stats["no_encontradas"] += 1
                except Exception:  # pragma: no cover
                    logger.exception(
                        "RELIC sync: error con n_registral=%s", er.n_registral
                    )
                    stats["errores"] += 1
                    await db.rollback()
    finally:
        await engine.dispose()
    logger.info("RELIC sync diaria completada: %s", stats)
    return stats
