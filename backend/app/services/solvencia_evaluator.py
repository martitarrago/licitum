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

import dataclasses
import logging
import unicodedata
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
from app.models.clasificacion_relic import ClasificacionRelic
from app.models.clasificacion_rolece import ClasificacionRolece
from app.models.empresa_relic import EmpresaRelic

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Snapshot de solvencia
# ---------------------------------------------------------------------------


def _normalizar_organismo(s: str | None) -> str | None:
    """Normaliza un nombre de organismo para matching robusto.

    Lowercase + sin acentos + trim + colapsa espacios múltiples. Permite que
    "Ajuntament de Barcelona" y "ajuntament de  barcelona" matcheen igual,
    y que la "ó" o la "à" no rompan la comparación entre M3 y M2 (los datos
    pueden venir en castellano vs catalán).
    """
    if not s:
        return None
    nfd = unicodedata.normalize("NFD", s)
    sin_acentos = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return " ".join(sin_acentos.lower().split())


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
    # Organismos donde la empresa ya ha trabajado (vía certificados validados).
    # `nombre_historico` viene normalizado por `_normalizar_organismo`.
    organismos_id_historicos: set[str] = field(default_factory=set)
    organismos_nombre_historicos: set[str] = field(default_factory=set)
    # Prefijos CPV (4 dígitos) presentes en el histórico de obras certificadas.
    cpv_prefijos_historicos: set[str] = field(default_factory=set)

    @property
    def grupos_con_clasificacion(self) -> set[str]:
        return set(self.max_categoria_por_grupo.keys())

    @property
    def grupos_con_certificados(self) -> set[str]:
        return set(self.max_solvencia_certificada_por_grupo.keys())

    @property
    def vacia(self) -> bool:
        return not self.max_categoria_por_grupo and not self.max_solvencia_certificada_por_grupo

    @property
    def tiene_historial(self) -> bool:
        return bool(
            self.organismos_id_historicos
            or self.organismos_nombre_historicos
            or self.cpv_prefijos_historicos
        )


async def cargar_solvencia_empresa(
    db: AsyncSession,
    empresa_id: uuid.UUID,
) -> SolvenciaEmpresa:
    """Lee y resume el estado de solvencia.

    Filtros:
      - Clasificaciones: activa=True AND fecha_caducidad >= today AND deleted_at IS NULL.
      - Certificados:    es_valido_solvencia=True AND deleted_at IS NULL.

    Para cada grupo, se queda con el MEJOR valor (max categoría / max importe).
    Además recolecta organismos + prefijos CPV de los certificados válidos para
    el cálculo de afinidad histórica.
    """
    today = date.today()

    # ── Clasificaciones manuales (M2 Empresa: clasificaciones_rolece) ───
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

    # ── Clasificaciones RELIC (M2: clasificaciones_relic, sync Socrata) ──
    # Sólo OBRES no suspendidas con categoría parseada. RELIC y manual se
    # FUSIONAN tomando el máximo por grupo: la fuente que tenga la categoría
    # más alta gana. RELIC suele ser más actual y completa, pero respetamos
    # cualquier valor manual superior por si el usuario lo introdujo a mano.
    res_relic = await db.execute(
        select(
            ClasificacionRelic.grupo,
            ClasificacionRelic.categoria,
        )
        .join(EmpresaRelic, EmpresaRelic.id == ClasificacionRelic.empresa_relic_id)
        .where(
            EmpresaRelic.empresa_id == empresa_id,
            ClasificacionRelic.tipus_cl == "OBRES",
            ClasificacionRelic.suspensio.is_(False),
            ClasificacionRelic.categoria.is_not(None),
        )
    )
    for grupo, categoria in res_relic.all():
        if grupo and categoria is not None and categoria > max_cat.get(grupo, 0):
            max_cat[grupo] = categoria

    # ── Certificados: max(importe) por grupo + historial organismo/CPV ───
    res_certs = await db.execute(
        select(
            CertificadoObra.clasificacion_grupo,
            CertificadoObra.importe_adjudicacion,
            CertificadoObra.organismo,
            CertificadoObra.cpv_codes,
        ).where(
            CertificadoObra.empresa_id == empresa_id,
            CertificadoObra.es_valido_solvencia.is_(True),
            CertificadoObra.deleted_at.is_(None),
        )
    )
    max_solv: dict[str, Decimal] = {}
    organismos_nombre: set[str] = set()
    cpv_prefijos: set[str] = set()
    for grupo, importe, organismo, cpvs in res_certs.all():
        if grupo and importe is not None:
            actual = max_solv.get(grupo)
            if actual is None or importe > actual:
                max_solv[grupo] = importe
        normalizado = _normalizar_organismo(organismo)
        if normalizado:
            organismos_nombre.add(normalizado)
        for cpv in cpvs or []:
            if not cpv:
                continue
            for c in cpv.split("||"):
                prefix = c.replace("-", "").strip()[:4]
                if prefix:
                    cpv_prefijos.add(prefix)

    return SolvenciaEmpresa(
        empresa_id=empresa_id,
        max_categoria_por_grupo=max_cat,
        max_solvencia_certificada_por_grupo=max_solv,
        organismos_nombre_historicos=organismos_nombre,
        cpv_prefijos_historicos=cpv_prefijos,
        # `organismos_id_historicos` queda vacío por ahora: M3 todavía no
        # captura DIR3 en certificados. Cuando M3 lo extraiga, este set se
        # llenará y el peso del cálculo de afinidad se rebalanceará.
        organismos_id_historicos=set(),
    )


# ---------------------------------------------------------------------------
# Evaluación
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class LicitacionInput:
    """Datos mínimos de una licitación para evaluar el semáforo + afinidad."""

    tipo_contrato: str | None
    importe: Decimal | None
    cpv_codes: list[str]
    durada_text: str | None  # raw_data->>'durada_contracte'
    organismo: str | None = None  # nombre, usado para match histórico
    organismo_id: str | None = None  # DIR3, usado cuando M3 lo capture


@dataclass(frozen=True)
class EvaluacionSemaforo:
    """Resultado del evaluador.

    `fallback_durada` indica que `parsear_anualidad` cayó en el fallback de
    1 año porque `durada_text` no era parseable. Se propaga al worker para
    contar la proporción y reportarla en logs.

    `afinidad` (0.00–1.00) ordena las licitaciones dentro de cada nivel de
    semáforo: cuanto mayor, más probabilidad de que la empresa "ya juegue
    en esa liga" (mismo organismo, CPV similar al histórico).
    """

    semaforo: str  # "verde" | "amarillo" | "rojo" | "gris"
    razon: str
    fallback_durada: bool = False
    afinidad: Decimal = Decimal("0.00")


# ---------------------------------------------------------------------------
# Afinidad histórica
# ---------------------------------------------------------------------------

# Pesos del score (suman 1.0). Si M3 capturase DIR3, se redistribuye:
#   nombre 0.3 / DIR3 0.5 / CPV 0.2.  Mientras tanto, sin DIR3:
#   nombre 0.7 / CPV 0.3.
_PESO_ORGANISMO_ID = Decimal("0.5")
_PESO_ORGANISMO_NOMBRE_SOLO = Decimal("0.7")
_PESO_ORGANISMO_NOMBRE_CON_ID = Decimal("0.3")
_PESO_CPV_SOLO = Decimal("0.3")
_PESO_CPV_CON_ID = Decimal("0.2")


def calcular_afinidad(
    licitacion: LicitacionInput,
    solvencia: SolvenciaEmpresa,
) -> Decimal:
    """Score de afinidad histórica 0.00–1.00.

    - Match `organismo_id` (DIR3): peso 0.5 (cuando M3 lo capture)
    - Match nombre normalizado: peso 0.7 si no hay DIR3 disponible, 0.3 si sí
    - Match prefijo CPV (4 dígitos): peso 0.3 (sin DIR3) o 0.2 (con DIR3)

    Si la empresa no tiene historial → 0.00.
    El score se cuantiza a 2 decimales (Numeric(3,2) en BD).
    """
    if not solvencia.tiene_historial:
        return Decimal("0.00")

    tiene_dir3_data = bool(solvencia.organismos_id_historicos)
    score = Decimal("0")

    # Organismo: DIR3 toma prioridad si hay datos; si no, nombre.
    if tiene_dir3_data and licitacion.organismo_id and (
        licitacion.organismo_id in solvencia.organismos_id_historicos
    ):
        score += _PESO_ORGANISMO_ID
    else:
        nombre_norm = _normalizar_organismo(licitacion.organismo)
        if nombre_norm and nombre_norm in solvencia.organismos_nombre_historicos:
            score += (
                _PESO_ORGANISMO_NOMBRE_CON_ID
                if tiene_dir3_data
                else _PESO_ORGANISMO_NOMBRE_SOLO
            )

    # CPV: prefijo de 4 dígitos en el histórico.
    if solvencia.cpv_prefijos_historicos:
        peso_cpv = _PESO_CPV_CON_ID if tiene_dir3_data else _PESO_CPV_SOLO
        for cpv in licitacion.cpv_codes or []:
            if not cpv:
                continue
            for c in cpv.split("||"):
                prefix = c.replace("-", "").strip()[:4]
                if prefix and prefix in solvencia.cpv_prefijos_historicos:
                    score += peso_cpv
                    break  # un solo bonus CPV, no acumular por multi-CPV
            else:
                continue
            break

    if score > Decimal("1"):
        score = Decimal("1")
    return score.quantize(Decimal("0.01"))


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
    """Calcula semáforo + razón en prosa + score de afinidad."""
    base = _evaluar_semaforo_core(licitacion, solvencia)
    afinidad = calcular_afinidad(licitacion, solvencia)
    return dataclasses.replace(base, afinidad=afinidad)


def _evaluar_semaforo_core(
    licitacion: LicitacionInput,
    solvencia: SolvenciaEmpresa,
) -> EvaluacionSemaforo:
    """Implementación de las reglas del semáforo. La afinidad la añade
    `evaluar_semaforo` por encima — aquí no se toca."""
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
