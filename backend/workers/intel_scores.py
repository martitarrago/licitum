"""Worker para recalcular scores de ganabilidad por empresa.

Lógica núcleo:
  1. Cargar EmpresaStaticProfile (M2) y calcular hash.
  2. Si en `licitacion_score_empresa` ya hay scores con ese mismo hash,
     skip (M2 no cambió desde el último recálculo) — idempotente.
  3. Si hash distinto, iterar licitaciones abiertas + scorear + bulk upsert.

Tareas Celery:
  - intel_scores.calcular_para_empresa(empresa_id): un único cálculo.
  - intel_scores.calcular_para_todas_empresas(): cron diario,
    encola por empresa.
  - intel_scores.invalidar_por_licitacion(licitacion_id): cuando cambia
    una licitación (M1 ingesta), invalidar todas sus filas en cache.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.core.enums import EstadoAnalisisPliego
from app.intel.scoring.empresa_context import (
    build_empresa_static_profile,
    compute_empresa_context_hash,
    evaluate_empresa_for_licitacion,
)
from app.intel.scoring.service import LicitacionInput, score_licitacion
from app.models.empresa import Empresa
from app.models.licitacion import Licitacion
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA
from app.models.licitacion_score_empresa import LicitacionScoreEmpresa
from app.services.recomendacion_evaluator import calcular_recomendacion

logger = logging.getLogger(__name__)


def _new_session_factory() -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _dias_a_cierre(licitacion: Licitacion) -> int | None:
    if licitacion.fecha_limite is None:
        return None
    delta = licitacion.fecha_limite - datetime.now(timezone.utc)
    return delta.days


def _licitacion_to_input(lic: Licitacion) -> LicitacionInput:
    cpv = lic.cpv_codes[0] if lic.cpv_codes else None
    nuts = lic.provincias[0] if lic.provincias else None
    return LicitacionInput(
        codi_organ=str(lic.organismo_id) if lic.organismo_id else "unknown",
        codi_cpv=cpv,
        tipus_contracte="Obres",
        presupuesto=float(lic.importe_licitacion) if lic.importe_licitacion is not None else None,
        lloc_execucio=None,
        codi_nuts=nuts,
        dias_a_cierre=_dias_a_cierre(lic),
    )


async def _has_fresh_scores(
    session: AsyncSession, empresa_id: uuid.UUID, hash_actual: str
) -> bool:
    """¿Tenemos scores con este hash para la empresa? (Sample 1 fila)."""
    r = await session.execute(
        select(func.count(LicitacionScoreEmpresa.id))
        .where(
            LicitacionScoreEmpresa.empresa_id == empresa_id,
            LicitacionScoreEmpresa.empresa_context_hash == hash_actual,
        )
        .limit(1)
    )
    return r.scalar_one() > 0


async def _run_recalc_empresa(
    Session: async_sessionmaker[AsyncSession],
    empresa_id: uuid.UUID,
    force: bool = False,
) -> dict[str, Any]:
    """Recalcula scores para todas las licitaciones abiertas de una empresa."""
    started = datetime.now()
    result: dict[str, Any] = {
        "empresa_id": str(empresa_id),
        "started_at": started.isoformat(),
        "skipped_no_changes": False,
        "scored": 0,
        "descartadas": 0,
    }

    async with Session() as session:
        profile = await build_empresa_static_profile(session, empresa_id)
        h = compute_empresa_context_hash(profile)
        result["empresa_context_hash"] = h[:16]

        if not force and await _has_fresh_scores(session, empresa_id, h):
            result["skipped_no_changes"] = True
            result["finished_at"] = datetime.now().isoformat()
            return result

        # Cargar licitaciones a scorear: las que tienen fecha_limite futura
        # (abiertas) y no estén descartadas.
        licitaciones = (
            await session.execute(
                select(Licitacion).where(
                    and_(
                        Licitacion.fecha_limite.is_not(None),
                        Licitacion.fecha_limite > datetime.now(timezone.utc),
                    )
                )
            )
        ).scalars().all()

        result["n_licitaciones"] = len(licitaciones)

        # ── Pre-cargar análisis IA disponibles (Phase 2) ─────────────
        # Bulk select. Indexar por licitacion_id para lookup O(1) en el loop.
        # Solo análisis completados — los demás estados (pendiente, error)
        # se tratan como "sin análisis" → señal pliego_check neutro.
        lic_ids = [l.id for l in licitaciones]
        analisis_q = await session.execute(
            select(LicitacionAnalisisIA).where(
                LicitacionAnalisisIA.licitacion_id.in_(lic_ids),
                LicitacionAnalisisIA.estado == EstadoAnalisisPliego.completado,
            )
        )
        analisis_by_lic: dict[uuid.UUID, LicitacionAnalisisIA] = {
            a.licitacion_id: a for a in analisis_q.scalars().all()
        }
        result["analisis_disponibles"] = len(analisis_by_lic)

        rows: list[dict[str, Any]] = []
        for lic in licitaciones:
            ctx = evaluate_empresa_for_licitacion(profile, lic)
            lic_input = _licitacion_to_input(lic)

            # Resolver veredicto del pliego si hay análisis (Phase 2)
            pliego_veredicto: str | None = None
            pliego_razones_no: list[str] | None = None
            pliego_riesgo_count = 0
            an = analisis_by_lic.get(lic.id)
            if an is not None and an.extracted_data:
                try:
                    rec = await calcular_recomendacion(session, an.extracted_data, empresa_id)
                    pliego_veredicto = rec.veredicto
                    pliego_razones_no = list(rec.razones_no) if rec.razones_no else None
                    pliego_riesgo_count = len(rec.razones_riesgo) if rec.razones_riesgo else 0
                except Exception as e:
                    logger.warning(
                        "Recomendación falló para licitacion %s — score sigue sin pliego: %s",
                        lic.id, e,
                    )

            score = await score_licitacion(
                session, lic_input, ctx,
                pliego_veredicto=pliego_veredicto,
                pliego_razones_no=pliego_razones_no,
                pliego_razones_riesgo_count=pliego_riesgo_count,
            )
            d = score.to_dict()
            rows.append({
                "empresa_id": empresa_id,
                "licitacion_id": lic.id,
                "score": d["score"],
                "confidence": d["confidence"],
                "descartada": d["descartada"],
                "reason_descarte": d["reason_descarte"],
                "data_completeness_pct": d["data_completeness_pct"],
                "breakdown_json": d["breakdown"],
                "hard_filters_json": d["hard_filters"],
                "empresa_context_hash": h,
                "computed_at": func.now(),
            })
            if d["descartada"]:
                result["descartadas"] += 1
            else:
                result["scored"] += 1

        # Bulk upsert: ON CONFLICT (empresa_id, licitacion_id) DO UPDATE
        if rows:
            CHUNK = 500
            for i in range(0, len(rows), CHUNK):
                sub = rows[i : i + CHUNK]
                stmt = pg_insert(LicitacionScoreEmpresa).values(sub)
                stmt = stmt.on_conflict_do_update(
                    index_elements=["empresa_id", "licitacion_id"],
                    set_={
                        "score": stmt.excluded.score,
                        "confidence": stmt.excluded.confidence,
                        "descartada": stmt.excluded.descartada,
                        "reason_descarte": stmt.excluded.reason_descarte,
                        "data_completeness_pct": stmt.excluded.data_completeness_pct,
                        "breakdown_json": stmt.excluded.breakdown_json,
                        "hard_filters_json": stmt.excluded.hard_filters_json,
                        "empresa_context_hash": stmt.excluded.empresa_context_hash,
                        "computed_at": func.now(),
                        "updated_at": func.now(),
                    },
                )
                await session.execute(stmt)
            await session.commit()

        # Borrar entries de licitaciones que ya no están en el feed (cerradas)
        await session.execute(text(
            """
            DELETE FROM licitacion_score_empresa lse
            WHERE lse.empresa_id = :emp
              AND NOT EXISTS (
                SELECT 1 FROM licitaciones l
                WHERE l.id = lse.licitacion_id
                  AND l.fecha_limite > now()
              )
            """
        ), {"emp": empresa_id})
        await session.commit()

    result["finished_at"] = datetime.now().isoformat()
    result["duration_seconds"] = (datetime.now() - started).total_seconds()
    return result


async def _run_recalc_todas(
    Session: async_sessionmaker[AsyncSession],
) -> dict[str, Any]:
    """Recalcula para todas las empresas activas. Secuencial — el bottleneck
    es DB, paralelizar daría poca ganancia y aumentaría lock contention."""
    async with Session() as session:
        empresas = (
            await session.execute(
                select(Empresa.id).where(Empresa.deleted_at.is_(None))
            )
        ).scalars().all()

    summary: dict[str, Any] = {
        "started_at": datetime.now().isoformat(),
        "n_empresas": len(empresas),
        "results": [],
    }
    for emp_id in empresas:
        try:
            r = await _run_recalc_empresa(Session, emp_id)
            summary["results"].append(r)
        except Exception as e:
            logger.exception("recalc empresa %s falló", emp_id)
            summary["results"].append({"empresa_id": str(emp_id), "error": str(e)})

    summary["finished_at"] = datetime.now().isoformat()
    return summary


# ---------------------------------------------------------------------------
# Celery tasks
# ---------------------------------------------------------------------------


@celery_app.task(name="workers.intel_scores.calcular_para_empresa")
def calcular_para_empresa(empresa_id: str, force: bool = False) -> dict[str, Any]:
    """Recalcula scores de una empresa concreta."""
    Session = _new_session_factory()
    try:
        emp_uuid = uuid.UUID(empresa_id)
        return asyncio.run(_run_recalc_empresa(Session, emp_uuid, force=force))
    except Exception as e:
        logger.exception("calcular_para_empresa failed")
        return {"ok": False, "error": str(e)}


@celery_app.task(name="workers.intel_scores.calcular_para_todas_empresas")
def calcular_para_todas_empresas() -> dict[str, Any]:
    """Cron diario tras feed M1 + refresh mviews."""
    Session = _new_session_factory()
    try:
        return asyncio.run(_run_recalc_todas(Session))
    except Exception as e:
        logger.exception("calcular_para_todas_empresas failed")
        return {"ok": False, "error": str(e)}
