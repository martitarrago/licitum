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
from datetime import datetime, timedelta, timezone
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


@celery_app.task(name="workers.intel_pscp.refresh_mviews")
def intel_pscp_refresh_mviews() -> dict[str, Any]:
    """Placeholder — las mviews se crean en migración 0016 (post-backfill)."""
    logger.info("intel_pscp_refresh_mviews: skip (mviews not yet created)")
    return {"ok": True, "skipped": True, "reason": "mviews not yet created"}
