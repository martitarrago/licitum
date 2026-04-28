"""Endpoints `/api/v1/intel/*` — motor de ganabilidad sobre PSCP.

Spec: docs/data-science/architecture.md sección 7.

5 endpoints + health:
- POST /score-licitacion: score compuesto de una licitación para una empresa
- GET /competencia: distribución de competencia para (organ, cpv4, tipus)
- GET /baja: distribución de baja
- GET /organ/{codi_organ}/perfil: HHI + top adjudicatarios + n_adjudicaciones
- GET /empresa/{cif}/perfil: histórico de adjudicaciones de una empresa
- GET /_health: estado del pipeline + frescura de mviews
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.intel.scoring.service import EmpresaContext, LicitacionInput, score_licitacion
from app.models.pscp import PscpAdjudicacion, PscpSyncLog

router = APIRouter()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class LicitacionInputSchema(BaseModel):
    codi_organ: str
    codi_cpv: str | None = None
    tipus_contracte: str = "Obres"
    presupuesto: float | None = None
    lloc_execucio: str | None = None
    codi_nuts: str | None = None


class EmpresaContextSchema(BaseModel):
    cif: str | None = None
    cumple_clasificacion: bool = True
    cumple_solvencia: bool = True
    nivel_clasificacion_holgura: float | None = None
    presupuesto_min_interes: float | None = None
    presupuesto_max_interes: float | None = None
    apetito_ute: bool = False
    estado_aceptacion: str = "acepta"
    obras_simultaneas_max: int | None = None
    obras_simultaneas_actual: int | None = None
    pref_cpv_prioridades: dict[str, str] = Field(default_factory=dict)
    distancia_km_estimada: float | None = None
    es_misma_provincia: bool = False
    es_mismo_nuts3: bool = False
    margen_minimo_baja: float | None = None


class ScoreRequest(BaseModel):
    licitacion: LicitacionInputSchema
    empresa: EmpresaContextSchema


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/score-licitacion", summary="Score de ganabilidad para (licitación, empresa)")
async def post_score_licitacion(
    body: ScoreRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    licitacion = LicitacionInput(**body.licitacion.model_dump())
    empresa = EmpresaContext(**body.empresa.model_dump())
    score = await score_licitacion(db, licitacion, empresa)
    return score.to_dict()


@router.get("/competencia", summary="Distribución de competencia agregada")
async def get_competencia(
    db: Annotated[AsyncSession, Depends(get_db)],
    codi_organ: str = Query(..., description="Código del órgano contratante"),
    codi_cpv_4: str = Query(..., min_length=2, max_length=4),
    tipus_contracte: str = Query("Obres"),
) -> dict[str, Any]:
    cpv4 = codi_cpv_4.ljust(4, "_")[:4] if len(codi_cpv_4) < 4 else codi_cpv_4[:4]
    r = await db.execute(text(
        "SELECT n_obs, ofertes_avg, ofertes_median, ofertes_p90, "
        "       pct_oferta_unica, baja_avg, baja_median, baja_p90, import_avg "
        "FROM agg_competencia_organ_cpv "
        "WHERE codi_organ = :o AND codi_cpv_4 = :c AND tipus_contracte = :t"
    ), {"o": codi_organ, "c": cpv4, "t": tipus_contracte})
    row = r.first()
    if not row:
        raise HTTPException(404, f"Sin observaciones para ({codi_organ}, {cpv4}, {tipus_contracte})")
    m = dict(row._mapping)
    return {k: float(v) if v is not None else None for k, v in m.items()}


@router.get("/baja", summary="Distribución de baja histórica")
async def get_baja(
    db: Annotated[AsyncSession, Depends(get_db)],
    codi_organ: str | None = Query(None),
    codi_cpv_4: str | None = Query(None),
    tipus_contracte: str = Query("Obres"),
) -> dict[str, Any]:
    where = ["tipus_contracte = :t"]
    params: dict[str, Any] = {"t": tipus_contracte}
    if codi_organ:
        where.append("codi_organ = :o")
        params["o"] = codi_organ
    if codi_cpv_4:
        where.append("codi_cpv_4 = :c")
        params["c"] = codi_cpv_4

    sql = (
        "SELECT SUM(n_obs) AS n_obs, "
        "       SUM(baja_avg * n_obs) / NULLIF(SUM(n_obs), 0) AS baja_avg, "
        "       AVG(baja_median) AS baja_median_approx, "
        "       AVG(baja_p90) AS baja_p90_approx "
        "FROM agg_competencia_organ_cpv WHERE " + " AND ".join(where)
    )
    r = await db.execute(text(sql), params)
    row = r.first()
    if not row or row[0] is None:
        return {"n_obs": 0}
    return {
        "n_obs": int(row[0]),
        "baja_avg": float(row[1]) if row[1] is not None else None,
        "baja_median_approx": float(row[2]) if row[2] is not None else None,
        "baja_p90_approx": float(row[3]) if row[3] is not None else None,
    }


@router.get("/organ/{codi_organ}/perfil", summary="Perfil del órgano contratante")
async def get_organ_perfil(
    codi_organ: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    r = await db.execute(text(
        "SELECT codi_organ, nom_organ, n_adjudicaciones_obras, "
        "       hhi_concentracion, top_adjudicatarios "
        "FROM agg_organ_perfil WHERE codi_organ = :o"
    ), {"o": codi_organ})
    row = r.first()
    if not row:
        raise HTTPException(404, f"Sin perfil para órgano {codi_organ}")
    m = dict(row._mapping)
    return {
        "codi_organ": m["codi_organ"],
        "nom_organ": m["nom_organ"],
        "n_adjudicaciones_obras": int(m["n_adjudicaciones_obras"]),
        "hhi_concentracion": float(m["hhi_concentracion"]) if m["hhi_concentracion"] is not None else None,
        "top_adjudicatarios": m["top_adjudicatarios"],
    }


@router.get("/empresa/{cif}/perfil", summary="Perfil histórico de una empresa por CIF")
async def get_empresa_perfil(
    cif: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    r = await db.execute(text(
        "SELECT cif, denominacio_canonica, n_adjudicaciones, n_obres, baja_avg, "
        "       volumen_total, primera_adj, ultima_adj, organs_freq, cpvs_freq "
        "FROM agg_empresa_perfil WHERE cif = :cif"
    ), {"cif": cif})
    row = r.first()
    if not row:
        return {"cif": cif, "found": False}
    m = dict(row._mapping)
    return {
        "cif": m["cif"],
        "found": True,
        "denominacio_canonica": m["denominacio_canonica"],
        "n_adjudicaciones": int(m["n_adjudicaciones"]),
        "n_obres": int(m["n_obres"]),
        "baja_avg": float(m["baja_avg"]) if m["baja_avg"] is not None else None,
        "volumen_total": float(m["volumen_total"]) if m["volumen_total"] is not None else None,
        "primera_adj": m["primera_adj"].isoformat() if m["primera_adj"] else None,
        "ultima_adj": m["ultima_adj"].isoformat() if m["ultima_adj"] else None,
        "organs_freq": m["organs_freq"],
        "cpvs_freq": m["cpvs_freq"],
    }


@router.get("/_health", summary="Salud del pipeline data layer")
async def get_health(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    n_total = (await db.execute(select(func.count(PscpAdjudicacion.id)))).scalar_one()
    last_inc = await db.execute(
        select(PscpSyncLog.finished_at, PscpSyncLog.records_fetched)
        .where(PscpSyncLog.sync_type == "incremental", PscpSyncLog.finished_at.isnot(None))
        .order_by(PscpSyncLog.finished_at.desc()).limit(1)
    )
    last_inc_row = last_inc.first()
    last_mview = await db.execute(
        select(PscpSyncLog.finished_at)
        .where(PscpSyncLog.sync_type == "mview_refresh", PscpSyncLog.finished_at.isnot(None))
        .order_by(PscpSyncLog.finished_at.desc()).limit(1)
    )
    last_mview_row = last_mview.first()

    n_organs = (await db.execute(text("SELECT count(*) FROM agg_organ_perfil"))).scalar_one()
    n_empresas = (await db.execute(text("SELECT count(*) FROM agg_empresa_perfil"))).scalar_one()
    n_cells = (await db.execute(text("SELECT count(*) FROM agg_competencia_organ_cpv"))).scalar_one()

    return {
        "records_total": n_total,
        "last_incremental_sync_at": last_inc_row[0].isoformat() if last_inc_row else None,
        "last_incremental_records": last_inc_row[1] if last_inc_row else None,
        "last_mview_refresh_at": last_mview_row[0].isoformat() if last_mview_row else None,
        "mview_rows": {
            "agg_organ_perfil": int(n_organs),
            "agg_empresa_perfil": int(n_empresas),
            "agg_competencia_organ_cpv": int(n_cells),
        },
    }
