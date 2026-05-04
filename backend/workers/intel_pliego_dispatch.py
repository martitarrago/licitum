"""Worker dispatch — encola análisis IA de pliegos para todas las licitaciones
viables (score >= MIN_SCORE_ANALISIS) de una empresa.

Garantía: ninguna licitación con score >= 50 puede quedarse sin análisis de
pliego. El análisis puede bajar el score (vía hard_filter_pliego o señal
pliego_check) pero nunca subirlo — no hay riesgo de bucles de re-ranking.

Patrón:
  1. Análisis es global por licitación (cache en `licitacion_analisis_ia`).
     Una vez analizado sirve a TODAS las empresas.
  2. Se consideran TODAS las licitaciones con score >= MIN_SCORE_ANALISIS,
     ordenadas por score desc para priorizar las mejores en el budget guard.
  3. Budget guard: MAX_NEW_PER_RUN (15) por ejecución. Con el cron cada 4h
     son hasta 60 análisis nuevos/día — suficiente para cualquier empresa.
  4. TTL 30 días: después se re-analiza si la licitación sigue viable.

Wiring: `_run_recalc_empresa` en intel_scores encola esta tarea tras cada
recálculo exitoso.
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

# Score mínimo para considerar una licitación viable y analizar su pliego.
# Coincide con el umbral "raso" del semáforo — por debajo no merece coste.
MIN_SCORE_ANALISIS = 50

# Budget guard — máximo análisis nuevos a encolar por ejecución.
# Con 4 ejecuciones/día (cron cada 4h) son hasta 60 análisis/día.
# Una empresa que arranca de cero con 50 viables queda cubierta en ~2 ciclos.
MAX_NEW_PER_RUN = 15

# TTL del análisis. Pasado ese tiempo, una licitación que siga viable
# se re-analizará (útil cuando el pliego cambia).
TTL_DIAS = 30


@celery_app.task(name="workers.intel_pliego_dispatch.analizar_top_pendientes_empresa")
def analizar_top_pendientes_empresa(empresa_id: str) -> dict[str, Any]:
    """Entry point Celery — selecciona viables (score>=MIN_SCORE_ANALISIS) sin
    análisis vigente y encola `extraer_pliego_desde_pscp` para hasta
    MAX_NEW_PER_RUN licitaciones.

    Idempotente: si todas las viables ya tienen análisis vigente, no encola
    nada (skip silencioso).
    """
    return asyncio.run(_run_dispatch(uuid.UUID(empresa_id)))


async def _run_dispatch(empresa_id: uuid.UUID) -> dict[str, Any]:
    started = datetime.now()
    result: dict[str, Any] = {
        "empresa_id": str(empresa_id),
        "started_at": started.isoformat(),
        "min_score": MIN_SCORE_ANALISIS,
        "max_new_per_run": MAX_NEW_PER_RUN,
        "queued": 0,
        "skipped_already_analyzed": 0,
        "skipped_budget_exhausted": 0,
    }

    engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with Session() as session:
            # 1) Todas las licitaciones viables (score >= umbral) para la empresa,
            # ordenadas por score desc para priorizar las mejores en el budget guard.
            r = await session.execute(text(
                """
                SELECT licitacion_id
                FROM licitacion_score_empresa
                WHERE empresa_id = :empresa_id
                  AND descartada = false
                  AND score >= :min_score
                ORDER BY score DESC NULLS LAST
                """
            ), {"empresa_id": empresa_id, "min_score": MIN_SCORE_ANALISIS})
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
            a_encolar = pendientes[:MAX_NEW_PER_RUN]
            result["skipped_budget_exhausted"] = max(0, len(pendientes) - MAX_NEW_PER_RUN)

            # 5) Registrar solicitudes para TODAS las viables (encoladas
            # + ya cacheadas) — el listado /pliegos filtra por esta tabla,
            # así que la empresa actual debe tenerlas todas vinculadas
            # aunque otra empresa las analizó antes.
            await session.execute(text(
                """
                INSERT INTO licitacion_analisis_solicitud
                    (empresa_id, licitacion_id, origen, solicitado_at)
                SELECT :empresa_id, lic_id, 'cron', NOW()
                FROM unnest(CAST(:lic_ids AS uuid[])) AS lic_id
                ON CONFLICT (empresa_id, licitacion_id) DO NOTHING
                """
            ), {"empresa_id": empresa_id, "lic_ids": top_ids})
            await session.commit()

            # 6) Encolar (import diferido para evitar circular)
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
