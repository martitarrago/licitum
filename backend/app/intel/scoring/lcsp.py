"""Reglas LCSP que se aplican al scoring.

Por ahora solo art. 149 — bajas anormales o desproporcionadas (temerarias).
Si en futuro se añaden más reglas (modificación, prórroga, subcontratación),
viven aquí.

Spec del scoring: docs/data-science/architecture.md sección 6.2.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TemerariaEstimate:
    """Estimación ex-ante del threshold de baja temeraria para una licitación.

    Como NO conocemos las ofertas reales (todavía no se han presentado),
    aproximamos con el número esperado de ofertas (histórico del órgano+CPV)
    y la baja media histórica adjudicataria.

    threshold_pct es el % de baja sobre presupuesto base por encima del cual
    la oferta dispara expediente de justificación (LCSP art. 149).
    """

    threshold_pct: float
    metodo: str
    confianza: str  # 'alta' | 'media' | 'baja'
    n_ofertas_supuesto: int


def estimar_baja_temeraria(
    ofertes_esperadas: float | None,
    baja_media_historica: float | None = None,
) -> TemerariaEstimate | None:
    """Estima el threshold temerario aplicando LCSP art. 149.2 ex-ante.

    Devuelve `None` cuando no hay base suficiente para calcular un valor sin
    inventar. Casos:
      n=1  → 25% sobre presupuesto base (149.2.a)                 [literal LCSP]
      n=2  → 20% sobre la otra (149.2.b)                          [literal LCSP]
      n=3  → media + 10 pp, descartando extremos (149.2.c)        [literal LCSP, requiere media]
      n≥4  → media + 10 pp (149.2.d)                              [literal LCSP, requiere media]

    Si n no es estimable (sin ofertes_esperadas) o si n≥3 y no hay media
    histórica → devolvemos None y el motor lo propaga como "no estimable
    ex-ante", sin inventar un valor.
    """
    if ofertes_esperadas is None or ofertes_esperadas < 1:
        return None
    n = max(1, round(ofertes_esperadas))

    if n == 1:
        return TemerariaEstimate(
            threshold_pct=25.0,
            metodo="Oferta única → temeraria si baja > 25% s/ presupuesto base (LCSP 149.2.a)",
            confianza="alta",
            n_ofertas_supuesto=1,
        )
    if n == 2:
        # 20% sobre la otra ≈ 20% sobre presupuesto base si la otra está cerca del techo
        return TemerariaEstimate(
            threshold_pct=20.0,
            metodo="Dos ofertas previstas → temeraria si baja > 20% s/ la otra (LCSP 149.2.b)",
            confianza="media",
            n_ofertas_supuesto=2,
        )
    # n ≥ 3 — la regla LCSP exige la media. Sin histórico, no estimable ex-ante.
    if baja_media_historica is None or baja_media_historica < 0:
        return None
    threshold = round(baja_media_historica + 10.0, 2)
    confianza = "alta" if n >= 4 else "media"
    return TemerariaEstimate(
        threshold_pct=threshold,
        metodo=(
            f"{n} ofertas previstas → temeraria si baja > media + 10pp (LCSP 149.2.{'d' if n>=4 else 'c'}). "
            f"Aproximación ex-ante con histórico ({baja_media_historica:.1f}% + 10pp)."
        ),
        confianza=confianza,
        n_ofertas_supuesto=n,
    )
