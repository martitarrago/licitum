"""Worker para el data layer PSCP — motor de ganabilidad (Phase 1).

DIFERENTE de `workers/ingesta_pscp.py` (que pobla `licitaciones` para M1 Radar
con licitaciones abiertas). Este worker pobla `pscp_adjudicacion` con HISTÓRICO
DE ADJUDICACIONES para análisis (competencia, baja, feudos).

Spec: docs/data-science/architecture.md sección 5.

Tareas:
  - intel_pscp_backfill_chunk(start_iso, end_iso): backfill de un rango.
  - intel_pscp_incremental_sync(): pull de las últimas 36h, schedule diario.
  - intel_pscp_refresh_mviews(): placeholder hasta migración 0016.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.intel.pscp.client import PscpClient
from app.intel.pscp.upsert import UpsertStats, upsert_batch
from app.models.pscp import PscpSyncLog

logger = logging.getLogger(__name__)


def _new_session_factory() -> async_sessionmaker[AsyncSession]:
    """Engine con NullPool (Celery worker, sin pool sharing)."""
    engine = create_async_engine(
        settings.database_url,
        poolclass=NullPool,
        echo=False,
    )
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _log_start(session: AsyncSession, sync_type: str, metadata: dict[str, Any]) -> int:
    """Registra inicio en pscp_sync_log y devuelve el id."""
    log = PscpSyncLog(sync_type=sync_type, metadata_json=metadata)
    session.add(log)
    await session.flush()
    log_id = log.id
    await session.commit()
    return log_id


async def _log_finish(
    Session: async_sessionmaker[AsyncSession],
    log_id: int,
    stats: UpsertStats | None,
    error: str | None,
    extra_metadata: dict[str, Any] | None = None,
) -> None:
    async with Session() as s:
        values: dict[str, Any] = {
            "finished_at": func.now(),
            "error": error,
        }
        if stats is not None:
            values["records_inserted"] = stats.inserted
            values["records_updated"] = stats.updated
            values["records_unchanged"] = stats.unchanged
            values["records_fetched"] = stats.inserted + stats.updated + stats.unchanged
        if extra_metadata is not None:
            existing = await s.execute(
                select(PscpSyncLog.metadata_json).where(PscpSyncLog.id == log_id)
            )
            md = existing.scalar_one() or {}
            md.update(extra_metadata)
            values["metadata_json"] = md
        await s.execute(update(PscpSyncLog).where(PscpSyncLog.id == log_id).values(**values))
        await s.commit()


async def _run_backfill_chunk(
    start_iso: str,
    end_iso: str,
    Session: async_sessionmaker[AsyncSession],
) -> tuple[UpsertStats, int]:
    """Lógica núcleo de backfill — separada de Celery para poder testearla."""
    where = (
        f"data_publicacio_adjudicacio >= '{start_iso}' "
        f"AND data_publicacio_adjudicacio < '{end_iso}'"
    )
    stats = UpsertStats()

    async with Session() as session:
        log_id = await _log_start(
            session,
            "backfill",
            {"start": start_iso, "end": end_iso},
        )

    async with PscpClient(rate_limit_delay=0.2) as client:
        total_count = await client.count(where=where)
        logger.info("backfill chunk %s..%s: %d registros esperados", start_iso, end_iso, total_count)

        async for batch in client.iter_records(where=where):
            async with Session() as session:
                batch_stats = await upsert_batch(session, batch)
                await session.commit()
                stats.inserted += batch_stats.inserted
                stats.updated += batch_stats.updated
                stats.unchanged += batch_stats.unchanged
            logger.info(
                "  batch +%d (acumulado: ins=%d upd=%d unc=%d)",
                len(batch), stats.inserted, stats.updated, stats.unchanged,
            )

    await _log_finish(Session, log_id, stats, None, {"expected_count": total_count})
    return stats, log_id


async def _run_incremental_sync(
    Session: async_sessionmaker[AsyncSession],
    lookback_hours: int = 36,
) -> tuple[UpsertStats, int]:
    """Pull registros con `data_publicacio_adjudicacio` en las últimas N horas."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    cutoff_iso = cutoff.strftime("%Y-%m-%dT%H:%M:%S.000")

    where = f"data_publicacio_adjudicacio > '{cutoff_iso}'"
    stats = UpsertStats()

    async with Session() as session:
        log_id = await _log_start(
            session,
            "incremental",
            {"cutoff_iso": cutoff_iso, "lookback_hours": lookback_hours},
        )

    async with PscpClient(rate_limit_delay=0.1) as client:
        async for batch in client.iter_records(where=where):
            async with Session() as session:
                batch_stats = await upsert_batch(session, batch)
                await session.commit()
                stats.inserted += batch_stats.inserted
                stats.updated += batch_stats.updated
                stats.unchanged += batch_stats.unchanged

    await _log_finish(Session, log_id, stats, None)
    return stats, log_id


def _month_chunks(start: date, end: date) -> list[tuple[str, str]]:
    """Genera chunks ISO de un mes cada uno entre [start, end).

    Devuelve [(start_iso, end_iso), ...] con start_iso < end_iso.
    """
    chunks: list[tuple[str, str]] = []
    cur = date(start.year, start.month, 1)
    while cur < end:
        # Primer día del mes siguiente
        if cur.month == 12:
            nxt = date(cur.year + 1, 1, 1)
        else:
            nxt = date(cur.year, cur.month + 1, 1)
        chunks.append(
            (f"{cur.isoformat()}T00:00:00.000", f"{min(nxt, end).isoformat()}T00:00:00.000")
        )
        cur = nxt
    return chunks


async def _run_backfill_range(
    start: date,
    end: date,
    Session: async_sessionmaker[AsyncSession],
    delay_between_chunks: float = 1.0,
) -> dict[str, Any]:
    """Orquesta backfill mes a mes en [start, end). Resiliente a fallos por chunk.

    Cada chunk se commitea de forma independiente. Si un chunk falla, log
    + continuamos con el siguiente.
    """
    chunks = _month_chunks(start, end)
    logger.info("backfill range %s..%s en %d chunks mensuales", start, end, len(chunks))

    summary: dict[str, Any] = {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "chunks_total": len(chunks),
        "chunks_ok": 0,
        "chunks_failed": 0,
        "inserted": 0,
        "updated": 0,
        "unchanged": 0,
        "failed_chunks": [],
    }

    started_at = datetime.now()
    for i, (chunk_start, chunk_end) in enumerate(chunks, 1):
        chunk_started = datetime.now()
        try:
            stats, log_id = await _run_backfill_chunk(chunk_start, chunk_end, Session)
            summary["chunks_ok"] += 1
            summary["inserted"] += stats.inserted
            summary["updated"] += stats.updated
            summary["unchanged"] += stats.unchanged
            elapsed = (datetime.now() - chunk_started).total_seconds()
            total_elapsed = (datetime.now() - started_at).total_seconds()
            logger.info(
                "[%d/%d] %s..%s: ins=%d upd=%d unc=%d (%.1fs chunk, %.0fs total)",
                i, len(chunks), chunk_start[:10], chunk_end[:10],
                stats.inserted, stats.updated, stats.unchanged,
                elapsed, total_elapsed,
            )
        except Exception as e:
            summary["chunks_failed"] += 1
            summary["failed_chunks"].append(
                {"start": chunk_start, "end": chunk_end, "error": str(e)}
            )
            logger.exception(
                "[%d/%d] chunk %s..%s falló: %s",
                i, len(chunks), chunk_start[:10], chunk_end[:10], e,
            )

        if delay_between_chunks > 0 and i < len(chunks):
            await asyncio.sleep(delay_between_chunks)

    summary["total_seconds"] = (datetime.now() - started_at).total_seconds()
    return summary


# ---------------------------------------------------------------------------
# Celery tasks
# ---------------------------------------------------------------------------


@celery_app.task(name="workers.intel_pscp.backfill_chunk")
def intel_pscp_backfill_chunk(start_iso: str, end_iso: str) -> dict[str, Any]:
    """Backfill PSCP entre dos fechas (formato `YYYY-MM-DDTHH:MM:SS.000`)."""
    Session = _new_session_factory()
    try:
        stats, log_id = asyncio.run(_run_backfill_chunk(start_iso, end_iso, Session))
        return {
            "ok": True,
            "log_id": log_id,
            "inserted": stats.inserted,
            "updated": stats.updated,
            "unchanged": stats.unchanged,
        }
    except Exception as e:
        logger.exception("backfill chunk failed")
        return {"ok": False, "error": str(e)}


@celery_app.task(name="workers.intel_pscp.backfill_range")
def intel_pscp_backfill_range(start_iso_date: str, end_iso_date: str) -> dict[str, Any]:
    """Backfill PSCP en rango de fechas, mes a mes. `YYYY-MM-DD`."""
    Session = _new_session_factory()
    try:
        start = date.fromisoformat(start_iso_date)
        end = date.fromisoformat(end_iso_date)
        summary = asyncio.run(_run_backfill_range(start, end, Session))
        return {"ok": True, **summary}
    except Exception as e:
        logger.exception("backfill range failed")
        return {"ok": False, "error": str(e)}


@celery_app.task(name="workers.intel_pscp.incremental_sync")
def intel_pscp_incremental_sync(lookback_hours: int = 36) -> dict[str, Any]:
    """Sync incremental — schedule diario."""
    Session = _new_session_factory()
    try:
        stats, log_id = asyncio.run(_run_incremental_sync(Session, lookback_hours))
        return {
            "ok": True,
            "log_id": log_id,
            "inserted": stats.inserted,
            "updated": stats.updated,
            "unchanged": stats.unchanged,
        }
    except Exception as e:
        logger.exception("incremental sync failed")
        return {"ok": False, "error": str(e)}


async def _has_real_changes_since_last_refresh(session: AsyncSession) -> int:
    """Cuenta filas con updated_at posterior al último mview_refresh exitoso.

    Si devuelve 0, no hay cambios reales y el refresh se puede saltar.
    """
    # Último mview_refresh exitoso (sin error y con finished_at)
    last_refresh = await session.execute(
        select(PscpSyncLog.finished_at)
        .where(
            PscpSyncLog.sync_type == "mview_refresh",
            PscpSyncLog.error.is_(None),
            PscpSyncLog.finished_at.is_not(None),
        )
        .order_by(PscpSyncLog.finished_at.desc())
        .limit(1)
    )
    last_at = last_refresh.scalar()

    if last_at is None:
        # Nunca hemos refrescado — siempre hacer la primera
        return -1

    from app.models.pscp import PscpAdjudicacion

    count_stmt = (
        select(func.count(PscpAdjudicacion.id))
        .where(PscpAdjudicacion.updated_at > last_at)
    )
    n = (await session.execute(count_stmt)).scalar_one()
    return int(n)


_MVIEWS = (
    "agg_competencia_organ_cpv",
    "agg_organ_perfil",
    "agg_empresa_perfil",
)


async def _mview_is_populated(conn, view: str) -> bool:
    """Detecta si una mview ya tiene datos (necesario para CONCURRENTLY)."""
    from sqlalchemy import text

    r = await conn.execute(text(f"SELECT count(*) FROM {view}"))
    return r.scalar_one() > 0


async def _run_refresh_mviews(
    Session: async_sessionmaker[AsyncSession],
    force: bool = False,
) -> dict[str, Any]:
    """Refresh de las 3 mviews con skip inteligente y manejo de primer refresh.

    REFRESH CONCURRENTLY requiere que la mview esté ya poblada (al menos una
    REFRESH no-concurrent previa). En la primera ejecución detectamos eso y
    hacemos refresh no-concurrent (lock breve aceptable porque es one-shot).
    """
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    async with Session() as session:
        log_id = await _log_start(session, "mview_refresh", {"force": force})

    extra: dict[str, Any] = {"forced": force}

    async with Session() as session:
        if force:
            real_changes = -1
        else:
            real_changes = await _has_real_changes_since_last_refresh(session)
        extra["real_changes_count"] = real_changes

    if real_changes == 0 and not force:
        logger.info("mview refresh skipped — sin cambios reales desde último refresh")
        await _log_finish(Session, log_id, None, None, {**extra, "skipped": True})
        return {"ok": True, "skipped": True, "real_changes": 0, "log_id": log_id}

    # CONCURRENTLY no acepta transacción → autocommit dedicado
    engine_ac = create_async_engine(
        settings.database_url, poolclass=NullPool, echo=False, isolation_level="AUTOCOMMIT"
    )
    per_view_seconds: dict[str, float] = {}
    used_concurrently: dict[str, bool] = {}
    try:
        async with engine_ac.connect() as conn:
            for view in _MVIEWS:
                already_populated = await _mview_is_populated(conn, view)
                t0 = datetime.now()
                if already_populated:
                    await conn.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view}"))
                    used_concurrently[view] = True
                else:
                    # Primer refresh: no-concurrent (poblar inicial)
                    await conn.execute(text(f"REFRESH MATERIALIZED VIEW {view}"))
                    used_concurrently[view] = False
                per_view_seconds[view] = (datetime.now() - t0).total_seconds()
                logger.info(
                    "refreshed %s in %.2fs (concurrently=%s)",
                    view, per_view_seconds[view], used_concurrently[view],
                )
    finally:
        await engine_ac.dispose()

    extra["per_view_seconds"] = per_view_seconds
    extra["used_concurrently"] = used_concurrently
    await _log_finish(Session, log_id, None, None, extra)
    return {
        "ok": True,
        "skipped": False,
        "real_changes": real_changes,
        "log_id": log_id,
        "per_view_seconds": per_view_seconds,
    }


@celery_app.task(name="workers.intel_pscp.refresh_mviews")
def intel_pscp_refresh_mviews(force: bool = False) -> dict[str, Any]:
    """Refresh CONCURRENTLY de las 3 mviews. Skip si no hay cambios reales."""
    Session = _new_session_factory()
    try:
        return asyncio.run(_run_refresh_mviews(Session, force=force))
    except Exception as e:
        logger.exception("refresh_mviews failed")
        return {"ok": False, "error": str(e)}
