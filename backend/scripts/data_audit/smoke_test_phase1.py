"""Smoke test Phase 1: imports OK + normalize_cif sobre CIFs reales del audit
+ tiny backfill (24h) contra Supabase.

Uso:
    PYTHONIOENCODING=utf-8 backend/.venv/Scripts/python.exe \
        backend/scripts/data_audit/smoke_test_phase1.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.intel.pscp.hashing import compute_content_hash  # noqa: E402
from app.intel.pscp.normalize import explode_ute, normalize_cif  # noqa: E402
from app.models.pscp import PscpAdjudicacion  # noqa: E402, F401
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.config import settings  # noqa: E402
from workers.intel_pscp import _run_incremental_sync  # noqa: E402


def test_normalize_cif():
    print("\n[1] normalize_cif sobre CIFs reales del audit:")
    cases = [
        ("B17951930", "MULTISERVEIS CLARANA SL"),
        ("ESB17951930", "con prefijo VAT"),
        ("b17951930", "lowercase"),
        ("B-17951930", "con guion"),
        ("B 17951930", "con espacio"),
        ("*** 0768 **", "anonimizada"),
        ("B50819507||B58903295", "UTE en cif crudo"),  # split lo hace explode_ute
        ("12345678Z", "NIF persona física"),
        ("X1234567L", "NIE"),
        ("XX99999999", "extranjera no estándar"),
        ("", "vacío"),
        (None, "None"),
    ]
    for raw, comment in cases:
        n = normalize_cif(raw)
        print(f"   raw={raw!r:30} -> cif={n.cif:25} pj={not n.is_persona_fisica} pf={n.is_persona_fisica} anon={n.is_anonimizada} extr={n.is_extranjera} cs_ok={n.checksum_valid}  ({comment})")


def test_explode_ute():
    print("\n[2] explode_ute sobre UTEs reales:")
    raw_cif = "B50819507||B58903295||B60579240"
    raw_denom = "EMPRESA UNO, SL||EMPRESA DOS, SL||EMPRESA TRES, SL"
    rows = explode_ute(raw_cif, raw_denom)
    for norm, denom in rows:
        print(f"   {norm.cif} → {denom}")


def test_hash():
    print("\n[3] content_hash determinístico:")
    rec_a = {
        "codi_expedient": "EXP-001",
        "ofertes_rebudes": "3",
        "import_adjudicacio_sense": "100000",
        "fase_publicacio": "Adjudicació",
    }
    rec_b = dict(rec_a)
    rec_c = dict(rec_a, ofertes_rebudes="4")
    h_a, h_b, h_c = compute_content_hash(rec_a), compute_content_hash(rec_b), compute_content_hash(rec_c)
    print(f"   hash(a) == hash(b): {h_a == h_b}  (esperado True)")
    print(f"   hash(a) != hash(c): {h_a != h_c}  (esperado True)")


async def test_tiny_backfill():
    print("\n[4] Tiny backfill: últimas 24h de adjudicaciones contra Supabase…")
    engine = create_async_engine(settings.database_url, poolclass=NullPool, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    stats, log_id = await _run_incremental_sync(Session, lookback_hours=24)
    print(f"   log_id={log_id}  inserted={stats.inserted}  updated={stats.updated}  unchanged={stats.unchanged}")

    # Verificación: contar registros en la tabla
    async with Session() as s:
        from sqlalchemy import func
        total = await s.execute(select(func.count(PscpAdjudicacion.id)))
        n_total = total.scalar_one()
        adjudicados = await s.execute(
            select(func.count(PscpAdjudicacion.id)).where(
                PscpAdjudicacion.data_publicacio_adjudicacio.isnot(None)
            )
        )
        n_adj = adjudicados.scalar_one()
        with_ofertes = await s.execute(
            select(func.count(PscpAdjudicacion.id)).where(
                PscpAdjudicacion.ofertes_rebudes.isnot(None)
            )
        )
        n_of = with_ofertes.scalar_one()
        with_baja = await s.execute(
            select(func.count(PscpAdjudicacion.id)).where(
                PscpAdjudicacion.baja_pct.isnot(None)
            )
        )
        n_baja = with_baja.scalar_one()
        print(f"   total registros tabla: {n_total}")
        print(f"   con data_adjudicacio: {n_adj}")
        print(f"   con ofertes_rebudes:  {n_of}")
        print(f"   con baja_pct calc:    {n_baja}  (verifica que GENERATED column funciona)")


def main():
    print("=" * 70)
    print("SMOKE TEST PHASE 1")
    print("=" * 70)
    test_normalize_cif()
    test_explode_ute()
    test_hash()
    asyncio.run(test_tiny_backfill())
    print("\n" + "=" * 70)
    print("OK")
    print("=" * 70)


if __name__ == "__main__":
    main()
