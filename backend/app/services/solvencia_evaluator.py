"""Evaluador de semáforo del Radar (M2) — lógica de doble canal.

Cruza la solvencia de la empresa (clasificaciones ROLECE activas + certificados
de obra validados) con los requisitos derivados del CPV e importe de cada
licitación, y produce un semáforo + razón en prosa.

Reglas (en orden de evaluación):
  1. Tipo de contrato no es "obras"/"concesion_obras" → ROJO.
  2. CPV no se puede mapear a ningún grupo ROLECE → GRIS.
  3. Empresa sin solvencia (ni clasificaciones activas ni certificados
     válidos) → GRIS.
  4. Canal 1 (clasificación): la empresa tiene clasificación activa en algún
     grupo exigido. Compara categoría empresa vs categoría exigida por
     anualidad → VERDE / AMARILLO.
  5. Canal 2 (certificados de buena ejecución, fallback legal LCSP art. 88):
     la empresa tiene certificados validados en algún grupo exigido. Compara
     importe de la obra vs solvencia certificada en ese grupo → VERDE / AMARILLO.
  6. Sin coincidencias en ninguno de los dos canales → ROJO.

Cargar la solvencia UNA SOLA VEZ por flujo de evaluación: se itera sobre N
licitaciones sin más round-trips a BD.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cpv_rolece import (
    CATEGORIA_RANGO_TEXTO,
    GRUPO_NOMBRE,
    GRUPOS_ROLECE,
    categoria_por_anualidad,
    extraer_grupos_exigidos,
    parsear_anualidad,
)
from app.models.certificado_obra import CertificadoObra
from app.models.clasificacion_rolece import ClasificacionRolece

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Snapshot de solvencia
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SolvenciaEmpresa:
    """Estado de solvencia de una empresa, listo para evaluar N licitaciones.

    Estructura derivada de clasificaciones_rolece + certificados_obra. Diseñada
    como snapshot inmutable: se carga una vez y se reutiliza en todas las
    evaluaciones del mismo flujo (ingesta, recálculo masivo).
    """

    empresa_id: uuid.UUID
    # grupo (A–K) → max categoría activa (1–6) en clasificaciones
    max_categoria_por_grupo: dict[str, int] = field(default_factory=dict)
    # grupo → max importe certificado (Decimal €), via es_valido_solvencia=true
    max_solvencia_certificada_por_grupo: dict[str, Decimal] = field(default_factory=dict)

    @property
    def grupos_con_clasificacion(self) -> set[str]:
        return set(self.max_categoria_por_grupo.keys())

    @property
    def grupos_con_certificados(self) -> set[str]:
        return set(self.max_solvencia_certificada_por_grupo.keys())

    @property
    def vacia(self) -> bool:
        return not self.max_categoria_por_grupo and not self.max_solvencia_certificada_por_grupo


async def cargar_solvencia_empresa(
    db: AsyncSession,
    empresa_id: uuid.UUID,
) -> SolvenciaEmpresa:
    """Lee y resume el estado de solvencia.

    Filtros:
      - Clasificaciones: activa=True AND fecha_caducidad >= today AND deleted_at IS NULL.
      - Certificados:    es_valido_solvencia=True AND deleted_at IS NULL.

    Para cada grupo, se queda con el MEJOR valor (max categoría / max importe).
    """
    today = date.today()

    # ── Clasificaciones agrupadas por grupo ─────────────────────────────
    res_clas = await db.execute(
        select(
            ClasificacionRolece.grupo,
            ClasificacionRolece.categoria,
        ).where(
            ClasificacionRolece.empresa_id == empresa_id,
            ClasificacionRolece.activa.is_(True),
            ClasificacionRolece.fecha_caducidad >= today,
            ClasificacionRolece.deleted_at.is_(None),
        )
    )
    max_cat: dict[str, int] = {}
    for grupo, categoria in res_clas.all():
        try:
            cat_int = int(categoria)
        except (TypeError, ValueError):
            continue
        if grupo and cat_int > max_cat.get(grupo, 0):
            max_cat[grupo] = cat_int

    # ── Certificados: max(importe) por grupo ────────────────────────────
    res_certs = await db.execute(
        select(
            CertificadoObra.clasificacion_grupo,
            func.max(CertificadoObra.importe_adjudicacion),
        )
        .where(
            CertificadoObra.empresa_id == empresa_id,
            CertificadoObra.es_valido_solvencia.is_(True),
            CertificadoObra.deleted_at.is_(None),
            CertificadoObra.clasificacion_grupo.is_not(None),
            CertificadoObra.importe_adjudicacion.is_not(None),
        )
        .group_by(CertificadoObra.clasificacion_grupo)
    )
    max_solv: dict[str, Decimal] = {}
    for grupo, importe in res_certs.all():
        if grupo and importe is not None:
            max_solv[grupo] = importe

    return SolvenciaEmpresa(
        empresa_id=empresa_id,
        max_categoria_por_grupo=max_cat,
        max_solvencia_certificada_por_grupo=max_solv,
    )


# ---------------------------------------------------------------------------
# Evaluación
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LicitacionInput:
    """Datos mínimos de una licitación para evaluar el semáforo."""

    tipo_contrato: str | None
    importe: Decimal | None
    cpv_codes: list[str]
    durada_text: str | None  # raw_data->>'durada_contracte'


@dataclass(frozen=True)
class EvaluacionSemaforo:
    """Resultado del evaluador.

    `fallback_durada` indica que `parsear_anualidad` cayó en el fallback de
    1 año porque `durada_text` no era parseable. Se propaga al worker para
    contar la proporción y reportarla en logs.
    """

    semaforo: str  # "verde" | "amarillo" | "rojo" | "gris"
    razon: str
    fallback_durada: bool = False


def _fmt_eur(v: Decimal | None) -> str:
    if v is None:
        return "?"
    return f"{v:,.0f} €".replace(",", ".")


def _format_grupos_exigidos(grupos: set[str]) -> str:
    """Formato humano para una lista de grupos en la razón."""
    n = len(grupos)
    if n == 0:
        return "ninguno"
    if n >= len(GRUPOS_ROLECE):
        return "cualquier grupo (CPV genérico)"
    if n == 1:
        g = next(iter(grupos))
        return f"{g} ({GRUPO_NOMBRE[g]})"
    return "/".join(sorted(grupos))


def evaluar_semaforo(
    licitacion: LicitacionInput,
    solvencia: SolvenciaEmpresa,
) -> EvaluacionSemaforo:
    """Calcula semáforo + razón en prosa según las reglas del módulo."""
    tc = licitacion.tipo_contrato

    # Regla 1 — solo obras.
    if tc not in ("obras", "concesion_obras"):
        tipo_legible = tc or "sin clasificar"
        return EvaluacionSemaforo(
            semaforo="rojo",
            razon=f"Tipo de contrato '{tipo_legible}' fuera del alcance — solo obras públicas.",
        )

    # Regla 2 — CPV mapeable.
    grupos_exigidos = extraer_grupos_exigidos(licitacion.cpv_codes)
    if not grupos_exigidos:
        cpvs_str = ", ".join(licitacion.cpv_codes) if licitacion.cpv_codes else "ninguno"
        return EvaluacionSemaforo(
            semaforo="gris",
            razon=(
                f"CPV {cpvs_str} no se puede clasificar automáticamente en grupos "
                "ROLECE — revisa el pliego."
            ),
        )

    # Regla 3 — la empresa tiene alguna solvencia registrada.
    if solvencia.vacia:
        return EvaluacionSemaforo(
            semaforo="gris",
            razon=(
                "Sin solvencia registrada (no hay clasificaciones ROLECE activas ni "
                "certificados de obra validados)."
            ),
        )

    grupos_exigidos_str = _format_grupos_exigidos(grupos_exigidos)

    # ── Canal 1: clasificación ROLECE ─────────────────────────────────────
    coinciden_clasif = grupos_exigidos & solvencia.grupos_con_clasificacion
    if coinciden_clasif:
        anualidad, fallback = parsear_anualidad(licitacion.importe, licitacion.durada_text)
        cat_exigida = categoria_por_anualidad(anualidad)

        if cat_exigida is None:
            return EvaluacionSemaforo(
                semaforo="amarillo",
                razon=(
                    f"Tienes clasificación en grupo {grupos_exigidos_str}, pero el "
                    "importe de la obra no está publicado — no se puede comprobar la categoría."
                ),
                fallback_durada=fallback,
            )

        # Mejor grupo coincidente: el que tenga max categoría empresa.
        mejor_grupo = max(
            coinciden_clasif,
            key=lambda g: solvencia.max_categoria_por_grupo[g],
        )
        cat_empresa = solvencia.max_categoria_por_grupo[mejor_grupo]
        rango_emp = CATEGORIA_RANGO_TEXTO.get(cat_empresa, "?")
        rango_exi = CATEGORIA_RANGO_TEXTO.get(cat_exigida, "?")

        if cat_empresa >= cat_exigida:
            return EvaluacionSemaforo(
                semaforo="verde",
                razon=(
                    f"Tu clasificación {mejor_grupo}{cat_empresa} ({rango_emp}) cubre "
                    f"esta obra de {_fmt_eur(licitacion.importe)} "
                    f"(exige cat {cat_exigida}, {rango_exi})."
                ),
                fallback_durada=fallback,
            )
        return EvaluacionSemaforo(
            semaforo="amarillo",
            razon=(
                f"Tienes clasificación {mejor_grupo}{cat_empresa} ({rango_emp}), pero "
                f"esta obra de {_fmt_eur(licitacion.importe)} exige cat {cat_exigida} "
                f"({rango_exi})."
            ),
            fallback_durada=fallback,
        )

    # ── Canal 2: certificados validados ────────────────────────────────────
    coinciden_certs = grupos_exigidos & solvencia.grupos_con_certificados
    if coinciden_certs:
        mejor_grupo = max(
            coinciden_certs,
            key=lambda g: solvencia.max_solvencia_certificada_por_grupo[g],
        )
        max_solv = solvencia.max_solvencia_certificada_por_grupo[mejor_grupo]

        if licitacion.importe is None:
            return EvaluacionSemaforo(
                semaforo="amarillo",
                razon=(
                    f"Tienes certificados en grupo {mejor_grupo} hasta {_fmt_eur(max_solv)}, "
                    "pero el importe de la obra no está publicado."
                ),
            )

        if max_solv >= licitacion.importe:
            return EvaluacionSemaforo(
                semaforo="verde",
                razon=(
                    f"Tus certificados en grupo {mejor_grupo} acreditan hasta {_fmt_eur(max_solv)}, "
                    f"suficiente para esta obra de {_fmt_eur(licitacion.importe)}."
                ),
            )
        return EvaluacionSemaforo(
            semaforo="amarillo",
            razon=(
                f"Tus certificados en grupo {mejor_grupo} acreditan hasta {_fmt_eur(max_solv)}, "
                f"pero esta obra es de {_fmt_eur(licitacion.importe)}."
            ),
        )

    # ── Sin coincidencias en ningún canal ─────────────────────────────────
    grupos_que_tiene = sorted(
        solvencia.grupos_con_clasificacion | solvencia.grupos_con_certificados
    )
    tu_solvencia = ", ".join(grupos_que_tiene) if grupos_que_tiene else "ninguna"
    return EvaluacionSemaforo(
        semaforo="rojo",
        razon=(
            f"Esta obra exige grupo {grupos_exigidos_str} y tu solvencia acreditada "
            f"está en grupo(s) {tu_solvencia}."
        ),
    )
