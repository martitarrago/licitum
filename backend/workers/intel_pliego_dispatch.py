"""Worker dispatch — encola análisis IA de pliegos para el top-N por empresa.

Phase 2 B2 — patrón anti-bucle:
  1. Análisis es por licitación, no por empresa → cache global en
     `licitacion_analisis_ia`. Un pliego analizado UNA vez sirve a TODAS
     las empresas que lo consulten.
  2. Análisis solo penaliza o confirma (vía `hard_filter_pliego` y la
     señal `pliego_check`). Nunca hace que una licitación suba más allá
     de un techo → no incentiva loops de re-rankings.
  3. TTL 30 días en el cache.
  4. Buffer top-20 por empresa, no top-5: aunque un análisis penalice
     una posición, los nuevos top-5 ya estuvieron analizados ayer.
  5. Budget guard: máximo `MAX_NEW_PER_DAY` (10) análisis nuevos por
     empresa por ejecución de la tarea — evita explosión de coste.

Wiring: tras `_run_recalc_empresa` exitoso, encolar
  `analizar_top_pendientes_empresa.delay(str(empresa_id))`. La tarea
  identifica las licitaciones del top-20 sin análisis vigente, encola
  `extraer_pliego_desde_pscp` para hasta MAX_NEW_PER_DAY de ellas.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.core.enums import EstadoAnalisisPliego
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA
from app.models.licitacion_score_empresa import LicitacionScoreEmpresa

logger = logging.getLogger(__name__)

# Buffer del top a considerar para análisis. Mayor que el cap de azul (10)
# para que cuando los análisis penalicen y muevan algunas, los nuevos
# top-5 ya estén analizados.
TOP_BUFFER = 20

# Budget guard — máximo análisis nuevos a encolar por ejecución de la
# tarea. Una empresa con 138 viables que arranca de cero, día 1 analiza 10,
# día 2 los 10 restantes del buffer, días siguientes solo los nuevos del
# feed PSCP. Coste ~$3.5-5/día.
MAX_NEW_PER_DAY = 10

# TTL del análisis. Pasado ese tiempo, una licitación que vuelva al
# top-20 se re-analizará (típicamente cuando el pliego cambió).
TTL_DIAS = 30


@celery_app.task(name="workers.intel_pliego_dispatch.analizar_top_pendientes_empresa")
def analizar_top_pendientes_empresa(empresa_id: str) -> dict[str, Any]:
    """Entry point Celery — selecciona top-20 sin análisis vigente y encola
    `extraer_pliego_desde_pscp` para hasta MAX_NEW_PER_DAY licitaciones.

    Idempotente: si todas las top-20 ya tienen análisis vigente, no encola
    nada (skip silencioso).
    """
    return asyncio.run(_run_dispatch(uuid.UUID(empresa_id)))


async def _run_dispatch(empresa_id: uuid.UUID) -> dict[str, Any]:
    started = datetime.now()
    result: dict[str, Any] = {
        "empresa_id": str(empresa_id),
        "started_at": started.isoformat(),
        "buffer_size": TOP_BUFFER,
        "max_new_per_day": MAX_NEW_PER_DAY,
        "queued": 0,
        "skipped_already_analyzed": 0,
        "skipped_budget_exhausted": 0,
    }

    engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as session:
            # 1) Top-20 viables para la empresa
            r = await session.execute(text(
                """
                SELECT licitacion_id
                FROM licitacion_score_empresa
                WHERE empresa_id = :empresa_id
                  AND descartada = false
                ORDER BY score DESC NULLS LAST
                LIMIT :n
                """
            ), {"empresa_id": empresa_id, "n": TOP_BUFFER})
            top_ids = [row[0] for row in r.fetchall()]
            result["top_size"] = len(top_ids)

            if not top_ids:
                logger.info("Dispatch %s: top vacío, skip", empresa_id)
                result["finished_at"] = datetime.now().isoformat()
                return result

            # 2) ¿Cuáles ya tienen análisis vigente (estado=completado y
            #    procesado dentro de TTL_DIAS)? Esos se saltan.
            ttl_cutoff = datetime.now(tz=timezone.utc) - timedelta(days=TTL_DIAS)
            analyzed_q = await session.execute(
                select(LicitacionAnalisisIA.licitacion_id).where(
                    LicitacionAnalisisIA.licitacion_id.in_(top_ids),
                    LicitacionAnalisisIA.estado == EstadoAnalisisPliego.completado,
                    LicitacionAnalisisIA.procesado_at.is_not(None),
                    LicitacionAnalisisIA.procesado_at >= ttl_cutoff,
                )
            )
            ya_analizados = {row[0] for row in analyzed_q.fetchall()}

            # También considerar las que ya están en estado pendiente o
            # procesando (ya en cola desde un dispatch previo) — no
            # encolar de nuevo.
            inflight_q = await session.execute(
                select(LicitacionAnalisisIA.licitacion_id).where(
                    LicitacionAnalisisIA.licitacion_id.in_(top_ids),
                    LicitacionAnalisisIA.estado.in_([
                        EstadoAnalisisPliego.pendiente,
                        EstadoAnalisisPliego.procesando,
                    ]),
                )
            )
            ya_en_curso = {row[0] for row in inflight_q.fetchall()}

            saltados = ya_analizados | ya_en_curso
            result["skipped_already_analyzed"] = len(saltados)

            # 3) Pendientes = top - saltados, en orden de score (top_ids ya viene ordenado)
            pendientes = [lid for lid in top_ids if lid not in saltados]

            # 4) Budget guard
            a_encolar = pendientes[:MAX_NEW_PER_DAY]
            result["skipped_budget_exhausted"] = max(0, len(pendientes) - MAX_NEW_PER_DAY)

            # 5) Encolar (import diferido para evitar circular)
            from workers.extraccion_pliego import extraer_pliego_desde_pscp

            for lic_id in a_encolar:
                try:
                    extraer_pliego_desde_pscp.apply_async(
                        args=[str(lic_id)],
                        # Si en 1h el worker no la procesa, la tarea expira
                        # — el cron de mañana la volverá a encolar.
                        expires=60 * 60,
                    )
                    result["queued"] += 1
                except Exception:
                    logger.exception(
                        "Dispatch %s: no se pudo encolar licitacion %s",
                        empresa_id, lic_id,
                    )

            logger.info(
                "Dispatch empresa=%s top=%d analizadas=%d encoladas=%d "
                "budget_skip=%d",
                empresa_id, len(top_ids), len(saltados),
                result["queued"], result["skipped_budget_exhausted"],
            )
    finally:
        await engine.dispose()

    result["finished_at"] = datetime.now().isoformat()
    return result
