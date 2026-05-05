"""Score compuesto de ganabilidad — filtros hard + señales blandas.

Spec: docs/data-science/architecture.md sección 6.2 + docs/modules/M2-empresa.md
"Matriz cruzada — qué dato sirve a qué uso".

Dos pasos:
  1. **Hard filters** (binarios): clasificación, solvencia, presupuesto, capacidad,
     estado_aceptacion. Si fallan → score=0 + reason explícito ("descartada").
  2. **Soft signals** (6 señales 0-1 ponderadas): competencia, concentración órgano,
     encaje técnico, encaje geográfico, preferencias CPV, baja factible.

El breakdown es CITABLE — todos los números vienen del data layer real (PSCP +
M2), no inventados.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class SignalBreakdown:
    """Contribución de una señal al score compuesto.

    `data_quality`:
      - 'completa' = todos los inputs están presentes y son fiables.
      - 'parcial'  = se calculó con uno o más fallbacks (defaults o muestras pequeñas).
      - 'faltante' = no había información — la señal devuelve un valor neutro
                     y el peso debería verse como ruido. La UI puede atenuarla.
    """

    name: str
    value_normalized: float  # 0-1
    weight: float  # 0-1
    explanation: str
    data_points: dict[str, Any] = field(default_factory=dict)
    data_quality: str = "completa"

    @property
    def contribution(self) -> float:
        """Puntos que esta señal aporta al score 0-100."""
        return self.value_normalized * self.weight * 100


@dataclass(frozen=True)
class HardFilterResult:
    """Resultado de un filtro hard. fail=True descalifica la licitación."""

    name: str
    fail: bool
    reason: str


@dataclass(frozen=True)
class GanabilidadScore:
    """Score 0-100 con breakdown explicable + hard filters auditables.

    Si `descartada=True`, score=0 y `reason_descarte` explica por qué.
    Las señales blandas se calculan igualmente (informativo) pero no
    contribuyen al score final.

    `data_completeness_pct` resume cuántas señales tenían info completa,
    para que la UI muestre algo como "precisión 67% — completa tu perfil
    para subirla". El umbral por señal: completa=1.0, parcial=0.5,
    faltante=0.
    """

    score: int
    confidence: str  # 'alta' | 'media' | 'baja' | 'n/a'
    descartada: bool
    reason_descarte: str | None
    hard_filters: list[HardFilterResult]
    breakdown: list[SignalBreakdown]
    data_completeness_pct: int  # 0-100

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "confidence": self.confidence,
            "descartada": self.descartada,
            "reason_descarte": self.reason_descarte,
            "data_completeness_pct": self.data_completeness_pct,
            "hard_filters": [
                {"name": f.name, "fail": f.fail, "reason": f.reason}
                for f in self.hard_filters
            ],
            "breakdown": [
                {
                    "name": b.name,
                    "value": round(b.value_normalized, 3),
                    "weight": b.weight,
                    "contribution": round(b.contribution, 2),
                    "explanation": b.explanation,
                    "data_quality": b.data_quality,
                    "data": b.data_points,
                }
                for b in self.breakdown
            ],
        }


# ----------------------------------------------------------------------------
# Pesos del modelo (calibrables con feedback de pilotos)
# ----------------------------------------------------------------------------

WEIGHTS = {
    # Recalibración 2026-05-05 (BUG 2 + MEJORA 3): cap empírico era 82, varianza
    # p25-p75 sólo 2-9 pts. Subir peso a señales que capturan ventaja real
    # (geográfico, encaje técnico) para abrir el rango y separar excelente vs
    # mediocre. Ver docs/data-science/scoring-engine-bugs.md.
    "competencia_esperada": 0.18,  # 0.20 → 0.18
    "concentracion_organo": 0.18,
    "encaje_tecnico": 0.16,        # 0.15 → 0.16 (amplifica spread holgura)
    "encaje_geografico": 0.12,     # 0.08 → 0.12 (misma provincia es ventaja real)
    "preferencias_match": 0.08,    # 0.09 → 0.08
    "baja_factible": 0.18,         # 0.20 → 0.18
    "pliego_check": 0.10,
}
assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "pesos no suman 1"


# ----------------------------------------------------------------------------
# Cálculo de cada señal
# ----------------------------------------------------------------------------


def signal_competencia_esperada(
    ofertes_posterior: float,
    pct_oferta_unica: float | None,
    n_obs: int,
) -> SignalBreakdown:
    """Menos competencia → más ganabilidad. Bonus si órgano tiene historial de oferta única.

    Ofertes_posterior es el output de bayesian_shrinkage.

    Curva continua: 1 oferta → 1.0, decae exponencialmente. Calibrada para
    pasar cerca de los buckets clásicos (3 ofertas ≈ 0.74, 5 ≈ 0.55,
    10 ≈ 0.29) pero sin saltos discretos que producen empates artificiales.
    Clamp inferior 0.05 para 30+ ofertas (megaconcurso, peor caso).
    """
    import math
    if ofertes_posterior <= 1.0:
        value = 1.0
    else:
        value = max(0.05, math.exp(-0.13 * (ofertes_posterior - 1.0)))

    pct_str = f", {pct_oferta_unica*100:.0f}% son oferta única" if pct_oferta_unica is not None else ""
    explanation = (
        f"Competencia esperada: ~{ofertes_posterior:.1f} ofertas (n={n_obs} hist){pct_str}."
    )

    if n_obs >= 30:
        dq = "completa"
    elif n_obs >= 5:
        dq = "parcial"
    else:
        dq = "faltante"

    return SignalBreakdown(
        name="competencia_esperada",
        value_normalized=value,
        weight=WEIGHTS["competencia_esperada"],
        explanation=explanation,
        data_points={
            "ofertes_esperadas": round(ofertes_posterior, 2),
            "pct_oferta_unica": pct_oferta_unica,
            "n_obs": n_obs,
        },
        data_quality=dq,
    )


def signal_concentracion_organo(
    hhi: float | None,
    n_adjudicaciones: int | None,
    empresa_es_top: bool,
) -> SignalBreakdown:
    """HHI mide concentración. Si órgano es feudo y la empresa NO es top adjudicatario → mal.

    HHI: 0 = atomizado, 1 = monopolio.
    Si empresa_es_top=True → no penalizamos (eres parte del feudo).
    Si empresa_es_top=False y HHI>0.25 → penalizamos.
    """
    if hhi is None or n_adjudicaciones is None or n_adjudicaciones < 5:
        return SignalBreakdown(
            name="concentracion_organo",
            value_normalized=0.5,
            weight=WEIGHTS["concentracion_organo"],
            explanation="Sin histórico suficiente del órgano para evaluar concentración.",
            data_points={"hhi": hhi, "n_adjudicaciones": n_adjudicaciones, "tu_eres_top": empresa_es_top},
            data_quality="faltante",
        )

    if empresa_es_top:
        # 0.85 → 1.0 (BUG 2): si la empresa ya es top adjudicatario, es la
        # ventaja relacional más fuerte que el motor puede capturar — no hay
        # razón para capar la señal. Antes capaba el techo del score.
        value = 1.0
        explanation = (
            f"Eres adjudicatario habitual de este órgano (HHI={hhi:.2f}, "
            f"{n_adjudicaciones} adjudicaciones históricas). Posición ventajosa."
        )
    elif hhi >= 0.30:
        value = 0.20
        explanation = (
            f"Órgano altamente concentrado (HHI={hhi:.2f}) y NO eres adjudicatario "
            f"recurrente — eres outsider en un feudo."
        )
    elif hhi >= 0.20:
        value = 0.45
        explanation = (
            f"Concentración moderada (HHI={hhi:.2f}). Hay 2-3 adjudicatarios habituales."
        )
    else:
        # 0.75 → 0.85 (MEJORA 3): mercado abierto es ventaja real para una PYME
        # outsider — sin adjudicatario dominante, la oferta gana por mérito.
        value = 0.85
        explanation = (
            f"Mercado abierto en este órgano (HHI={hhi:.2f}). Sin adjudicatarios dominantes."
        )

    return SignalBreakdown(
        name="concentracion_organo",
        value_normalized=value,
        weight=WEIGHTS["concentracion_organo"],
        explanation=explanation,
        data_points={
            "hhi": round(hhi, 3),
            "n_adjudicaciones": n_adjudicaciones,
            "tu_eres_top": empresa_es_top,
        },
        data_quality="completa" if n_adjudicaciones >= 20 else "parcial",
    )


def signal_encaje_tecnico(
    cumple_clasificacion: bool,
    cumple_solvencia: bool,
    nivel_clasificacion_holgura: float | None = None,
) -> SignalBreakdown:
    """Encaje técnico de la empresa con los requisitos del pliego.

    Inputs vienen de M2/RELIC (externo al data layer PSCP).
    """
    # MEJORA 3 (2026-05-05): tramos por holgura. Antes era binario verde/justo
    # (1.0 vs 0.8), 3 pts de spread. Ahora granularidad real: verde con holgura
    # cómoda vs amarillo justo vs rojo/gris-pasa-LCSP. Crea diferenciación
    # entre "clasificación encaja con holgura" y "encaja al límite".
    if not cumple_clasificacion:
        value = 0.0
        explanation = "No cumples la clasificación requerida — descalificación técnica."
    elif not cumple_solvencia:
        # 0.2 → 0.1 (MEJORA 3): cumple clasif pero no solvencia es señal débil.
        value = 0.1
        explanation = "Clasificación OK pero solvencia económica/técnica justa."
    elif nivel_clasificacion_holgura is None:
        # Caso del beneficio de la duda — gris sin importe declarado.
        value = 0.5
        explanation = "Clasificación sin info de holgura (CPV no clasificable o solvencia parcial)."
    elif nivel_clasificacion_holgura >= 1.5:
        # Verde con holgura cómoda — categoría supera el mínimo del pliego.
        value = 1.0
        explanation = (
            f"Clasificación con holgura ({nivel_clasificacion_holgura:.1f}× sobre el mínimo) "
            "y solvencia cómoda."
        )
    elif nivel_clasificacion_holgura >= 1.0:
        # Amarillo justo — categoría exacta, sin margen.
        value = 0.7
        explanation = "Cumples clasificación al límite, sin holgura sobre el mínimo del pliego."
    else:
        # Holgura < 1: caso rojo-con-exención LCSP (0.8) o gris-con-exención (0.5).
        # Pasa el filtro hard pero la posición técnica es débil — bajamos a 0.4.
        value = 0.4
        explanation = (
            f"Pasas vía exención LCSP (<500 000 €) pero sin clasificación que cubra: "
            f"posición técnica débil (holgura {nivel_clasificacion_holgura:.1f})."
        )

    dq = "completa" if nivel_clasificacion_holgura is not None else "parcial"
    return SignalBreakdown(
        name="encaje_tecnico",
        value_normalized=value,
        weight=WEIGHTS["encaje_tecnico"],
        explanation=explanation,
        data_points={
            "cumple_clasificacion": cumple_clasificacion,
            "cumple_solvencia": cumple_solvencia,
            "holgura": nivel_clasificacion_holgura,
        },
        data_quality=dq,
    )


def signal_encaje_geografico(
    distancia_km: float | None,
    es_misma_provincia: bool,
    es_mismo_nuts3: bool,
) -> SignalBreakdown:
    """Distancia geográfica licitación vs sede empresa.

    Construcción: <50 km es zona natural. >150 km es desplazamiento serio.
    """
    # Curva continua por tramos. Misma provincia → siempre máximo (la
    # distancia entre centroides puede ser >0 pero la operativa es local).
    if distancia_km is None:
        value = 0.5
        explanation = "Distancia no calculada (datos NUTS de licitación incompletos)."
    elif es_misma_provincia:
        value = 1.0
        explanation = f"Obra en tu provincia ({distancia_km:.0f} km al centroide)."
    elif distancia_km <= 50:
        value = 1.0
        explanation = f"Obra en tu zona natural ({distancia_km:.0f} km)."
    elif distancia_km <= 150:
        # Tramo 50→150 km: 1.0 → 0.5 lineal
        value = round(1.0 - (distancia_km - 50) / 100 * 0.5, 3)
        explanation = f"Distancia moderada ({distancia_km:.0f} km) — coste logístico."
    elif distancia_km <= 250:
        # Tramo 150→250 km: 0.5 → 0.2 lineal
        value = round(0.5 - (distancia_km - 150) / 100 * 0.3, 3)
        explanation = f"Distancia significativa ({distancia_km:.0f} km)."
    else:
        value = 0.2
        explanation = f"Obra lejana ({distancia_km:.0f} km) — coste logístico alto."

    dq = "completa" if distancia_km is not None else "parcial"
    return SignalBreakdown(
        name="encaje_geografico",
        value_normalized=value,
        weight=WEIGHTS["encaje_geografico"],
        explanation=explanation,
        data_points={
            "distancia_km": distancia_km,
            "misma_provincia": es_misma_provincia,
            "mismo_nuts3": es_mismo_nuts3,
        },
        data_quality=dq,
    )


def signal_baja_factible(
    baja_necesaria_estimada: float | None,
    margen_minimo_empresa: float | None,
    baja_temeraria_threshold: float | None,
    n_obs_baja: int,
) -> SignalBreakdown:
    """¿Es factible ofrecer la baja necesaria SIN entrar en pérdidas Y sin caer en temeraria?

    Tres dimensiones:
      1. baja_necesaria_estimada (PSCP)  = la mediana histórica para ganar
      2. margen_minimo_empresa (M2)      = umbral estructural sin pérdidas
      3. baja_temeraria_threshold (LCSP) = límite de oferta anormal

    Producto: factible_normal / al_limite_margen / supera_margen / zona_temeraria.

    Si faltan datos, degrada a neutro con data_quality='faltante'.
    """
    if baja_necesaria_estimada is None:
        return SignalBreakdown(
            name="baja_factible",
            value_normalized=0.5,
            weight=WEIGHTS["baja_factible"],
            explanation="Sin histórico de baja para este (órgano, CPV) — precisión limitada.",
            data_points={
                "baja_necesaria": None,
                "margen_minimo": margen_minimo_empresa,
                "baja_temeraria_threshold": baja_temeraria_threshold,
            },
            data_quality="faltante",
        )

    margen_declarado = margen_minimo_empresa is not None
    margen_efectivo = margen_minimo_empresa if margen_declarado else 8.0  # default rudo PYME

    # Estado vs margen empresa
    diff = margen_efectivo - baja_necesaria_estimada
    if diff >= 5:
        margen_status = "comoda"
    elif diff >= 0:
        margen_status = "al_limite"
    else:
        margen_status = "supera"

    # Estado vs threshold temerario
    temeraria_status = "fuera_zona"
    if baja_temeraria_threshold is not None:
        if baja_necesaria_estimada > baja_temeraria_threshold:
            temeraria_status = "supera_temeraria"
        elif baja_necesaria_estimada >= baja_temeraria_threshold * 0.9:
            temeraria_status = "borde_temeraria"

    # Combinar — la peor señal manda
    if temeraria_status == "supera_temeraria":
        value = 0.10
        marker = "🛑"
        explanation = (
            f"{marker} Ganar exigiría baja > {baja_temeraria_threshold:.1f}% (umbral temerario LCSP). "
            f"Tendrías que justificar ante mesa expediente de baja anormal."
        )
    elif margen_status == "supera":
        value = 0.15
        explanation = (
            f"Baja necesaria ~{baja_necesaria_estimada:.1f}% supera tu margen mínimo "
            f"({margen_efectivo:.0f}%). Riesgo de pérdidas si ganas."
        )
    elif temeraria_status == "borde_temeraria":
        value = 0.40
        marker = "⚠"
        explanation = (
            f"{marker} Baja necesaria ~{baja_necesaria_estimada:.1f}% está al borde del umbral "
            f"temerario ({baja_temeraria_threshold:.1f}%). Ganar con margen exigirá defensa robusta."
        )
    else:
        # Zona segura: interpolación continua entre al_limite (diff=0 → 0.60) y
        # comoda (diff≥5 → 1.0). Antes había salto duro entre 0.60 y 1.0 que
        # creaba empates artificiales en el ranking.
        clamped_diff = min(5.0, max(0.0, diff))
        value = round(0.60 + (clamped_diff / 5.0) * 0.40, 3)
        if margen_status == "al_limite":
            explanation = (
                f"Baja necesaria ~{baja_necesaria_estimada:.1f}% al límite de tu margen "
                f"({margen_efectivo:.0f}%, holgura {diff:.1f} pp)."
            )
        else:
            explanation = (
                f"Baja necesaria ~{baja_necesaria_estimada:.1f}% está cómoda "
                f"(tu margen permite hasta {margen_efectivo:.0f}%, holgura {diff:.1f} pp)."
            )

    # data_quality
    if not margen_declarado:
        dq = "parcial"  # asumimos default 8%
    elif baja_temeraria_threshold is None:
        dq = "parcial"  # no pudimos estimar threshold
    elif n_obs_baja < 5:
        dq = "parcial"  # baja histórica con muestra pequeña
    else:
        dq = "completa"

    return SignalBreakdown(
        name="baja_factible",
        value_normalized=value,
        weight=WEIGHTS["baja_factible"],
        explanation=explanation,
        data_points={
            "baja_necesaria": round(baja_necesaria_estimada, 2),
            "baja_temeraria_threshold": (
                round(baja_temeraria_threshold, 2) if baja_temeraria_threshold is not None else None
            ),
            "margen_minimo": margen_efectivo,
            "margen_declarado": margen_declarado,
            "margen_status": margen_status,
            "temeraria_status": temeraria_status,
            "diff_margen_pp": round(diff, 2),
            "n_obs": n_obs_baja,
        },
        data_quality=dq,
    )


def signal_pliego_check(
    veredicto: str | None,
    razones_riesgo_count: int = 0,
) -> SignalBreakdown:
    """Señal SOFT del análisis IA del pliego (M3).

    Trabaja con el `veredicto` ya calculado por `recomendacion_evaluator`
    cruzando la extracción IA × M2:
      - 'ir'             → 1.0 (pliego confirma encaje)
      - 'ir_con_riesgo'  → 0.5 (encaja pero hay matices a vigilar)
      - 'incompleto'     → 0.5 (faltan datos para conclusión firme — neutro)
      - None             → 0.5 (sin análisis IA — neutro, dq=faltante)

    El caso 'no_ir' NO entra aquí — se gestiona vía hard_filter_pliego que
    descarta la licitación entera. Mantenerlos separados evita el patrón
    "score azul que el pliego contradice": si el pliego dice no, la card
    desaparece del feed principal.
    """
    if veredicto is None:
        return SignalBreakdown(
            name="pliego_check",
            value_normalized=0.5,
            weight=WEIGHTS["pliego_check"],
            explanation="Pliego pendiente de análisis IA — score basado solo en PSCP+M2.",
            data_points={"veredicto": None, "razones_riesgo": 0},
            data_quality="faltante",
        )

    if veredicto == "ir":
        value = 1.0
        explanation = "Pliego confirma encaje (clasificación, solvencia, criterios)."
        dq = "completa"
    elif veredicto == "ir_con_riesgo":
        # 0.3 < neutro 0.5 → penaliza visiblemente la presencia de matices
        # respecto a no tener análisis. Diff vs neutro: -2 pts con peso 0.10.
        value = 0.3
        explanation = (
            f"Pliego con matices ({razones_riesgo_count} riesgo"
            f"{'s' if razones_riesgo_count != 1 else ''} a vigilar)."
        )
        dq = "completa"
    else:  # incompleto
        value = 0.5
        explanation = "Pliego analizado pero datos insuficientes para conclusión firme."
        dq = "parcial"

    return SignalBreakdown(
        name="pliego_check",
        value_normalized=value,
        weight=WEIGHTS["pliego_check"],
        explanation=explanation,
        data_points={"veredicto": veredicto, "razones_riesgo": razones_riesgo_count},
        data_quality=dq,
    )


def signal_preferencias_match(
    cpv_division: str | None,
    pref_cpv_prioridad: str | None,    # 'core' | 'secundario' | 'no_interesa' | None
) -> SignalBreakdown:
    """Match con preferencias declaradas de la empresa (M2 preferencias_cpv).

    No es filtro hard porque el cliente puede aceptar una obra "secundario" si
    encaja todo lo demás. Pero sí mueve el ranking.
    """
    if pref_cpv_prioridad == "core":
        value = 1.0
        explanation = f"CPV {cpv_division or '?'} está en tu core declarado."
    elif pref_cpv_prioridad == "secundario":
        value = 0.5
        explanation = f"CPV {cpv_division or '?'} es secundario en tus preferencias."
    elif pref_cpv_prioridad == "no_interesa":
        value = 0.05
        explanation = f"CPV {cpv_division or '?'} declaraste como NO te interesa."
    else:
        value = 0.5
        explanation = "Sin preferencia declarada para este CPV — neutro."

    dq = "completa" if pref_cpv_prioridad is not None else "faltante"
    return SignalBreakdown(
        name="preferencias_match",
        value_normalized=value,
        weight=WEIGHTS["preferencias_match"],
        explanation=explanation,
        data_points={"cpv_division": cpv_division, "prioridad": pref_cpv_prioridad},
        data_quality=dq,
    )


# ----------------------------------------------------------------------------
# Hard filters — descartan la licitación si fallan
# ----------------------------------------------------------------------------


def hard_filter_clasificacion(cumple: bool) -> HardFilterResult:
    return HardFilterResult(
        name="clasificacion",
        fail=not cumple,
        reason=(
            "OK clasificación ROLECE/RELIC requerida"
            if cumple
            else "No cumples la clasificación ROLECE/RELIC mínima del pliego"
        ),
    )


def hard_filter_solvencia(cumple: bool) -> HardFilterResult:
    return HardFilterResult(
        name="solvencia",
        fail=not cumple,
        reason=(
            "OK solvencia económica/técnica"
            if cumple
            else "No alcanzas el volumen de negocio o anualidad media exigida"
        ),
    )


def hard_filter_presupuesto(
    presupuesto_licitacion: float | None,
    pref_min: float | None,
    pref_max: float | None,
    apetito_ute: bool,
) -> HardFilterResult:
    """Si presupuesto > pref_max y NO acepta UTE → descarte.
    Si presupuesto < pref_min → descarte (no le interesa).
    """
    if presupuesto_licitacion is None or pref_min is None or pref_max is None:
        return HardFilterResult(name="presupuesto", fail=False, reason="OK (sin filtros declarados)")
    if presupuesto_licitacion < pref_min:
        return HardFilterResult(
            name="presupuesto",
            fail=True,
            reason=f"Presupuesto {presupuesto_licitacion:,.0f}€ por debajo de tu mínimo declarado ({pref_min:,.0f}€)",
        )
    if presupuesto_licitacion > pref_max and not apetito_ute:
        return HardFilterResult(
            name="presupuesto",
            fail=True,
            reason=f"Presupuesto {presupuesto_licitacion:,.0f}€ supera tu máximo ({pref_max:,.0f}€) y no aceptas UTE",
        )
    return HardFilterResult(name="presupuesto", fail=False, reason="OK presupuesto en rango")


def hard_filter_capacidad(simultaneas_actual: int | None, simultaneas_max: int | None) -> HardFilterResult:
    if simultaneas_actual is None or simultaneas_max is None:
        return HardFilterResult(name="capacidad", fail=False, reason="OK (capacidad no declarada)")
    if simultaneas_actual >= simultaneas_max:
        return HardFilterResult(
            name="capacidad",
            fail=True,
            reason=f"Tienes {simultaneas_actual} obras en paralelo (tu máximo es {simultaneas_max})",
        )
    return HardFilterResult(name="capacidad", fail=False, reason=f"OK ({simultaneas_actual}/{simultaneas_max} obras)")


def hard_filter_estado_aceptacion(estado: str | None) -> HardFilterResult:
    """estado: 'acepta' | 'selectivo' | 'no_acepta' | None"""
    if estado == "no_acepta":
        return HardFilterResult(
            name="estado_aceptacion",
            fail=True,
            reason="Tu estado actual es 'no acepto obras nuevas'",
        )
    return HardFilterResult(name="estado_aceptacion", fail=False, reason=f"OK ({estado or 'acepta'})")


def hard_filter_preferencia_no_interesa(pref_cpv_prioridad: str | None) -> HardFilterResult:
    """Si la empresa declaró el CPV como 'no_interesa', filtro hard.

    (Nota: si quieres dejarlo como soft, devolver fail=False siempre.)
    """
    if pref_cpv_prioridad == "no_interesa":
        return HardFilterResult(
            name="preferencia_cpv",
            fail=True,
            reason="Declaraste este CPV como 'no me interesa'",
        )
    return HardFilterResult(name="preferencia_cpv", fail=False, reason="OK")


def hard_filter_solvencia_economica(
    volumen_exigido: float | None,
    volumen_max_empresa: float | None,
) -> HardFilterResult:
    """Phase 2 Fase 3 — descarta si el volumen anual exigido por el pliego
    supera el mayor volumen declarado por la empresa (n / n-1 / n-2).

    `volumen_exigido` viene del análisis IA del pliego (campo
    `solvencia_economica_volumen_anual` del extracted_data); el pliego dice
    "exigimos volumen anual ≥ X €". `volumen_max_empresa` es max(n, n1, n2)
    de `volumen_negocio_*` declarado en M2.

    Permisivo cuando falta info: si no hay extracción IA o la empresa no ha
    declarado volumen, no descarta — la decisión queda al `hard_filter_pliego`
    o al cliente. Alineado con la lógica del recomendacion_evaluator pero
    como hard filter granular (reason más específica).
    """
    if volumen_exigido is None:
        return HardFilterResult(
            name="solvencia_economica",
            fail=False,
            reason="OK (sin info de volumen exigido — pliego pendiente de análisis)",
        )
    if volumen_max_empresa is None:
        return HardFilterResult(
            name="solvencia_economica",
            fail=False,
            reason="OK (volumen anual no declarado por la empresa)",
        )
    if volumen_max_empresa < volumen_exigido:
        return HardFilterResult(
            name="solvencia_economica",
            fail=True,
            reason=(
                f"Volumen anual exigido {volumen_exigido:,.0f}€, "
                f"el tuyo es {volumen_max_empresa:,.0f}€"
            ).replace(",", "."),
        )
    return HardFilterResult(
        name="solvencia_economica",
        fail=False,
        reason=(
            f"OK volumen ({volumen_max_empresa:,.0f}€ ≥ {volumen_exigido:,.0f}€ exigido)"
        ).replace(",", "."),
    )


def hard_filter_pliego(
    veredicto: str | None,
    razones_no: list[str] | None = None,
) -> HardFilterResult:
    """Si el análisis IA del pliego determinó 'no_ir', descarta la licitación.

    Esto resuelve el patrón "score azul que el pliego contradice": cuando el
    pliego revela un requisito incumplible (clasificación exacta, solvencia
    económica exacta, restricción específica) la licitación pasa a la sección
    descartadas, no se muestra como ganable con un score erosionado.

    Si no hay análisis disponible (veredicto None) → no_op, no descarta.
    """
    if veredicto != "no_ir":
        return HardFilterResult(
            name="pliego",
            fail=False,
            reason="OK pliego" if veredicto else "Pliego no analizado aún",
        )
    razones_str = "; ".join(razones_no[:2]) if razones_no else "ver detalle del análisis"
    return HardFilterResult(
        name="pliego",
        fail=True,
        reason=f"El análisis del pliego descarta la licitación: {razones_str}",
    )


def hard_filter_documentacion_al_dia(
    docs_caducados: list[str],
    docs_caducan_pronto: list[str],
    dias_a_cierre_licitacion: int | None,
) -> HardFilterResult:
    """LCSP exige presentar documentación administrativa post-adjudicación
    (Hacienda al corriente, SS al corriente, pólizas) en 10 días hábiles.

    Si HOY hay documentos caducados Y la licitación cierra en <14 días naturales,
    no es factible renovar a tiempo de ganar y formalizar. Penalización 3% del
    presupuesto base si se incumple.

    Reglas:
      - docs_caducados con cierre lejano (>30d): warning suave, no descarta
        (se asume que el cliente renovará).
      - docs_caducados con cierre próximo (<14d): hard filter — fail.
      - docs_caducan_pronto (en los próximos 30d) sin cierre próximo: warning
        en datos pero no filtro hard.
    """
    cierre_proximo = dias_a_cierre_licitacion is not None and dias_a_cierre_licitacion < 14
    if docs_caducados and cierre_proximo:
        return HardFilterResult(
            name="documentacion",
            fail=True,
            reason=(
                f"Documentos caducados ({', '.join(docs_caducados)}) y la licitación "
                f"cierra en {dias_a_cierre_licitacion} días. No da tiempo a renovar "
                "antes de la formalización."
            ),
        )
    return HardFilterResult(
        name="documentacion",
        fail=False,
        reason=(
            "OK documentación al día"
            if not docs_caducados and not docs_caducan_pronto
            else f"OK (alerta: {len(docs_caducados)} caducado(s), {len(docs_caducan_pronto)} próximo(s))"
        ),
    )


# ----------------------------------------------------------------------------
# Score compuesto
# ----------------------------------------------------------------------------


_DQ_WEIGHTS = {"completa": 1.0, "parcial": 0.5, "faltante": 0.0}


def _data_completeness_pct(breakdown: list[SignalBreakdown]) -> int:
    """Promedio ponderado por peso de la señal."""
    if not breakdown:
        return 0
    total_w = sum(s.weight for s in breakdown)
    if total_w <= 0:
        return 0
    weighted = sum(_DQ_WEIGHTS.get(s.data_quality, 0.0) * s.weight for s in breakdown)
    return int(round(weighted / total_w * 100))


def compute_composite_score(
    hard_filters: list[HardFilterResult],
    competencia: SignalBreakdown,
    concentracion: SignalBreakdown,
    encaje_tecnico: SignalBreakdown,
    encaje_geografico: SignalBreakdown,
    preferencias: SignalBreakdown,
    baja: SignalBreakdown,
    pliego: SignalBreakdown,
    n_obs_principal: int,
) -> GanabilidadScore:
    """Combina hard filters + 7 señales blandas en score 0-100.

    Si cualquier hard filter falla → score=0 + reason explícito.
    Si todos OK → suma ponderada de las 7 señales.
    """
    failed = [f for f in hard_filters if f.fail]
    breakdown = [competencia, concentracion, encaje_tecnico, encaje_geografico, preferencias, baja, pliego]
    completeness = _data_completeness_pct(breakdown)

    if failed:
        return GanabilidadScore(
            score=0,
            confidence="n/a",
            descartada=True,
            reason_descarte=" + ".join(f.reason for f in failed),
            hard_filters=hard_filters,
            breakdown=breakdown,  # informativo aún descartada
            data_completeness_pct=completeness,
        )

    score_raw = sum(s.contribution for s in breakdown)
    score = int(round(score_raw))

    # Confianza combina n_obs principal + completeness (ambas tienen que ser razonables)
    if n_obs_principal >= 30 and completeness >= 75:
        confidence = "alta"
    elif n_obs_principal >= 10 and completeness >= 50:
        confidence = "media"
    else:
        confidence = "baja"

    return GanabilidadScore(
        score=max(0, min(100, score)),
        confidence=confidence,
        descartada=False,
        reason_descarte=None,
        hard_filters=hard_filters,
        breakdown=breakdown,
        data_completeness_pct=completeness,
    )
