"""
Test pertinente del motor de scoring — 3 empresas representativas, BULK in-memory.

Carga TODAS las agregaciones PSCP (agg_competencia_organ_cpv + agg_organ_perfil)
una sola vez al arranque, y luego puntua las 3 empresas en memoria.

Eso evita las ~20.000 round-trips Win→Supabase EU que hacía la version naive
(score_licitacion serializada por licitacion). Tiempo objetivo: <30s end-to-end.

Empresas:
  1. **Demo (Bosch)** — empresa real existente. PYME mediana C/G cat3, Barcelona.
  2. **Fantasma sin clasif** — micro sin ROLECE ni certificados.
  3. **Grande cat4-5** — 8M€ vol, C/G cat4-5.

Uso: cd backend && .venv/Scripts/python.exe scripts/test_scoring_pertinente.py
"""
from __future__ import annotations

import asyncio
import statistics
import sys
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

sys.path.insert(0, ".")
from app.config import settings

DB = settings.database_url
EMPRESA_DEMO_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


# ─── Empresas ficticias (solo fantasma + grande) ────────────────────────────


@dataclass
class EmpresaFicticia:
    nombre: str
    volumen_n: float
    volumen_n1: float
    volumen_n2: float
    plantilla: int
    presupuesto_min: float
    presupuesto_max: float
    cpv_divisiones: list[str]
    clasif: list[tuple[str, str, str]]
    provincia_codigo: str
    apetito_ute: bool = False


FANTASMA = EmpresaFicticia(
    nombre="[TEST-PERTINENTE] Fantasma sin clasif",
    volumen_n=70_000, volumen_n1=60_000, volumen_n2=50_000, plantilla=2,
    presupuesto_min=5_000, presupuesto_max=90_000,
    cpv_divisiones=["45"], clasif=[],
    provincia_codigo="08",
)

GRANDE = EmpresaFicticia(
    nombre="[TEST-PERTINENTE] Gran constructora cat4-5",
    volumen_n=8_500_000, volumen_n1=7_800_000, volumen_n2=7_000_000, plantilla=120,
    presupuesto_min=700_000, presupuesto_max=15_000_000,
    cpv_divisiones=["45"],
    clasif=[("C", "2", "5"), ("G", "4", "5"), ("G", "6", "5")],
    provincia_codigo="08", apetito_ute=True,
)


async def insertar_empresa(session: AsyncSession, e: EmpresaFicticia) -> uuid.UUID:
    emp_id = uuid.uuid4()
    prov_nombre = {"08": "Barcelona", "17": "Girona", "25": "Lleida", "43": "Tarragona"}[e.provincia_codigo]
    await session.execute(text("""
        INSERT INTO empresas (id, nombre, cif, email,
            direccion_provincia, direccion_provincia_codigo,
            direccion_ciudad, direccion_pais,
            volumen_negocio_n, volumen_negocio_n1, volumen_negocio_n2, plantilla_media,
            created_at, updated_at)
        VALUES (:id, :nombre, :cif, :email,
                :prov_nom, :prov_cod,
                :ciudad, 'ES',
                :vn, :vn1, :vn2, :plantilla, now(), now())
    """), {
        "id": emp_id, "nombre": e.nombre, "cif": f"X{str(emp_id)[:8]}",
        "email": f"test-pert+{str(emp_id)[:8]}@licitum-test.invalid",
        "prov_nom": prov_nombre, "prov_cod": e.provincia_codigo, "ciudad": prov_nombre,
        "vn": e.volumen_n, "vn1": e.volumen_n1, "vn2": e.volumen_n2,
        "plantilla": e.plantilla,
    })

    pref_id = uuid.uuid4()
    await session.execute(text("""
        INSERT INTO empresa_preferencias (id, empresa_id,
            presupuesto_min_interes, presupuesto_max_interes, obras_simultaneas_max,
            obras_simultaneas_actual, apetito_ute, estado_aceptacion,
            created_at, updated_at)
        VALUES (:id, :emp, :pmin, :pmax, 5, 0, :ute, 'acepta', now(), now())
    """), {
        "id": pref_id, "emp": emp_id,
        "pmin": e.presupuesto_min, "pmax": e.presupuesto_max,
        "ute": e.apetito_ute,
    })

    for div in e.cpv_divisiones:
        await session.execute(text("""
            INSERT INTO empresa_preferencias_cpv (id, preferencias_id, cpv_division,
                prioridad, created_at, updated_at)
            VALUES (:id, :pref, :div, 'core', now(), now())
        """), {"id": uuid.uuid4(), "pref": pref_id, "div": div})

    for (g, sg, cat) in e.clasif:
        await session.execute(text("""
            INSERT INTO clasificaciones_rolece (id, empresa_id, grupo, subgrupo, categoria,
                activa, fecha_obtencion, fecha_caducidad, created_at, updated_at)
            VALUES (:id, :emp, :g, :sg, :cat, true, '2020-01-01', '2030-01-01', now(), now())
        """), {"id": uuid.uuid4(), "emp": emp_id, "g": g, "sg": sg, "cat": cat})

    return emp_id


# ─── Bulk pre-fetch del data layer ──────────────────────────────────────────


@dataclass
class CompetenciaRow:
    n_obs: int
    ofertes_avg: float | None
    ofertes_median: float | None
    ofertes_p90: float | None
    pct_oferta_unica: float | None
    baja_avg: float | None
    baja_median: float | None
    baja_p90: float | None


@dataclass
class CompetenciaAgg:
    """Agregación pre-calculada para fallback cpv4 o global."""
    n_obs: int
    ofertes_avg: float | None
    baja_avg: float | None


@dataclass
class OrganPerfil:
    n_adjudicaciones_obras: int | None
    hhi_concentracion: float | None
    top_adjudicatarios: list[dict] | None


class LayerCache:
    """Caches en memoria de las mviews que score_licitacion consulta."""

    def __init__(self) -> None:
        # (organ, cpv4, tipus) -> CompetenciaRow
        self.competencia_exact: dict[tuple[str, str, str], CompetenciaRow] = {}
        # (cpv4, tipus) -> CompetenciaAgg
        self.competencia_cpv4: dict[tuple[str, str], CompetenciaAgg] = {}
        # tipus -> CompetenciaAgg
        self.competencia_global: dict[str, CompetenciaAgg] = {}
        # organ -> OrganPerfil
        self.organ_perfil: dict[str, OrganPerfil] = {}

    async def load(self, session: AsyncSession) -> None:
        t0 = time.time()
        rows = (await session.execute(text(
            "SELECT codi_organ, codi_cpv_4, tipus_contracte, "
            "       n_obs, ofertes_avg, ofertes_median, ofertes_p90, "
            "       pct_oferta_unica, baja_avg, baja_median, baja_p90 "
            "FROM agg_competencia_organ_cpv"
        ))).all()
        for r in rows:
            cell = CompetenciaRow(
                n_obs=int(r.n_obs or 0),
                ofertes_avg=float(r.ofertes_avg) if r.ofertes_avg is not None else None,
                ofertes_median=float(r.ofertes_median) if r.ofertes_median is not None else None,
                ofertes_p90=float(r.ofertes_p90) if r.ofertes_p90 is not None else None,
                pct_oferta_unica=float(r.pct_oferta_unica) if r.pct_oferta_unica is not None else None,
                baja_avg=float(r.baja_avg) if r.baja_avg is not None else None,
                baja_median=float(r.baja_median) if r.baja_median is not None else None,
                baja_p90=float(r.baja_p90) if r.baja_p90 is not None else None,
            )
            self.competencia_exact[(r.codi_organ, r.codi_cpv_4, r.tipus_contracte)] = cell

        # Pre-aggregate cpv4 fallback (weighted avg by n_obs)
        agg_cpv4: dict[tuple[str, str], dict[str, float]] = defaultdict(
            lambda: {"n_obs": 0, "wofertes": 0.0, "wbaja": 0.0, "n_with_o": 0, "n_with_b": 0}
        )
        for (organ, cpv4, tipus), cell in self.competencia_exact.items():
            k = (cpv4, tipus)
            agg_cpv4[k]["n_obs"] += cell.n_obs
            if cell.ofertes_avg is not None:
                agg_cpv4[k]["wofertes"] += cell.ofertes_avg * cell.n_obs
                agg_cpv4[k]["n_with_o"] += cell.n_obs
            if cell.baja_avg is not None:
                agg_cpv4[k]["wbaja"] += cell.baja_avg * cell.n_obs
                agg_cpv4[k]["n_with_b"] += cell.n_obs
        for k, v in agg_cpv4.items():
            self.competencia_cpv4[k] = CompetenciaAgg(
                n_obs=int(v["n_obs"]),
                ofertes_avg=v["wofertes"] / v["n_with_o"] if v["n_with_o"] else None,
                baja_avg=v["wbaja"] / v["n_with_b"] if v["n_with_b"] else None,
            )

        # Pre-aggregate global per tipus
        agg_glob: dict[str, dict[str, float]] = defaultdict(
            lambda: {"n_obs": 0, "wofertes": 0.0, "wbaja": 0.0, "n_with_o": 0, "n_with_b": 0}
        )
        for (organ, cpv4, tipus), cell in self.competencia_exact.items():
            agg_glob[tipus]["n_obs"] += cell.n_obs
            if cell.ofertes_avg is not None:
                agg_glob[tipus]["wofertes"] += cell.ofertes_avg * cell.n_obs
                agg_glob[tipus]["n_with_o"] += cell.n_obs
            if cell.baja_avg is not None:
                agg_glob[tipus]["wbaja"] += cell.baja_avg * cell.n_obs
                agg_glob[tipus]["n_with_b"] += cell.n_obs
        for k, v in agg_glob.items():
            self.competencia_global[k] = CompetenciaAgg(
                n_obs=int(v["n_obs"]),
                ofertes_avg=v["wofertes"] / v["n_with_o"] if v["n_with_o"] else None,
                baja_avg=v["wbaja"] / v["n_with_b"] if v["n_with_b"] else None,
            )

        # agg_organ_perfil
        rows_p = (await session.execute(text(
            "SELECT codi_organ, n_adjudicaciones_obras, hhi_concentracion, top_adjudicatarios "
            "FROM agg_organ_perfil"
        ))).all()
        for r in rows_p:
            self.organ_perfil[r.codi_organ] = OrganPerfil(
                n_adjudicaciones_obras=int(r.n_adjudicaciones_obras) if r.n_adjudicaciones_obras is not None else None,
                hhi_concentracion=float(r.hhi_concentracion) if r.hhi_concentracion is not None else None,
                top_adjudicatarios=r.top_adjudicatarios if isinstance(r.top_adjudicatarios, list) else None,
            )

        elapsed = time.time() - t0
        print(f"[cache] loaded: competencia_exact={len(self.competencia_exact)} "
              f"cpv4={len(self.competencia_cpv4)} global={len(self.competencia_global)} "
              f"organ_perfil={len(self.organ_perfil)}  ({elapsed:.2f}s)")


# ─── Score in-memory (espejo de score_licitacion sin DB) ───────────────────


def score_inmemory(
    empresa,  # EmpresaContext
    lic_input,  # LicitacionInput
    cache: LayerCache,
):
    """Reescritura de score_licitacion que lee del LayerCache, no de DB.

    Espejo fiel de service.py:score_licitacion (líneas ~205-355).
    Si service.py cambia las queries, hay que actualizar aquí.
    """
    from app.intel.scoring import (
        bayesian_shrinkage, competencia_posterior,
        compute_composite_score,
        hard_filter_capacidad, hard_filter_clasificacion,
        hard_filter_documentacion_al_dia, hard_filter_estado_aceptacion,
        hard_filter_pliego, hard_filter_preferencia_no_interesa,
        hard_filter_presupuesto, hard_filter_solvencia,
        hard_filter_solvencia_economica,
        signal_baja_factible, signal_competencia_esperada,
        signal_concentracion_organo, signal_encaje_geografico,
        signal_encaje_tecnico, signal_pliego_check, signal_preferencias_match,
    )
    from app.intel.scoring.composite import hard_filter_tipo_contrato
    from app.intel.scoring.lcsp import estimar_baja_temeraria

    cpv_pref = empresa.pref_cpv_for(lic_input.codi_cpv)

    hard_filters = [
        hard_filter_estado_aceptacion(empresa.estado_aceptacion),
        hard_filter_tipo_contrato(lic_input.tipo_contrato, empresa.tipos_contrato_compatibles),
        hard_filter_clasificacion(empresa.cumple_clasificacion),
        hard_filter_solvencia(empresa.cumple_solvencia),
        hard_filter_solvencia_economica(
            volumen_exigido=None,  # sin pliego analizado
            volumen_max_empresa=empresa.volumen_negocio_max,
        ),
        hard_filter_presupuesto(
            lic_input.presupuesto,
            empresa.presupuesto_min_interes,
            empresa.presupuesto_max_interes,
            empresa.apetito_ute,
        ),
        hard_filter_capacidad(empresa.obras_simultaneas_actual, empresa.obras_simultaneas_max),
        hard_filter_preferencia_no_interesa(cpv_pref),
        hard_filter_documentacion_al_dia(
            docs_caducados=empresa.docs_caducados,
            docs_caducan_pronto=empresa.docs_caducan_pronto,
            dias_a_cierre_licitacion=lic_input.dias_a_cierre,
        ),
        hard_filter_pliego(None, None),
    ]

    # Lookup en cache
    cpv4 = lic_input.codi_cpv_4 or "____"
    tipus = lic_input.tipus_contracte
    organ = lic_input.codi_organ

    exact = cache.competencia_exact.get((organ, cpv4, tipus))
    cpv4_agg = cache.competencia_cpv4.get((cpv4, tipus))
    glob = cache.competencia_global.get(tipus)
    perfil = cache.organ_perfil.get(organ)

    cell_exact = (
        (exact.ofertes_avg, exact.n_obs) if exact and exact.ofertes_avg is not None else None
    )
    cell_cpv4 = (
        (cpv4_agg.ofertes_avg, cpv4_agg.n_obs)
        if cpv4_agg and cpv4_agg.n_obs and cpv4_agg.ofertes_avg is not None else None
    )
    global_mean = glob.ofertes_avg if (glob and glob.ofertes_avg is not None) else 3.0
    global_n = glob.n_obs if glob else 0
    cell_global = (global_mean, global_n)

    competencia_post = competencia_posterior(cell_exact, cell_cpv4, cell_global)
    pct_oferta_unica = exact.pct_oferta_unica if exact else None

    # Baja estimada
    baja_exact_avg = exact.baja_avg if exact else None
    baja_exact_n = exact.n_obs if exact else 0
    baja_cpv4_avg = cpv4_agg.baja_avg if cpv4_agg else None
    baja_global_avg = glob.baja_avg if (glob and glob.baja_avg is not None) else 5.0

    if baja_exact_avg is not None and baja_exact_n >= 5:
        baja_estimada = bayesian_shrinkage(
            baja_exact_avg, baja_exact_n, baja_cpv4_avg or baja_global_avg, pseudocount=30
        )
    elif baja_cpv4_avg is not None:
        baja_estimada = bayesian_shrinkage(
            baja_cpv4_avg, cpv4_agg.n_obs if cpv4_agg else 0,
            baja_global_avg, pseudocount=50,
        )
    else:
        baja_estimada = baja_global_avg

    # empresa_es_top
    empresa_es_top = False
    if empresa.cif and perfil and perfil.top_adjudicatarios:
        empresa_es_top = any(
            it.get("cif") == empresa.cif for it in perfil.top_adjudicatarios[:5]
        )

    n_obs_principal = competencia_post.n_obs

    sig_comp = signal_competencia_esperada(
        ofertes_posterior=competencia_post.posterior_mean,
        pct_oferta_unica=pct_oferta_unica,
        n_obs=n_obs_principal,
    )
    sig_conc = signal_concentracion_organo(
        hhi=perfil.hhi_concentracion if perfil else None,
        n_adjudicaciones=perfil.n_adjudicaciones_obras if perfil else None,
        empresa_es_top=empresa_es_top,
    )
    sig_tec = signal_encaje_tecnico(
        cumple_clasificacion=empresa.cumple_clasificacion,
        cumple_solvencia=empresa.cumple_solvencia,
        nivel_clasificacion_holgura=empresa.nivel_clasificacion_holgura,
    )
    sig_geo = signal_encaje_geografico(
        distancia_km=empresa.distancia_km_estimada,
        es_misma_provincia=empresa.es_misma_provincia,
        es_mismo_nuts3=empresa.es_mismo_nuts3,
    )
    sig_pref = signal_preferencias_match(
        cpv_division=lic_input.codi_cpv_2,
        pref_cpv_prioridad=cpv_pref,
    )
    baja_para_lcsp = baja_exact_avg if baja_exact_avg is not None else baja_cpv4_avg
    temeraria = estimar_baja_temeraria(
        ofertes_esperadas=competencia_post.posterior_mean,
        baja_media_historica=baja_para_lcsp,
    )
    sig_baja = signal_baja_factible(
        baja_necesaria_estimada=baja_estimada,
        margen_minimo_empresa=empresa.margen_minimo_baja,
        baja_temeraria_threshold=temeraria.threshold_pct,
        n_obs_baja=n_obs_principal,
    )
    sig_pliego = signal_pliego_check(veredicto=None, razones_riesgo_count=0)

    return compute_composite_score(
        hard_filters=hard_filters,
        competencia=sig_comp,
        concentracion=sig_conc,
        encaje_tecnico=sig_tec,
        encaje_geografico=sig_geo,
        preferencias=sig_pref,
        baja=sig_baja,
        pliego=sig_pliego,
        n_obs_principal=n_obs_principal,
    )


# ─── Scoring de una empresa ─────────────────────────────────────────────────


async def score_empresa(
    session: AsyncSession,
    emp_id: uuid.UUID,
    cache: LayerCache,
    licitaciones: list,
) -> list[dict[str, Any]]:
    from app.intel.scoring.empresa_context import (
        build_empresa_static_profile,
        evaluate_empresa_for_licitacion,
    )
    from app.intel.scoring.service import LicitacionInput

    profile = await build_empresa_static_profile(session, emp_id)

    resultados = []
    for lic in licitaciones:
        ctx = evaluate_empresa_for_licitacion(profile, lic)
        lic_input = LicitacionInput(
            codi_organ=str(lic.organismo_id) if lic.organismo_id else "unknown",
            codi_cpv=lic.cpv_codes[0] if lic.cpv_codes else None,
            tipus_contracte="Obres",  # raw catalán (para lookup PSCP) — el motor agrega como Obres
            tipo_contrato=lic.tipo_contrato,  # snake_case BD — lo que filtra hard_filter_tipo_contrato
            presupuesto=float(lic.importe_licitacion) if lic.importe_licitacion else None,
            lloc_execucio=None,
            codi_nuts=lic.provincias[0] if lic.provincias else None,
            dias_a_cierre=None,
        )
        result = score_inmemory(ctx, lic_input, cache)
        d = result.to_dict()
        d["licitacion_id"] = str(lic.id)
        d["titulo"] = lic.titulo or "(sin titulo)"
        d["importe"] = float(lic.importe_licitacion) if lic.importe_licitacion else None
        d["organismo"] = lic.organismo or "?"
        d["provincias"] = list(lic.provincias or [])
        d["cpv_principal"] = lic.cpv_codes[0] if lic.cpv_codes else None
        resultados.append(d)
    return resultados


# ─── Análisis ──────────────────────────────────────────────────────────────


def _fmt_eur(n: float | None) -> str:
    if n is None:
        return "         ?"
    if n >= 1_000_000:
        return f"{n/1_000_000:>7.1f}M"
    if n >= 1_000:
        return f"{n/1_000:>7.0f}k"
    return f"{n:>9.0f} "


def _signals_top(breakdown: list[dict], k: int = 3) -> str:
    sorted_b = sorted(breakdown, key=lambda b: -abs(b.get("contribution", 0)))
    parts = []
    short = {
        "competencia_esperada": "compet",
        "concentracion_organo": "concentr",
        "encaje_tecnico": "tecnico",
        "encaje_geografico": "geo",
        "preferencias_match": "pref",
        "baja_factible": "baja",
        "pliego_check": "pliego",
    }
    for b in sorted_b[:k]:
        parts.append(f"{short.get(b['name'], b['name'])}={b['contribution']:.1f}")
    return " ".join(parts)


def _provincia_str(provincias: list[str]) -> str:
    if not provincias:
        return "?"
    return provincias[0][:8]


def informe_empresa(label: str, perfil: str, resultados: list[dict]) -> None:
    print()
    print("=" * 105)
    print(f" {label}")
    print(f" {perfil}")
    print("=" * 105)

    total = len(resultados)
    scoreadas = [r for r in resultados if not r["descartada"]]
    descartadas = [r for r in resultados if r["descartada"]]
    n_score = len(scoreadas)
    pct_score = n_score / total * 100 if total else 0

    print(f"\n  Total licitaciones: {total}")
    print(f"  Scoreadas (pasan filtros): {n_score}  ({pct_score:.1f}%)")
    print(f"  Descartadas: {len(descartadas)}")

    if scoreadas:
        scores = [r["score"] for r in scoreadas]
        if len(scores) >= 4:
            qs = statistics.quantiles(scores, n=4)
            p25, p75 = int(qs[0]), int(qs[2])
        else:
            p25 = p75 = int(statistics.median(scores))
        print(f"\n  DISTRIBUCION DE SCORES:")
        print(f"    min={min(scores):3d}   p25={p25:3d}   mediana={int(statistics.median(scores)):3d}   "
              f"p75={p75:3d}   max={max(scores):3d}   media={statistics.mean(scores):5.1f}")

        buckets = {"<40": 0, "40-49": 0, "50-64": 0, "65-79": 0, ">=80(azul)": 0}
        for s in scores:
            if s < 40: buckets["<40"] += 1
            elif s < 50: buckets["40-49"] += 1
            elif s < 65: buckets["50-64"] += 1
            elif s < 80: buckets["65-79"] += 1
            else: buckets[">=80(azul)"] += 1
        print(f"    {'  '.join(f'{k}:{v}' for k,v in buckets.items())}")

        top5 = sorted(scoreadas, key=lambda r: -r["score"])[:5]
        print(f"\n  TOP 5 - mejor encaje:")
        print(f"  {'#':>2} {'Sc':>3} {'Importe':>9} {'Prov':<8} {'CPV':<5} {'Senales (top 3)':<35} Titulo")
        for i, r in enumerate(top5, 1):
            tit = (r["titulo"] or "")[:55]
            print(f"  {i:>2} {r['score']:>3} {_fmt_eur(r['importe'])} "
                  f"{_provincia_str(r['provincias']):<8} "
                  f"{(r['cpv_principal'] or '?')[:5]:<5} "
                  f"{_signals_top(r['breakdown']):<35} {tit}")

        bot5 = sorted(scoreadas, key=lambda r: r["score"])[:5]
        print(f"\n  BOTTOM 5 - pasa filtros pero peor encaje:")
        for i, r in enumerate(bot5, 1):
            tit = (r["titulo"] or "")[:55]
            print(f"  {i:>2} {r['score']:>3} {_fmt_eur(r['importe'])} "
                  f"{_provincia_str(r['provincias']):<8} "
                  f"{(r['cpv_principal'] or '?')[:5]:<5} "
                  f"{_signals_top(r['breakdown']):<35} {tit}")

    if descartadas:
        razones: dict[str, int] = {}
        for r in descartadas:
            for hf in r["hard_filters"]:
                if hf.get("fail"):
                    razones[hf["name"]] = razones.get(hf["name"], 0) + 1
        print(f"\n  RAZONES DE DESCARTE (top):")
        for name, cnt in sorted(razones.items(), key=lambda x: -x[1])[:5]:
            print(f"    {name:<22} {cnt:>5}  ({cnt/total*100:.1f}%)")

        print(f"\n  EJEMPLOS de descarte:")
        seen = set()
        for r in descartadas:
            for hf in r["hard_filters"]:
                if hf.get("fail") and hf["name"] not in seen:
                    seen.add(hf["name"])
                    print(f"    [{hf['name']}] {hf['reason'][:90]}")
                    if len(seen) >= 5: break
            if len(seen) >= 5: break


# ─── Main ──────────────────────────────────────────────────────────────────


def new_engine():
    return create_async_engine(DB, poolclass=NullPool, echo=False)


async def main() -> None:
    fictic_ids: list[uuid.UUID] = []
    t_start = time.time()

    try:
        # 1. Insertar fantasma + grande
        print("Insertando empresas ficticias...", flush=True)
        engine = new_engine()
        Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with Session() as session:
            for e in (FANTASMA, GRANDE):
                emp_id = await insertar_empresa(session, e)
                fictic_ids.append(emp_id)
                print(f"  [OK] {e.nombre} -> {emp_id}", flush=True)
            await session.commit()
        await engine.dispose()

        # 2. Cargar cache + licitaciones activas (1 sola sesión)
        from app.models.licitacion import Licitacion
        engine = new_engine()
        Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        async with Session() as session:
            cache = LayerCache()
            await cache.load(session)

            t_lic = time.time()
            licitaciones = (await session.execute(
                select(Licitacion).where(
                    and_(
                        Licitacion.fecha_limite.is_not(None),
                        Licitacion.fecha_limite > datetime.now(timezone.utc),
                    )
                )
            )).scalars().all()
            print(f"[lic] cargadas {len(licitaciones)} licitaciones activas ({time.time()-t_lic:.2f}s)", flush=True)
        await engine.dispose()

        # 3. Score las 3 empresas — NULA llamada a DB durante scoring
        empresas_target = [
            ("DEMO - Bosch i Ribera Construccions, SL", EMPRESA_DEMO_ID,
             "PYME mediana | C-2-3 + G-6-3 ROLECE + RELIC NB1220972 (31 clasif) | Barcelona | vol 1.18M | plantilla 14"),
            ("FANTASMA - sin clasif ni certificados", fictic_ids[0],
             "Micro sin ROLECE ni certificados | Barcelona | vol 70k | presup 5k-90k | CPV 45"),
            ("GRANDE - constructora cat4-5", fictic_ids[1],
             "C-2-5 + G-4-5 + G-6-5 | Barcelona | vol 8.5M | plantilla 120 | presup 700k-15M | UTE"),
        ]

        for label, emp_id, perfil in empresas_target:
            t0 = time.time()
            print(f"\n[scoring] {label}...", flush=True)
            engine = new_engine()
            Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            async with Session() as session:
                resultados = await score_empresa(session, emp_id, cache, licitaciones)
            await engine.dispose()
            print(f"  [done] {len(resultados)} licitaciones scoreadas en {time.time()-t0:.2f}s", flush=True)
            informe_empresa(label, perfil, resultados)

        print(f"\n[total] elapsed {time.time()-t_start:.2f}s", flush=True)

    finally:
        if fictic_ids:
            engine = new_engine()
            Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            async with Session() as session:
                for emp_id in fictic_ids:
                    await session.execute(
                        text("DELETE FROM empresas WHERE id = :id"), {"id": emp_id}
                    )
                await session.commit()
            await engine.dispose()
            print(f"\n[cleanup] {len(fictic_ids)} empresas ficticias borradas.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
