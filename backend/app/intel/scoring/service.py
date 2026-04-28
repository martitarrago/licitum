"""Servicio de scoring — orquesta queries al data layer + cálculo de score.

Spec: docs/data-science/architecture.md sección 7.

Separación de responsabilidades:
- ESTE módulo conoce sólo PSCP (mviews + tabla pscp_adjudicacion).
- Los datos de la empresa (clasificación, solvencia, preferencias, capacidad)
  vienen como `EmpresaContext` desde el caller. Esto evita acoplar el data
  layer con M2.
- El caller (router FastAPI) compone EmpresaContext consultando M2.

Flujo:
    score_licitacion(LicitacionInput, EmpresaContext) -> GanabilidadScore

LicitacionInput: codi_organ, codi_cpv, tipus_contracte, presupuesto, lloc.
EmpresaContext: cif, cumple_clasificacion, prefs, capacidad, etc.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.intel.scoring.bayesian import (
    BayesianAggregate,
    bayesian_shrinkage,
    competencia_posterior,
)
from app.intel.scoring.composite import (
    GanabilidadScore,
    compute_composite_score,
    hard_filter_capacidad,
    hard_filter_clasificacion,
    hard_filter_estado_aceptacion,
    hard_filter_preferencia_no_interesa,
    hard_filter_presupuesto,
    hard_filter_solvencia,
    signal_baja_factible,
    signal_competencia_esperada,
    signal_concentracion_organo,
    signal_encaje_geografico,
    signal_encaje_tecnico,
    signal_preferencias_match,
)


# ----------------------------------------------------------------------------
# Inputs
# ----------------------------------------------------------------------------


@dataclass(frozen=True)
class LicitacionInput:
    """Datos de la licitación a scorear (vienen del feed M1)."""

    codi_organ: str
    codi_cpv: str | None
    tipus_contracte: str  # 'Obres' por defecto en Licitum
    presupuesto: float | None
    lloc_execucio: str | None
    codi_nuts: str | None

    @property
    def codi_cpv_4(self) -> str | None:
        return self.codi_cpv[:4] if self.codi_cpv else None

    @property
    def codi_cpv_2(self) -> str | None:
        return self.codi_cpv[:2] if self.codi_cpv else None


@dataclass(frozen=True)
class EmpresaContext:
    """Datos M2 de la empresa que rankea — caller los compone desde tablas M2.

    Todos opcionales — el scoring degrada con gracia si falta info.
    """

    cif: str | None = None
    # Hard filters (clasificación + solvencia evaluadas externamente vs el pliego)
    cumple_clasificacion: bool = True
    cumple_solvencia: bool = True
    nivel_clasificacion_holgura: float | None = None  # 1.0 = justo, 1.5 = 50% holgura
    # Preferencias (M2 empresa_preferencias)
    presupuesto_min_interes: float | None = None
    presupuesto_max_interes: float | None = None
    apetito_ute: bool = False
    estado_aceptacion: str = "acepta"  # 'acepta' | 'selectivo' | 'no_acepta'
    obras_simultaneas_max: int | None = None
    obras_simultaneas_actual: int | None = None
    # Preferencia CPV (M2 empresa_preferencias_cpv) — buscar match con CPV de la licitación
    pref_cpv_prioridades: dict[str, str] = field(default_factory=dict)  # {'45': 'core', ...}
    # Geografía (M2 dirección + preferencias_territorio)
    distancia_km_estimada: float | None = None
    es_misma_provincia: bool = False
    es_mismo_nuts3: bool = False
    # Margen para baja
    margen_minimo_baja: float | None = None  # %

    def pref_cpv_for(self, cpv: str | None) -> str | None:
        """Match más específico → más general (8 → 4 → 2 dígitos)."""
        if not cpv:
            return None
        for digits in (8, 6, 4, 2):
            key = cpv[:digits]
            if key in self.pref_cpv_prioridades:
                return self.pref_cpv_prioridades[key]
        return None


# ----------------------------------------------------------------------------
# Queries al data layer
# ----------------------------------------------------------------------------


async def _query_competencia(
    session: AsyncSession, organ: str, cpv4: str | None, tipus: str
) -> dict[str, Any]:
    """Lee agg_competencia_organ_cpv para los 3 niveles de fallback."""
    cpv4_safe = cpv4 or "____"

    # Exact: (organ, cpv4, tipus)
    exact = await session.execute(text(
        "SELECT n_obs, ofertes_avg, ofertes_median, ofertes_p90, "
        "       pct_oferta_unica, baja_avg, baja_median, baja_p90 "
        "FROM agg_competencia_organ_cpv "
        "WHERE codi_organ = :organ AND codi_cpv_4 = :cpv4 AND tipus_contracte = :tipus"
    ), {"organ": organ, "cpv4": cpv4_safe, "tipus": tipus})
    exact_row = exact.first()

    # CPV4 fallback: aggregate over all organs
    cpv4_agg = await session.execute(text(
        "SELECT SUM(n_obs) AS n_obs, "
        "       SUM(ofertes_avg * n_obs) / NULLIF(SUM(n_obs), 0) AS ofertes_avg, "
        "       SUM(baja_avg * n_obs) / NULLIF(SUM(n_obs), 0) AS baja_avg "
        "FROM agg_competencia_organ_cpv "
        "WHERE codi_cpv_4 = :cpv4 AND tipus_contracte = :tipus"
    ), {"cpv4": cpv4_safe, "tipus": tipus})
    cpv4_row = cpv4_agg.first()

    # Global obras
    global_agg = await session.execute(text(
        "SELECT SUM(n_obs) AS n_obs, "
        "       SUM(ofertes_avg * n_obs) / NULLIF(SUM(n_obs), 0) AS ofertes_avg, "
        "       SUM(baja_avg * n_obs) / NULLIF(SUM(n_obs), 0) AS baja_avg "
        "FROM agg_competencia_organ_cpv "
        "WHERE tipus_contracte = :tipus"
    ), {"tipus": tipus})
    global_row = global_agg.first()

    return {
        "exact": exact_row._mapping if exact_row else None,
        "cpv4": cpv4_row._mapping if cpv4_row else None,
        "global": global_row._mapping if global_row else None,
    }


async def _query_organ_perfil(session: AsyncSession, organ: str) -> dict[str, Any] | None:
    """Lee agg_organ_perfil."""
    r = await session.execute(text(
        "SELECT n_adjudicaciones_obras, hhi_concentracion, top_adjudicatarios "
        "FROM agg_organ_perfil WHERE codi_organ = :organ"
    ), {"organ": organ})
    row = r.first()
    return dict(row._mapping) if row else None


async def _query_empresa_es_top(
    session: AsyncSession, organ: str, cif: str | None
) -> bool:
    """¿Está la empresa entre los top adjudicatarios del órgano?"""
    if not cif:
        return False
    r = await session.execute(text(
        "SELECT top_adjudicatarios FROM agg_organ_perfil WHERE codi_organ = :organ"
    ), {"organ": organ})
    row = r.first()
    if not row or not row[0]:
        return False
    top_list = row[0]
    if not isinstance(top_list, list):
        return False
    return any(item.get("cif") == cif for item in top_list[:5])


# ----------------------------------------------------------------------------
# Servicio público
# ----------------------------------------------------------------------------


async def score_licitacion(
    session: AsyncSession,
    licitacion: LicitacionInput,
    empresa: EmpresaContext,
) -> GanabilidadScore:
    """Calcula el score de ganabilidad para (licitación, empresa)."""
    # ── Hard filters (M2) ────────────────────────────────────────────
    cpv_pref = empresa.pref_cpv_for(licitacion.codi_cpv)
    hard_filters = [
        hard_filter_estado_aceptacion(empresa.estado_aceptacion),
        hard_filter_clasificacion(empresa.cumple_clasificacion),
        hard_filter_solvencia(empresa.cumple_solvencia),
        hard_filter_presupuesto(
            licitacion.presupuesto,
            empresa.presupuesto_min_interes,
            empresa.presupuesto_max_interes,
            empresa.apetito_ute,
        ),
        hard_filter_capacidad(empresa.obras_simultaneas_actual, empresa.obras_simultaneas_max),
        hard_filter_preferencia_no_interesa(cpv_pref),
    ]

    # ── Queries data layer ───────────────────────────────────────────
    cpv4 = licitacion.codi_cpv_4
    competencia_data = await _query_competencia(
        session, licitacion.codi_organ, cpv4, licitacion.tipus_contracte
    )
    organ_perfil = await _query_organ_perfil(session, licitacion.codi_organ)
    empresa_es_top = await _query_empresa_es_top(session, licitacion.codi_organ, empresa.cif)

    # ── Bayesian aggregate de competencia ────────────────────────────
    exact = competencia_data["exact"]
    cpv4_row = competencia_data["cpv4"]
    glob = competencia_data["global"]

    cell_exact = (
        (float(exact["ofertes_avg"]) if exact["ofertes_avg"] is not None else None,
         int(exact["n_obs"]))
        if exact else None
    )
    cell_cpv4 = (
        (float(cpv4_row["ofertes_avg"]) if cpv4_row and cpv4_row["ofertes_avg"] is not None else None,
         int(cpv4_row["n_obs"]) if cpv4_row and cpv4_row["n_obs"] else 0)
        if cpv4_row and cpv4_row["n_obs"] else None
    )
    global_mean = (
        float(glob["ofertes_avg"]) if glob and glob["ofertes_avg"] is not None else 3.0
    )
    global_n = int(glob["n_obs"]) if glob and glob["n_obs"] else 0
    cell_global = (global_mean, global_n)

    competencia_post = competencia_posterior(cell_exact, cell_cpv4, cell_global)
    pct_oferta_unica = float(exact["pct_oferta_unica"]) if exact and exact["pct_oferta_unica"] is not None else None

    # ── Bayesian aggregate de baja ───────────────────────────────────
    baja_exact_avg = float(exact["baja_avg"]) if exact and exact["baja_avg"] is not None else None
    baja_exact_n = int(exact["n_obs"]) if exact else 0
    baja_cpv4_avg = float(cpv4_row["baja_avg"]) if cpv4_row and cpv4_row["baja_avg"] is not None else None
    baja_global_avg = float(glob["baja_avg"]) if glob and glob["baja_avg"] is not None else 5.0

    if baja_exact_avg is not None and baja_exact_n >= 5:
        baja_estimada = bayesian_shrinkage(
            baja_exact_avg, baja_exact_n, baja_cpv4_avg or baja_global_avg, pseudocount=30
        )
    elif baja_cpv4_avg is not None:
        baja_estimada = bayesian_shrinkage(
            baja_cpv4_avg, int(cpv4_row["n_obs"]) if cpv4_row else 0,
            baja_global_avg, pseudocount=50,
        )
    else:
        baja_estimada = baja_global_avg

    # ── Soft signals ─────────────────────────────────────────────────
    n_obs_principal = competencia_post.n_obs

    sig_comp = signal_competencia_esperada(
        ofertes_posterior=competencia_post.posterior_mean,
        pct_oferta_unica=pct_oferta_unica,
        n_obs=n_obs_principal,
    )
    sig_conc = signal_concentracion_organo(
        hhi=float(organ_perfil["hhi_concentracion"]) if organ_perfil and organ_perfil["hhi_concentracion"] is not None else None,
        n_adjudicaciones=int(organ_perfil["n_adjudicaciones_obras"]) if organ_perfil else None,
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
        cpv_division=licitacion.codi_cpv_2,
        pref_cpv_prioridad=cpv_pref,
    )
    sig_baja = signal_baja_factible(
        baja_necesaria_estimada=baja_estimada,
        margen_minimo_empresa=empresa.margen_minimo_baja,
        n_obs_baja=n_obs_principal,
    )

    return compute_composite_score(
        hard_filters=hard_filters,
        competencia=sig_comp,
        concentracion=sig_conc,
        encaje_tecnico=sig_tec,
        encaje_geografico=sig_geo,
        preferencias=sig_pref,
        baja=sig_baja,
        n_obs_principal=n_obs_principal,
    )
