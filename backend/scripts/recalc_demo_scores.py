"""
Recalcula scores de la empresa demo (Bosch) usando el motor actual.

Wrapper sobre `_run_recalc_empresa(force=True)` para forzar persistencia
inmediata en BD tras cambios en composite/empresa_context. Usa el cron path
real (no el bulk in-memory del test pertinente) — más lento pero idempotente
con la lógica de producción.

Uso: cd backend && .venv/Scripts/python.exe scripts/recalc_demo_scores.py
"""
from __future__ import annotations

import asyncio
import sys
import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

sys.path.insert(0, ".")
from app.config import settings

EMPRESA_DEMO_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


async def main() -> None:
    from workers.intel_scores import _run_recalc_empresa

    engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    t0 = time.time()
    print(f"[recalc] empresa={EMPRESA_DEMO_ID} force=True", flush=True)
    result = await _run_recalc_empresa(Session, EMPRESA_DEMO_ID, force=True)
    elapsed = time.time() - t0
    print(f"[done] {elapsed:.1f}s", flush=True)
    for k, v in result.items():
        print(f"  {k}: {v}", flush=True)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
