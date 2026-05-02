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


@router.get("/baja", summary="Distribución de baja histórica + threshold temerario LCSP")
async def get_baja(
    db: Annotated[AsyncSession, Depends(get_db)],
    codi_organ: str | None = Query(None),
    codi_cpv_4: str | None = Query(None),
    tipus_contracte: str = Query("Obres"),
) -> dict[str, Any]:
    from app.intel.scoring.lcsp import estimar_baja_temeraria

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
        "       AVG(baja_p90) AS baja_p90_approx, "
        "       SUM(ofertes_avg * n_obs) / NULLIF(SUM(n_obs), 0) AS ofertes_avg "
        "FROM agg_competencia_organ_cpv WHERE " + " AND ".join(where)
    )
    r = await db.execute(text(sql), params)
    row = r.first()
    if not row or row[0] is None:
        return {"n_obs": 0}

    baja_avg = float(row[1]) if row[1] is not None else None
    ofertes_avg = float(row[4]) if row[4] is not None else None

    temeraria = estimar_baja_temeraria(
        ofertes_esperadas=ofertes_avg,
        baja_media_historica=baja_avg,
    )

    return {
        "n_obs": int(row[0]),
        "baja_avg": baja_avg,
        "baja_median_approx": float(row[2]) if row[2] is not None else None,
        "baja_p90_approx": float(row[3]) if row[3] is not None else None,
        "ofertes_avg": ofertes_avg,
        "baja_temeraria_estimada": {
            "threshold_pct": temeraria.threshold_pct,
            "metodo": temeraria.metodo,
            "confianza": temeraria.confianza,
            "n_ofertas_supuesto": temeraria.n_ofertas_supuesto,
        },
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


@router.get("/top-ganables", summary="Top licitaciones por score de ganabilidad para una empresa")
async def get_top_ganables(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: str = Query(..., description="UUID de la empresa"),
    limit: int = Query(10, ge=1, le=50),
    min_score: int = Query(0, ge=0, le=100, description="Score mínimo a incluir"),
) -> dict[str, Any]:
    """Top N licitaciones para una empresa, no descartadas, score >= min_score."""
    rows = (await db.execute(text(
        """
        SELECT lse.licitacion_id, lse.score, lse.confidence,
               lse.data_completeness_pct, lse.breakdown_json,
               l.expediente, l.titulo, l.organismo, l.organismo_id,
               l.importe_licitacion, l.fecha_limite, l.cpv_codes,
               l.provincias, l.semaforo
        FROM licitacion_score_empresa lse
        JOIN licitaciones l ON l.id = lse.licitacion_id
        WHERE lse.empresa_id = :emp
          AND lse.descartada = false
          AND lse.score >= :ms
          AND l.fecha_limite > now()
        ORDER BY lse.score DESC, l.fecha_limite ASC
        LIMIT :lim
        """
    ), {"emp": empresa_id, "ms": min_score, "lim": limit})).all()

    items = []
    for r in rows:
        m = r._mapping
        items.append({
            "licitacion_id": str(m["licitacion_id"]),
            "score": int(m["score"]),
            "confidence": m["confidence"],
            "data_completeness_pct": int(m["data_completeness_pct"]),
            "expediente": m["expediente"],
            "titulo": m["titulo"],
            "organismo": m["organismo"],
            "organismo_id": m["organismo_id"],
            "importe_licitacion": float(m["importe_licitacion"]) if m["importe_licitacion"] is not None else None,
            "fecha_limite": m["fecha_limite"].isoformat() if m["fecha_limite"] else None,
            "cpv_codes": m["cpv_codes"],
            "provincias": m["provincias"],
            "semaforo": m["semaforo"],
            "highlight": _pick_highlight(m["breakdown_json"]),
        })
    return {"items": items, "count": len(items)}


@router.get("/feed", summary="Feed completo de licitaciones con score, paginado")
async def get_feed_scored(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: str = Query(...),
    min_score: int = Query(0, ge=0, le=100),
    include_descartadas: bool = Query(False),
    solo_descartadas: bool = Query(
        False,
        description="Si True, solo descartadas (ignora include_descartadas). "
        "Usado por la sección colapsable del Radar."
    ),
    limit: int = Query(24, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    """Feed paginado del Radar para una empresa, ordenado por score desc."""
    where = ["lse.empresa_id = :emp", "l.fecha_limite > now()", "lse.score >= :ms"]
    params: dict[str, Any] = {"emp": empresa_id, "ms": min_score, "lim": limit, "off": offset}
    if solo_descartadas:
        where.append("lse.descartada = true")
    elif not include_descartadas:
        where.append("lse.descartada = false")

    sql = (
        "SELECT lse.licitacion_id, lse.score, lse.confidence, lse.descartada, "
        "       lse.reason_descarte, lse.data_completeness_pct, lse.breakdown_json, "
        "       l.expediente, l.titulo, l.organismo, l.organismo_id, "
        "       l.importe_licitacion, l.fecha_limite, l.cpv_codes, "
        "       l.provincias, l.semaforo "
        "FROM licitacion_score_empresa lse "
        "JOIN licitaciones l ON l.id = lse.licitacion_id "
        "WHERE " + " AND ".join(where) + " "
        "ORDER BY lse.descartada ASC, lse.score DESC NULLS LAST, l.fecha_limite ASC "
        "LIMIT :lim OFFSET :off"
    )
    count_sql = (
        "SELECT count(*) FROM licitacion_score_empresa lse "
        "JOIN licitaciones l ON l.id = lse.licitacion_id "
        "WHERE " + " AND ".join(where)
    )

    total = (await db.execute(text(count_sql), params)).scalar_one()
    rows = (await db.execute(text(sql), params)).all()

    items = []
    for r in rows:
        m = r._mapping
        items.append({
            "licitacion_id": str(m["licitacion_id"]),
            "score": int(m["score"]),
            "confidence": m["confidence"],
            "descartada": m["descartada"],
            "reason_descarte": m["reason_descarte"],
            "data_completeness_pct": int(m["data_completeness_pct"]),
            "expediente": m["expediente"],
            "titulo": m["titulo"],
            "organismo": m["organismo"],
            "organismo_id": m["organismo_id"],
            "importe_licitacion": float(m["importe_licitacion"]) if m["importe_licitacion"] is not None else None,
            "fecha_limite": m["fecha_limite"].isoformat() if m["fecha_limite"] else None,
            "cpv_codes": m["cpv_codes"],
            "provincias": m["provincias"],
            "semaforo": m["semaforo"],
            "highlight": _pick_highlight(m["breakdown_json"]),
        })
    return {"items": items, "count": len(items), "total": int(total), "offset": offset, "limit": limit}


@router.get(
    "/licitaciones/{licitacion_id}/score",
    summary="Detalle del score de una licitación para una empresa (breakdown completo)",
)
async def get_licitacion_score_detail(
    licitacion_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: str = Query(...),
) -> dict[str, Any]:
    r = await db.execute(text(
        """
        SELECT lse.score, lse.confidence, lse.descartada, lse.reason_descarte,
               lse.data_completeness_pct, lse.breakdown_json, lse.hard_filters_json,
               lse.computed_at,
               l.expediente, l.titulo, l.organismo, l.importe_licitacion,
               l.fecha_limite
        FROM licitacion_score_empresa lse
        JOIN licitaciones l ON l.id = lse.licitacion_id
        WHERE lse.empresa_id = :emp AND lse.licitacion_id = :lic
        """
    ), {"emp": empresa_id, "lic": licitacion_id})
    row = r.first()
    if not row:
        raise HTTPException(404, "Score no calculado para esta (empresa, licitación). Ejecuta workers.intel_scores.calcular_para_empresa.")
    m = dict(row._mapping)
    return {
        "score": int(m["score"]),
        "confidence": m["confidence"],
        "descartada": m["descartada"],
        "reason_descarte": m["reason_descarte"],
        "data_completeness_pct": int(m["data_completeness_pct"]),
        "breakdown": m["breakdown_json"],
        "hard_filters": m["hard_filters_json"],
        "computed_at": m["computed_at"].isoformat() if m["computed_at"] else None,
        "licitacion": {
            "expediente": m["expediente"],
            "titulo": m["titulo"],
            "organismo": m["organismo"],
            "importe_licitacion": float(m["importe_licitacion"]) if m["importe_licitacion"] is not None else None,
            "fecha_limite": m["fecha_limite"].isoformat() if m["fecha_limite"] else None,
        },
    }


def _pick_highlight(breakdown: list[dict[str, Any]] | None) -> str | None:
    """Frase corta para mostrar en la card. Escogemos la señal con mayor
    impacto positivo cuando hay buen score, o la más débil si no hay clara
    fortaleza — esto convierte 'la peor parte' en señal accionable."""
    if not breakdown:
        return None
    # Encuentra la señal con mayor contribution si hay alguna >10
    best = max(breakdown, key=lambda b: b.get("contribution", 0))
    if best.get("contribution", 0) >= 10:
        return best.get("explanation")
    # Fallback: señal más débil para flagear
    weak = min(breakdown, key=lambda b: b.get("value", 0))
    return weak.get("explanation")


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
