"""
Phase 0 data audit — PSCP dataset ybgg-dgi6.

Mide cobertura de campos críticos para el motor de ganabilidad:
  - ofertes_rebudes (competencia)
  - identificacio_adjudicatari + CIF normalizado (feudos)
  - import_adjudicacio_sense + pressupost_licitacio_sense (baja)
  - codi_cpv, nom_organ, procediment (clusterización)

Output:
  - data/pscp_distributions.json — counts por dimensión
  - data/pscp_sample_adjudicats.json — muestra de 5000 adjudicados
  - data/pscp_coverage.json — % cobertura por campo en la muestra
  - stdout: resumen ejecutivo
"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

import httpx

BASE = "https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json"
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

CRITICAL_FIELDS = [
    "ofertes_rebudes",
    "identificacio_adjudicatari",
    "tipus_identificacio_adjudicatari",
    "denominacio_adjudicatari",
    "import_adjudicacio_sense",
    "import_adjudicacio_amb_iva",
    "pressupost_licitacio_sense",
    "pressupost_licitacio_sense_1",
    "valor_estimat_expedient",
    "codi_cpv",
    "nom_organ",
    "codi_organ",
    "procediment",
    "tipus_contracte",
    "data_publicacio_adjudicacio",
    "data_adjudicacio_contracte",
    "data_formalitzacio_contracte",
    "resultat",
    "fase_publicacio",
    "lloc_execucio",
    "codi_nuts",
]


def fetch(params: dict, retries: int = 3) -> list[dict]:
    last_err = None
    for attempt in range(retries):
        try:
            with httpx.Client(timeout=120.0) as c:
                r = c.get(BASE, params=params)
                r.raise_for_status()
                return r.json()
        except Exception as e:
            last_err = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"fetch failed after {retries} retries: {last_err}")


def group_count(field: str, where: str | None = None, limit: int = 50) -> list[dict]:
    params = {
        "$select": f"{field}, count(*) as n",
        "$group": field,
        "$order": "n DESC",
        "$limit": str(limit),
    }
    if where:
        params["$where"] = where
    return fetch(params)


def parse_first_amount(raw: Any) -> float | None:
    """import_adjudicacio_sense viene como texto, posibles múltiples lots con '||'."""
    if raw is None or raw == "":
        return None
    s = str(raw).split("||")[0].strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def is_present(v: Any) -> bool:
    if v is None:
        return False
    if isinstance(v, str) and v.strip() == "":
        return False
    return True


def main() -> None:
    distributions: dict[str, Any] = {}

    print("=" * 70)
    print("PHASE 0 — PSCP DATA AUDIT (ybgg-dgi6)")
    print("=" * 70)

    # 1. Distribución por fase_publicacio (estado del expediente)
    print("\n[1/6] Distribución por fase_publicacio (top 30)…")
    fases = group_count("fase_publicacio", limit=30)
    distributions["fase_publicacio"] = fases
    for row in fases[:15]:
        print(f"   {row.get('fase_publicacio', '<null>'):60} {row['n']:>10}")

    # 2. Distribución por resultat
    print("\n[2/6] Distribución por resultat…")
    resultats = group_count("resultat", limit=30)
    distributions["resultat"] = resultats
    for row in resultats[:15]:
        print(f"   {row.get('resultat', '<null>'):60} {row['n']:>10}")

    # 3. Distribución por procediment
    print("\n[3/6] Distribución por procediment…")
    procs = group_count("procediment", limit=30)
    distributions["procediment"] = procs
    for row in procs[:15]:
        print(f"   {row.get('procediment', '<null>'):60} {row['n']:>10}")

    # 4. Distribución por tipus_contracte
    print("\n[4/6] Distribución por tipus_contracte…")
    tipus = group_count("tipus_contracte", limit=30)
    distributions["tipus_contracte"] = tipus
    for row in tipus[:15]:
        print(f"   {row.get('tipus_contracte', '<null>'):60} {row['n']:>10}")

    # Save distributions
    (DATA_DIR / "pscp_distributions.json").write_text(
        json.dumps(distributions, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # 5. Sample 5000 adjudicated records, last 365d
    print("\n[5/6] Bajando muestra de 5000 adjudicaciones (últimos 365 días)…")
    where = (
        "data_publicacio_adjudicacio IS NOT NULL "
        "AND data_publicacio_adjudicacio > '2025-04-28T00:00:00.000'"
    )
    sample: list[dict] = []
    page = 1000
    for offset in range(0, 5000, page):
        batch = fetch({
            "$where": where,
            "$order": "data_publicacio_adjudicacio DESC",
            "$limit": str(page),
            "$offset": str(offset),
        })
        sample.extend(batch)
        print(f"     +{len(batch)} (acumulado {len(sample)})")
        if len(batch) < page:
            break

    (DATA_DIR / "pscp_sample_adjudicats.json").write_text(
        json.dumps(sample, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"   Total muestra: {len(sample)}")

    # 6. Coverage analysis
    print("\n[6/6] Cobertura por campo en muestra de adjudicados:")
    n = len(sample)
    coverage = {}
    for f in CRITICAL_FIELDS:
        present = sum(1 for r in sample if is_present(r.get(f)))
        pct = (present / n * 100) if n else 0
        coverage[f] = {"present": present, "total": n, "pct": round(pct, 2)}
        marker = "✓" if pct >= 80 else ("~" if pct >= 50 else "✗")
        print(f"   {marker} {f:45} {present:>6}/{n}  {pct:6.2f}%")

    # 6b. Análisis específico ofertes_rebudes
    print("\n[6b] Distribución ofertes_rebudes (cuántos competidores en cada licitación):")
    ofertes = [r.get("ofertes_rebudes") for r in sample if is_present(r.get("ofertes_rebudes"))]
    ofertes_int = []
    for v in ofertes:
        try:
            ofertes_int.append(int(v))
        except (ValueError, TypeError):
            pass
    if ofertes_int:
        ofertes_int.sort()
        avg = sum(ofertes_int) / len(ofertes_int)
        median = ofertes_int[len(ofertes_int) // 2]
        print(f"   n={len(ofertes_int)}  media={avg:.2f}  mediana={median}")
        bins = Counter()
        for v in ofertes_int:
            if v == 0:
                bins["0"] += 1
            elif v == 1:
                bins["1"] += 1
            elif v <= 3:
                bins["2-3"] += 1
            elif v <= 5:
                bins["4-5"] += 1
            elif v <= 10:
                bins["6-10"] += 1
            else:
                bins["11+"] += 1
        for bucket in ["0", "1", "2-3", "4-5", "6-10", "11+"]:
            cnt = bins.get(bucket, 0)
            pct = cnt / len(ofertes_int) * 100
            print(f"     {bucket:8} {cnt:>6}  ({pct:5.1f}%)")
        coverage["_ofertes_rebudes_dist"] = {
            "n": len(ofertes_int),
            "avg": avg,
            "median": median,
            "buckets": dict(bins),
        }

    # 6c. Cobertura cruzada por procediment (¿en qué procedimientos falta más datos?)
    print("\n[6c] Cobertura ofertes_rebudes x procediment:")
    by_proc: dict[str, dict[str, int]] = {}
    for r in sample:
        p = r.get("procediment") or "<null>"
        by_proc.setdefault(p, {"total": 0, "with_ofertes": 0, "with_cif": 0, "with_import": 0})
        by_proc[p]["total"] += 1
        if is_present(r.get("ofertes_rebudes")):
            by_proc[p]["with_ofertes"] += 1
        if is_present(r.get("identificacio_adjudicatari")):
            by_proc[p]["with_cif"] += 1
        if is_present(r.get("import_adjudicacio_sense")):
            by_proc[p]["with_import"] += 1

    sorted_procs = sorted(by_proc.items(), key=lambda x: -x[1]["total"])[:10]
    print(f"   {'procediment':<55} {'tot':>5} {'ofer%':>6} {'cif%':>6} {'imp%':>6}")
    for p, s in sorted_procs:
        of_p = s["with_ofertes"] / s["total"] * 100
        cif_p = s["with_cif"] / s["total"] * 100
        imp_p = s["with_import"] / s["total"] * 100
        print(f"   {p[:55]:<55} {s['total']:>5} {of_p:>5.1f}% {cif_p:>5.1f}% {imp_p:>5.1f}%")
    coverage["_by_procediment"] = {p: s for p, s in by_proc.items()}

    # 6d. CIF normalization sample
    print("\n[6d] Muestra de CIFs (primeros 20 únicos para ver formato):")
    cifs = []
    seen = set()
    for r in sample:
        c = r.get("identificacio_adjudicatari")
        t = r.get("tipus_identificacio_adjudicatari")
        if is_present(c) and c not in seen:
            cifs.append((t, c, r.get("denominacio_adjudicatari", "")))
            seen.add(c)
            if len(cifs) >= 20:
                break
    for t, c, d in cifs:
        print(f"     [{t or '?':10}] {c:25} {(d or '')[:50]}")

    # 6e. Baja calculation feasibility
    print("\n[6e] Cálculo de baja sobre muestra (importe adjudicación / presupuesto):")
    bajas = []
    for r in sample:
        imp = parse_first_amount(r.get("import_adjudicacio_sense"))
        pres = r.get("pressupost_licitacio_sense") or r.get("pressupost_licitacio_sense_1")
        try:
            pres_f = float(pres) if pres else None
        except (ValueError, TypeError):
            pres_f = None
        if imp and pres_f and pres_f > 0:
            baja = (1 - imp / pres_f) * 100
            if -50 < baja < 80:  # filter out absurd values
                bajas.append(baja)
    if bajas:
        bajas.sort()
        avg_b = sum(bajas) / len(bajas)
        med_b = bajas[len(bajas) // 2]
        print(f"   bajas calculables: {len(bajas)}/{n} ({len(bajas)/n*100:.1f}%)")
        print(f"   baja media: {avg_b:.2f}%   mediana: {med_b:.2f}%")
        print(f"   p10={bajas[len(bajas)//10]:.2f}%  p90={bajas[len(bajas)*9//10]:.2f}%")
        coverage["_baja"] = {
            "calculable_pct": round(len(bajas) / n * 100, 2),
            "avg": round(avg_b, 2),
            "median": round(med_b, 2),
        }
    else:
        print("   ✗ baja no calculable en la muestra")

    (DATA_DIR / "pscp_coverage.json").write_text(
        json.dumps(coverage, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n" + "=" * 70)
    print("AUDIT COMPLETO. Archivos en backend/scripts/data_audit/data/")
    print("=" * 70)


if __name__ == "__main__":
    sys.exit(main())
