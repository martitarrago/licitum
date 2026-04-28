"""CLI para lanzar backfill PSCP ad-hoc (sin Celery, ejecución directa).

Uso:
    # Backfill desde una fecha hasta hoy
    PYTHONIOENCODING=utf-8 backend/.venv/Scripts/python.exe \
        backend/scripts/data_audit/run_backfill.py --start 2026-01-01

    # Backfill rango específico
    PYTHONIOENCODING=utf-8 backend/.venv/Scripts/python.exe \
        backend/scripts/data_audit/run_backfill.py --start 2020-01-01 --end 2021-01-01
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.config import settings  # noqa: E402
from workers.intel_pscp import _run_backfill_range  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill PSCP por rango de fechas")
    parser.add_argument("--start", required=True, help="ISO date YYYY-MM-DD")
    parser.add_argument("--end", default=None, help="ISO date YYYY-MM-DD (default: hoy)")
    parser.add_argument(
        "--chunk-delay",
        type=float,
        default=1.0,
        help="Segundos entre chunks mensuales (throttling)",
    )
    parser.add_argument(
        "--tipus",
        default="Obres",
        help="Filtro tipus_contracte ('' para no filtrar; default 'Obres')",
    )
    args = parser.parse_args()

    start = date.fromisoformat(args.start)
    end = date.fromisoformat(args.end) if args.end else date.today()
    tipus = args.tipus or None

    print(f"Backfill {start} → {end}  tipus={tipus}  delay={args.chunk_delay}s")
    print()

    engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    summary = await _run_backfill_range(
        start, end, Session, delay_between_chunks=args.chunk_delay, tipus_contracte=tipus
    )

    print()
    print("=" * 70)
    print("BACKFILL TERMINADO")
    print("=" * 70)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
