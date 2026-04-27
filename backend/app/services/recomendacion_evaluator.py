"""Evaluador de la recomendación ir/no ir del M3 Pliegos.

Cruza la extracción IA del pliego (M3) con los datos de la empresa (M2):
clasificaciones manuales + RELIC, volumen de negocio, certificados de obra
similares. Devuelve un veredicto (ir / ir_con_riesgo / no_ir / incompleto)
y las razones que lo sustentan en lenguaje natural.

NO se persiste — se calcula en cada request al endpoint
`GET /pliegos/{exp}/recomendacion?empresa_id=X`. Es barato (todos los datos
están en memoria una vez cargados).
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.certificado_obra import CertificadoObra
from app.models.empresa import Empresa
from app.schemas.licitacion_analisis_ia import RecomendacionRead
from app.services.solvencia_evaluator import (
    SolvenciaEmpresa,
    cargar_solvencia_empresa,
)

logger = logging.getLogger(__name__)


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (ValueError, ArithmeticError):
        return None


def _fmt_eur(v: Decimal | None) -> str:
    if v is None:
        return "?"
    return f"{v:,.0f} €".replace(",", ".")


async def calcular_recomendacion(
    db: AsyncSession,
    extraido: dict[str, Any],
    empresa_id: UUID,
) -> RecomendacionRead:
    """Genera la recomendación ir/no ir a partir del análisis IA + M2."""
    empresa = (
        await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    ).scalar_one_or_none()
    if empresa is None:
        return RecomendacionRead(
            veredicto="incompleto",
            titulo="Empresa no encontrada",
            razones_a_favor=[],
            razones_riesgo=[],
            razones_no=[],
        )

    solvencia = await cargar_solvencia_empresa(db, empresa_id)

    certs = list(
        (
            await db.execute(
                select(CertificadoObra).where(
                    CertificadoObra.empresa_id == empresa_id,
                    CertificadoObra.es_valido_solvencia.is_(True),
                    CertificadoObra.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )

    razones_a_favor: list[str] = []
    razones_riesgo: list[str] = []
    razones_no: list[str] = []

    # ── Clasificación exigida vs ROLECE+RELIC merged ──────────────────────
    grupo = extraido.get("clasificacion_grupo")
    if grupo:
        grupo = str(grupo).strip().upper()
        cat_exigida = extraido.get("clasificacion_categoria") or 1
        cat_emp = solvencia.max_categoria_por_grupo.get(grupo, 0)
        if cat_emp >= cat_exigida:
            razones_a_favor.append(
                f"Cumples clasificación {grupo}{cat_exigida} (tienes {grupo}{cat_emp})."
            )
        elif cat_emp > 0:
            razones_riesgo.append(
                f"Tu clasificación {grupo}{cat_emp} es inferior a la {grupo}{cat_exigida} exigida."
            )
        else:
            razones_no.append(
                f"No tienes clasificación en grupo {grupo}, exigido por el pliego."
            )

    # ── Solvencia económica: volumen anual ────────────────────────────────
    vol_exigido = _to_decimal(extraido.get("solvencia_economica_volumen_anual"))
    if vol_exigido is not None:
        vols = [
            empresa.volumen_negocio_n,
            empresa.volumen_negocio_n1,
            empresa.volumen_negocio_n2,
        ]
        vol_max = max((v for v in vols if v is not None), default=None)
        if vol_max is None:
            razones_riesgo.append(
                f"Solvencia económica exigida {_fmt_eur(vol_exigido)} — no has declarado tu volumen anual (completa /empresa/perfil)."
            )
        elif vol_max >= vol_exigido:
            razones_a_favor.append(
                f"Tu volumen anual ({_fmt_eur(vol_max)}) supera el exigido ({_fmt_eur(vol_exigido)})."
            )
        else:
            razones_no.append(
                f"Volumen exigido {_fmt_eur(vol_exigido)}, el tuyo es {_fmt_eur(vol_max)}."
            )

    # ── Solvencia técnica: obras similares ────────────────────────────────
    importe_obras = _to_decimal(
        extraido.get("solvencia_tecnica_obras_similares_importe")
    )
    num_obras_min = extraido.get("solvencia_tecnica_numero_obras") or 1
    if importe_obras is not None:
        certs_que_cumplen = [
            c for c in certs if c.importe_adjudicacion and c.importe_adjudicacion >= importe_obras
        ]
        if len(certs_que_cumplen) >= num_obras_min:
            razones_a_favor.append(
                f"Tienes {len(certs_que_cumplen)} obra(s) ≥ {_fmt_eur(importe_obras)} en tu histórico."
            )
        elif len(certs_que_cumplen) > 0:
            razones_riesgo.append(
                f"Solo {len(certs_que_cumplen)} obra(s) ≥ {_fmt_eur(importe_obras)}, exigen {num_obras_min}."
            )
        else:
            razones_no.append(
                f"No tienes obras ≥ {_fmt_eur(importe_obras)} en tu histórico (exigen {num_obras_min})."
            )

    # ── Plazo de ejecución corto ──────────────────────────────────────────
    plazo_meses = extraido.get("plazo_ejecucion_meses")
    if isinstance(plazo_meses, int) and plazo_meses > 0:
        if plazo_meses < 4:
            razones_riesgo.append(
                f"Plazo de ejecución ajustado: {plazo_meses} mes{'es' if plazo_meses != 1 else ''}."
            )

    # ── Banderas rojas detectadas por la IA ───────────────────────────────
    for b in extraido.get("banderas_rojas", []) or []:
        if isinstance(b, dict):
            desc = b.get("descripcion") or b.get("tipo") or "Bandera roja sin descripción"
            razones_riesgo.append(str(desc))

    # ── Veredicto ─────────────────────────────────────────────────────────
    if razones_no:
        veredicto = "no_ir"
        titulo = "No te recomiendo ir"
    elif len(razones_riesgo) >= 3:
        veredicto = "ir_con_riesgo"
        titulo = "Puedes ir, pero hay riesgos a valorar"
    elif razones_a_favor or razones_riesgo:
        veredicto = "ir"
        titulo = "Te recomiendo ir"
    else:
        veredicto = "incompleto"
        titulo = "Faltan datos para una recomendación firme"

    return RecomendacionRead(
        veredicto=veredicto,
        titulo=titulo,
        razones_a_favor=razones_a_favor,
        razones_riesgo=razones_riesgo,
        razones_no=razones_no,
    )
