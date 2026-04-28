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
    """Contribución de una señal al score compuesto."""

    name: str
    value_normalized: float  # 0-1
    weight: float  # 0-1
    explanation: str
    data_points: dict[str, Any] = field(default_factory=dict)

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
    """

    score: int
    confidence: str  # 'alta' | 'media' | 'baja'
    descartada: bool
    reason_descarte: str | None
    hard_filters: list[HardFilterResult]
    breakdown: list[SignalBreakdown]

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "confidence": self.confidence,
            "descartada": self.descartada,
            "reason_descarte": self.reason_descarte,
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
                    "data": b.data_points,
                }
                for b in self.breakdown
            ],
        }


# ----------------------------------------------------------------------------
# Pesos del modelo (calibrables con feedback de pilotos)
# ----------------------------------------------------------------------------

WEIGHTS = {
    "competencia_esperada": 0.25,
    "concentracion_organo": 0.18,
    "encaje_tecnico": 0.15,        # M2: clasificación + solvencia técnica
    "encaje_geografico": 0.08,     # M2 prefs territorio + distancia
    "preferencias_match": 0.09,    # M2 prefs CPV (core/secundario/no_interesa)
    "baja_factible": 0.25,         # PSCP histórico + M2 márgenes
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
    Mapeo: 1 oferta → 1.0; 2-3 → 0.7; 4-5 → 0.5; 6-10 → 0.3; 11+ → 0.1
    """
    if ofertes_posterior <= 1.5:
        value = 1.0
    elif ofertes_posterior <= 3:
        value = 0.7
    elif ofertes_posterior <= 5:
        value = 0.5
    elif ofertes_posterior <= 10:
        value = 0.3
    else:
        value = 0.1

    pct_str = f", {pct_oferta_unica*100:.0f}% son oferta única" if pct_oferta_unica is not None else ""
    explanation = (
        f"Competencia esperada: ~{ofertes_posterior:.1f} ofertas (n={n_obs} hist){pct_str}."
    )
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
        )

    if empresa_es_top:
        value = 0.85
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
        value = 0.75
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
    )


def signal_encaje_tecnico(
    cumple_clasificacion: bool,
    cumple_solvencia: bool,
    nivel_clasificacion_holgura: float | None = None,
) -> SignalBreakdown:
    """Encaje técnico de la empresa con los requisitos del pliego.

    Inputs vienen de M2/RELIC (externo al data layer PSCP).
    """
    if not cumple_clasificacion:
        value = 0.0
        explanation = "No cumples la clasificación requerida — descalificación técnica."
    elif not cumple_solvencia:
        value = 0.2
        explanation = "Clasificación OK pero solvencia económica/técnica justa."
    elif nivel_clasificacion_holgura is not None and nivel_clasificacion_holgura > 1:
        value = 1.0
        explanation = (
            f"Clasificación con holgura ({nivel_clasificacion_holgura:.1f}× sobre el mínimo) "
            "y solvencia cómoda."
        )
    else:
        value = 0.8
        explanation = "Cumples clasificación y solvencia justas pero sin holgura."

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
    )


def signal_encaje_geografico(
    distancia_km: float | None,
    es_misma_provincia: bool,
    es_mismo_nuts3: bool,
) -> SignalBreakdown:
    """Distancia geográfica licitación vs sede empresa.

    Construcción: <50 km es zona natural. >150 km es desplazamiento serio.
    """
    if distancia_km is None:
        value = 0.5
        explanation = "Distancia no calculada (datos NUTS de licitación incompletos)."
    elif es_misma_provincia or distancia_km <= 50:
        value = 1.0
        explanation = f"Obra en tu zona natural ({distancia_km:.0f} km, misma provincia)."
    elif es_mismo_nuts3 or distancia_km <= 100:
        value = 0.8
        explanation = f"Obra cercana ({distancia_km:.0f} km, misma comarca)."
    elif distancia_km <= 150:
        value = 0.5
        explanation = f"Distancia significativa ({distancia_km:.0f} km) — coste logístico."
    else:
        value = 0.2
        explanation = f"Obra lejana ({distancia_km:.0f} km) — coste logístico alto."

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
    )


def signal_baja_factible(
    baja_necesaria_estimada: float | None,
    margen_minimo_empresa: float | None,
    n_obs_baja: int,
) -> SignalBreakdown:
    """¿Es factible ofrecer la baja necesaria sin entrar en pérdidas?

    `baja_necesaria_estimada` es la baja mediana histórica (estimación)
    necesaria para ganar en este (organ, cpv4).
    `margen_minimo_empresa` es la baja máxima que la empresa puede aceptar
    antes de entrar en pérdidas. Diferencia → margen real para ofertar.

    Si margen_minimo_empresa is None (no calculado), valor neutro.
    """
    if baja_necesaria_estimada is None:
        return SignalBreakdown(
            name="baja_factible",
            value_normalized=0.5,
            weight=WEIGHTS["baja_factible"],
            explanation="Sin histórico de baja para este (órgano, CPV).",
            data_points={"baja_necesaria": None, "margen_minimo": margen_minimo_empresa},
        )

    if margen_minimo_empresa is None:
        # Sin info de margen: asumimos margen estándar 8% para PYME construcción.
        margen_minimo_empresa = 8.0

    diff = margen_minimo_empresa - baja_necesaria_estimada

    if diff >= 5:
        value = 1.0
        explanation = (
            f"Baja necesaria ~{baja_necesaria_estimada:.1f}% está cómoda (tu margen "
            f"permite hasta {margen_minimo_empresa:.0f}%, holgura {diff:.0f} pp)."
        )
    elif diff >= 0:
        value = 0.6
        explanation = (
            f"Baja necesaria ~{baja_necesaria_estimada:.1f}% está al límite de tu "
            f"margen ({margen_minimo_empresa:.0f}%). Sin margen para sorpresas."
        )
    else:
        value = 0.15
        explanation = (
            f"Baja necesaria ~{baja_necesaria_estimada:.1f}% supera tu margen mínimo "
            f"({margen_minimo_empresa:.0f}%). Riesgo de pérdidas si ganas."
        )

    return SignalBreakdown(
        name="baja_factible",
        value_normalized=value,
        weight=WEIGHTS["baja_factible"],
        explanation=explanation,
        data_points={
            "baja_necesaria": round(baja_necesaria_estimada, 2),
            "margen_minimo": margen_minimo_empresa,
            "diff": round(diff, 2),
            "n_obs": n_obs_baja,
        },
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

    return SignalBreakdown(
        name="preferencias_match",
        value_normalized=value,
        weight=WEIGHTS["preferencias_match"],
        explanation=explanation,
        data_points={"cpv_division": cpv_division, "prioridad": pref_cpv_prioridad},
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


# ----------------------------------------------------------------------------
# Score compuesto
# ----------------------------------------------------------------------------


def compute_composite_score(
    hard_filters: list[HardFilterResult],
    competencia: SignalBreakdown,
    concentracion: SignalBreakdown,
    encaje_tecnico: SignalBreakdown,
    encaje_geografico: SignalBreakdown,
    preferencias: SignalBreakdown,
    baja: SignalBreakdown,
    n_obs_principal: int,
) -> GanabilidadScore:
    """Combina hard filters + 6 señales blandas en score 0-100.

    Si cualquier hard filter falla → score=0 + reason explícito.
    Si todos OK → suma ponderada de las 6 señales.
    """
    failed = [f for f in hard_filters if f.fail]
    breakdown = [competencia, concentracion, encaje_tecnico, encaje_geografico, preferencias, baja]

    if failed:
        return GanabilidadScore(
            score=0,
            confidence="n/a",
            descartada=True,
            reason_descarte=" + ".join(f.reason for f in failed),
            hard_filters=hard_filters,
            breakdown=breakdown,  # informativo aún descartada
        )

    score_raw = sum(s.contribution for s in breakdown)
    score = int(round(score_raw))

    if n_obs_principal >= 30:
        confidence = "alta"
    elif n_obs_principal >= 10:
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
    )
