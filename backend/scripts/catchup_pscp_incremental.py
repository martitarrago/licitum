"""
Catch-up del cron `intel-pscp-incremental` que estuvo caído desde 2026-05-02.

Llama a `_run_incremental_sync` con lookback de 5 días para recuperar las
adjudicaciones perdidas, y luego refresca las mviews. Equivalente a las 3
ejecuciones del cron que se perdieron (3, 4, 5 de mayo a las 06:00 Madrid).

Causa root del fallo: el worker de Railway se reinicia frecuentemente con cada
push, y a veces arranca DESPUÉS de las 04:00 UTC (= 06:00 Madrid) del cron
diario, perdiendo la ventana de Beat. Solución de fondo a evaluar: cambiar
horario del cron a una franja con menos pushes (ej. 22:00 UTC).

Uso: cd backend && .venv/Scripts/python.exe scripts/catchup_pscp_incremental.py
"""
from __future__ import annotations

import asyncio
import sys
import time

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

sys.path.insert(0, ".")
from app.config import settings


async def main() -> None:
    from workers.intel_pscp import _run_incremental_sync, _run_refresh_mviews

    engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print("[1/2] incremental_sync lookback=120h tipus=Obres", flush=True)
    t0 = time.time()
    r1 = await _run_incremental_sync(Session, lookback_hours=120, tipus_contracte="Obres")
    print(f"  done in {time.time()-t0:.1f}s -> {r1}", flush=True)

    print("\n[2/2] refresh_mviews force=True", flush=True)
    t0 = time.time()
    r2 = await _run_refresh_mviews(Session, force=True)
    print(f"  done in {time.time()-t0:.1f}s -> {r2}", flush=True)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
