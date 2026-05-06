"""Endpoints de la calculadora económica (M6).

Expone 5 cosas:
  GET  /licitacion/{exp}/contexto — datos del pliego + intel histórica
                                    del órgano + recomendación inicial
  POST /licitacion/{exp}/calcular — cálculo en vivo con un % baja, no persiste
  POST /licitacion/{exp}/generar  — guarda versión + render HTML
  GET  /                          — listado de versiones guardadas
  GET  /{id}                      — detalle (con HTML)
  GET  /{id}/docx                 — descarga .docx editable
  DELETE /{id}                    — borra una versión

El cálculo en vivo es una operación pura (sin BBDD) que devuelve el
resultado JSON al instante para que el slider del frontend reaccione.
La generación, en cambio, sí persiste un snapshot completo + HTML.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.intel.scoring.lcsp import estimar_baja_temeraria
from app.models.empresa import Empresa
from app.models.licitacion import Licitacion
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA
from app.models.oferta_economica import OfertaEconomicaGeneracion
from app.services.calculadora_economica import (
    calcular,
    recomendar_baja,
    to_float,
)
from app.services.oferta_economica_render import render_docx, render_html

logger = logging.getLogger(__name__)
router = APIRouter()

MESES_ES = {
    1: "enero", 2: "febrero", 3: "marzo", 4: "abril", 5: "mayo", 6: "junio",
    7: "julio", 8: "agosto", 9: "septiembre", 10: "octubre",
    11: "noviembre", 12: "diciembre",
}


def _fecha_larga_es(d: date) -> str:
    return f"{d.day} de {MESES_ES[d.month]} de {d.year}"


# ─── Schemas ─────────────────────────────────────────────────────────────────


class TemerariaInfo(BaseModel):
    threshold_pct: float
    metodo: str
    confianza: str
    n_ofertas_supuesto: int


class CalculoOut(BaseModel):
    importe_ofertado: float
    importe_iva: float | None = None
    importe_total: float | None = None
    puntos_estimados: float | None = None
    puntos_max_referencia: float | None = None
    diff_vs_baja_media: float | None = None
    entra_en_temeraria: bool
    temeraria: TemerariaInfo | None = None
    nivel_riesgo: str
    nota_riesgo: str


class RecomendacionOut(BaseModel):
    rango_optimo_min_pct: float | None = None
    rango_optimo_max_pct: float | None = None
    pct_sugerido: float | None = None
    razonamiento: str
    confianza: str


class IntelOut(BaseModel):
    n_obs: int
    baja_avg_pct: float | None = None
    baja_median_pct: float | None = None
    baja_p90_pct: float | None = None
    ofertes_avg: float | None = None


class ContextoOut(BaseModel):
    expediente: str
    titulo: str | None
    organismo: str | None
    presupuesto_base: float | None
    iva_pct: float | None
    formula_tipo: str | None
    formula_extracto: str | None
    pct_criterios_objetivos: float | None
    pct_criterios_subjetivos: float | None
    baja_temeraria_extracto: str | None
    umbral_saciedad_pct: float | None
    plazo_ejecucion_meses: int | None
    intel: IntelOut
    temeraria_estimada: TemerariaInfo
    recomendacion: RecomendacionOut


class CalculoIn(BaseModel):
    baja_pct: float
    presupuesto_base: float | None = None
    iva_pct: float | None = 21.0


class GenerarIn(BaseModel):
    empresa_id: UUID
    baja_pct: float


class OfertaListItem(BaseModel):
    id: UUID
    empresa_id: UUID
    licitacion_id: UUID
    expediente: str
    presupuesto_base: Decimal
    baja_pct: Decimal
    importe_ofertado: Decimal
    entra_en_temeraria: bool
    temeraria_threshold_pct: Decimal | None = None
    created_at: Any

    model_config = {"from_attributes": True}


class OfertaRead(OfertaListItem):
    html: str
    datos_snapshot: dict[str, Any]


# ─── Helpers ─────────────────────────────────────────────────────────────────


async def _get_licitacion_or_404(
    db: AsyncSession, expediente: str
) -> Licitacion:
    obj = (
        await db.execute(
            select(Licitacion).where(Licitacion.expediente == expediente)
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Licitación con expediente {expediente!r} no encontrada",
        )
    return obj


async def _intel_baja(
    db: AsyncSession, codi_organ: str | None, codi_cpv_4: str | None
) -> dict[str, Any]:
    """Lee la baja histórica agregada para el órgano + CPV4. Igual que
    /api/v1/intel/baja pero como función directa para reusar."""
    if not codi_organ:
        return {"n_obs": 0}
    where = ["tipus_contracte = :t"]
    params: dict[str, Any] = {"t": "Obres"}
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
    row = (await db.execute(text(sql), params)).first()
    if not row or row[0] is None:
        # Fallback: agregar solo por órgano (sin CPV4) si la combinación no tiene observaciones
        if codi_cpv_4:
            return await _intel_baja(db, codi_organ, None)
        return {"n_obs": 0}
    return {
        "n_obs": int(row[0]),
        "baja_avg_pct": float(row[1]) if row[1] is not None else None,
        "baja_median_pct": float(row[2]) if row[2] is not None else None,
        "baja_p90_pct": float(row[3]) if row[3] is not None else None,
        "ofertes_avg": float(row[4]) if row[4] is not None else None,
    }


# Mínimo de observaciones históricas para fiarnos de `ofertes_avg` al elegir
# qué regla LCSP 149.2 aplicar. Por debajo de este umbral, asumimos n>=4
# (regla 149.2.d, threshold = media + 10pp) que es el caso empírico habitual
# en obra pública. Evita que `ofertes_avg=2.25` con 4 muestras dispare la
# regla rígida 149.2.b (threshold 20%).
_MIN_N_OBS_OFERTES_FIABLE = 10


def _ofertes_esperadas_fiables(intel_dict: dict[str, Any]) -> float | None:
    """Devuelve `ofertes_avg` solo si hay observaciones suficientes; si no,
    devuelve 4.0 para que el motor caiga en LCSP 149.2.d (media + 10pp)."""
    n_obs = intel_dict.get("n_obs") or 0
    if n_obs >= _MIN_N_OBS_OFERTES_FIABLE:
        return intel_dict.get("ofertes_avg")
    if intel_dict.get("baja_avg_pct") is not None:
        return 4.0
    return intel_dict.get("ofertes_avg")


def _extract_pliego_data(
    analisis: LicitacionAnalisisIA | None,
) -> dict[str, Any]:
    """Saca los campos económicos del extracted_data del análisis IA."""
    if not analisis or not analisis.extracted_data:
        return {}
    d = analisis.extracted_data
    return {
        "presupuesto_base": to_float(d.get("presupuesto_base_sin_iva")),
        "iva_pct": to_float(d.get("iva_porcentaje")) or 21.0,
        "formula_tipo": d.get("formula_tipo"),
        "formula_extracto": d.get("formula_economica_extracto"),
        "pct_criterios_objetivos": to_float(d.get("pct_criterios_objetivos")),
        "pct_criterios_subjetivos": to_float(d.get("pct_criterios_subjetivos")),
        "baja_temeraria_extracto": d.get("baja_temeraria_extracto"),
        "umbral_saciedad_pct": to_float(d.get("umbral_saciedad_pct")),
        "plazo_ejecucion_meses": d.get("plazo_ejecucion_meses"),
    }


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.get(
    "/licitacion/{expediente:path}/contexto",
    response_model=ContextoOut,
    summary="Contexto del pliego + intel histórica del órgano para la calculadora",
)
async def contexto(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ContextoOut:
    licitacion = await _get_licitacion_or_404(db, expediente)
    analisis = (
        await db.execute(
            select(LicitacionAnalisisIA).where(
                LicitacionAnalisisIA.licitacion_id == licitacion.id
            )
        )
    ).scalar_one_or_none()
    pliego = _extract_pliego_data(analisis)

    # CPV4 del primer cpv (si está)
    cpv_codes = licitacion.cpv_codes or []
    cpv4 = (cpv_codes[0][:4] if cpv_codes else None) if cpv_codes else None

    intel_dict = await _intel_baja(db, licitacion.organismo_id, cpv4)
    ofertes_esperadas = _ofertes_esperadas_fiables(intel_dict)

    # Estimación temeraria (fallback ex-ante)
    temer = estimar_baja_temeraria(
        ofertes_esperadas=ofertes_esperadas,
        baja_media_historica=intel_dict.get("baja_avg_pct"),
    )

    rec = recomendar_baja(
        formula_tipo=pliego.get("formula_tipo"),
        baja_media_historica_pct=intel_dict.get("baja_avg_pct"),
        ofertes_esperadas=ofertes_esperadas,
        umbral_saciedad_pct=pliego.get("umbral_saciedad_pct"),
    )

    return ContextoOut(
        expediente=licitacion.expediente,
        titulo=licitacion.titulo,
        organismo=licitacion.organismo,
        presupuesto_base=pliego.get("presupuesto_base")
        or to_float(licitacion.importe_licitacion),
        iva_pct=pliego.get("iva_pct"),
        formula_tipo=pliego.get("formula_tipo"),
        formula_extracto=pliego.get("formula_extracto"),
        pct_criterios_objetivos=pliego.get("pct_criterios_objetivos"),
        pct_criterios_subjetivos=pliego.get("pct_criterios_subjetivos"),
        baja_temeraria_extracto=pliego.get("baja_temeraria_extracto"),
        umbral_saciedad_pct=pliego.get("umbral_saciedad_pct"),
        plazo_ejecucion_meses=pliego.get("plazo_ejecucion_meses"),
        intel=IntelOut(**intel_dict)
        if intel_dict.get("n_obs")
        else IntelOut(n_obs=0),
        temeraria_estimada=TemerariaInfo(
            threshold_pct=temer.threshold_pct,
            metodo=temer.metodo,
            confianza=temer.confianza,
            n_ofertas_supuesto=temer.n_ofertas_supuesto,
        ),
        recomendacion=RecomendacionOut(
            rango_optimo_min_pct=rec.rango_optimo_min_pct,
            rango_optimo_max_pct=rec.rango_optimo_max_pct,
            pct_sugerido=rec.pct_sugerido,
            razonamiento=rec.razonamiento,
            confianza=rec.confianza,
        ),
    )


@router.post(
    "/licitacion/{expediente:path}/calcular",
    response_model=CalculoOut,
    summary="Cálculo en vivo (no persiste). Llamado por cada cambio del slider.",
)
async def calcular_endpoint(
    expediente: str,
    body: CalculoIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CalculoOut:
    licitacion = await _get_licitacion_or_404(db, expediente)
    analisis = (
        await db.execute(
            select(LicitacionAnalisisIA).where(
                LicitacionAnalisisIA.licitacion_id == licitacion.id
            )
        )
    ).scalar_one_or_none()
    pliego = _extract_pliego_data(analisis)

    presupuesto = (
        body.presupuesto_base
        if body.presupuesto_base is not None
        else (
            pliego.get("presupuesto_base")
            or to_float(licitacion.importe_licitacion)
        )
    )
    if presupuesto is None or presupuesto <= 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No hay presupuesto base disponible. Analiza el pliego con M3 o "
            "pasa presupuesto_base en la petición.",
        )

    cpv_codes = licitacion.cpv_codes or []
    cpv4 = cpv_codes[0][:4] if cpv_codes else None
    intel_dict = await _intel_baja(db, licitacion.organismo_id, cpv4)

    res = calcular(
        presupuesto_base=presupuesto,
        baja_pct=body.baja_pct,
        iva_pct=body.iva_pct or 21.0,
        formula_tipo=pliego.get("formula_tipo"),
        umbral_saciedad_pct=pliego.get("umbral_saciedad_pct"),
        baja_media_historica_pct=intel_dict.get("baja_avg_pct"),
        ofertes_esperadas=_ofertes_esperadas_fiables(intel_dict),
    )

    return CalculoOut(
        importe_ofertado=res.importe_ofertado,
        importe_iva=res.importe_iva,
        importe_total=res.importe_total,
        puntos_estimados=res.puntos_estimados,
        puntos_max_referencia=res.puntos_max_referencia,
        diff_vs_baja_media=res.diff_vs_baja_media,
        entra_en_temeraria=res.entra_en_temeraria,
        temeraria=TemerariaInfo(
            threshold_pct=res.temeraria.threshold_pct,
            metodo=res.temeraria.metodo,
            confianza=res.temeraria.confianza,
            n_ofertas_supuesto=res.temeraria.n_ofertas_supuesto,
        )
        if res.temeraria
        else None,
        nivel_riesgo=res.nivel_riesgo,
        nota_riesgo=res.nota_riesgo,
    )


@router.post(
    "/licitacion/{expediente:path}/generar",
    response_model=OfertaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Guarda una versión de la oferta + render HTML para preview.",
)
async def generar(
    expediente: str,
    body: GenerarIn,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfertaEconomicaGeneracion:
    licitacion = await _get_licitacion_or_404(db, expediente)

    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == body.empresa_id))
    ).scalar_one_or_none()
    if empresa is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Empresa {body.empresa_id} no existe"
        )

    analisis = (
        await db.execute(
            select(LicitacionAnalisisIA).where(
                LicitacionAnalisisIA.licitacion_id == licitacion.id
            )
        )
    ).scalar_one_or_none()
    pliego = _extract_pliego_data(analisis)

    presupuesto = (
        pliego.get("presupuesto_base")
        or to_float(licitacion.importe_licitacion)
    )
    if presupuesto is None or presupuesto <= 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No hay presupuesto base. Analiza el pliego con M3 antes de "
            "guardar la oferta.",
        )

    cpv_codes = licitacion.cpv_codes or []
    cpv4 = cpv_codes[0][:4] if cpv_codes else None
    intel_dict = await _intel_baja(db, licitacion.organismo_id, cpv4)

    res = calcular(
        presupuesto_base=presupuesto,
        baja_pct=body.baja_pct,
        iva_pct=pliego.get("iva_pct") or 21.0,
        formula_tipo=pliego.get("formula_tipo"),
        umbral_saciedad_pct=pliego.get("umbral_saciedad_pct"),
        baja_media_historica_pct=intel_dict.get("baja_avg_pct"),
        ofertes_esperadas=_ofertes_esperadas_fiables(intel_dict),
    )

    fecha = _fecha_larga_es(date.today())
    snapshot: dict[str, Any] = {
        "empresa": {
            "nombre": empresa.nombre,
            "cif": empresa.cif,
            "direccion_calle": empresa.direccion_calle,
            "direccion_codigo_postal": empresa.direccion_codigo_postal,
            "direccion_ciudad": empresa.direccion_ciudad,
            "direccion_provincia": empresa.direccion_provincia,
            "representante_nombre": empresa.representante_nombre,
            "representante_nif": empresa.representante_nif,
            "representante_cargo": empresa.representante_cargo,
        },
        "licitacion": {
            "expediente": licitacion.expediente,
            "titulo": licitacion.titulo,
            "organismo": licitacion.organismo,
            "importe_licitacion": str(licitacion.importe_licitacion)
            if licitacion.importe_licitacion is not None
            else None,
        },
        "pliego": pliego,
        "intel": intel_dict,
        "presupuesto_base": presupuesto,
        "baja_pct": body.baja_pct,
        "iva_pct": pliego.get("iva_pct") or 21.0,
        "importe_ofertado": res.importe_ofertado,
        "importe_iva": res.importe_iva,
        "importe_total": res.importe_total,
        "puntos_estimados": res.puntos_estimados,
        "diff_vs_baja_media": res.diff_vs_baja_media,
        "entra_en_temeraria": res.entra_en_temeraria,
        "temeraria_threshold_pct": (
            res.temeraria.threshold_pct if res.temeraria else None
        ),
        "nivel_riesgo": res.nivel_riesgo,
        "nota_riesgo": res.nota_riesgo,
        "plazo_ejecucion_meses": pliego.get("plazo_ejecucion_meses"),
        "fecha_emision": fecha,
    }
    html = render_html(snapshot)

    obj = OfertaEconomicaGeneracion(
        empresa_id=body.empresa_id,
        licitacion_id=licitacion.id,
        expediente=licitacion.expediente,
        presupuesto_base=Decimal(str(presupuesto)),
        baja_pct=Decimal(str(body.baja_pct)),
        importe_ofertado=Decimal(str(res.importe_ofertado)),
        temeraria_threshold_pct=(
            Decimal(str(res.temeraria.threshold_pct))
            if res.temeraria is not None
            else None
        ),
        entra_en_temeraria=res.entra_en_temeraria,
        datos_snapshot=snapshot,
        html=html,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get(
    "",
    response_model=list[OfertaListItem],
    summary="Histórico de versiones de oferta económica (sin HTML)",
)
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
    expediente: str | None = None,
) -> Sequence[OfertaEconomicaGeneracion]:
    stmt = (
        select(OfertaEconomicaGeneracion)
        .where(OfertaEconomicaGeneracion.empresa_id == empresa_id)
        .order_by(OfertaEconomicaGeneracion.created_at.desc())
    )
    if expediente:
        stmt = stmt.where(OfertaEconomicaGeneracion.expediente == expediente)
    return list((await db.execute(stmt)).scalars().all())


async def _get_oferta_or_404(
    db: AsyncSession, oferta_id: UUID
) -> OfertaEconomicaGeneracion:
    obj = (
        await db.execute(
            select(OfertaEconomicaGeneracion).where(
                OfertaEconomicaGeneracion.id == oferta_id
            )
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Oferta {oferta_id} no encontrada"
        )
    return obj


@router.get(
    "/{oferta_id}",
    response_model=OfertaRead,
    summary="Detalle de una versión de oferta (con HTML)",
)
async def obtener(
    oferta_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfertaEconomicaGeneracion:
    return await _get_oferta_or_404(db, oferta_id)


@router.get(
    "/{oferta_id}/docx",
    summary="Descarga la proposición económica como Word (.docx) editable",
)
async def descargar_docx(
    oferta_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    obj = await _get_oferta_or_404(db, oferta_id)
    docx_bytes = render_docx(obj.datos_snapshot)
    expediente_safe = (obj.expediente or "oferta").replace("/", "_")[:120]
    filename = f"ProposicionEconomica_{expediente_safe}.docx"
    return Response(
        content=docx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete(
    "/{oferta_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Borra una versión del histórico",
)
async def eliminar(
    oferta_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _get_oferta_or_404(db, oferta_id)
    await db.delete(obj)
    await db.commit()
