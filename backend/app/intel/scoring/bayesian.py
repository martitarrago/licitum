"""Bayesian shrinkage para estimaciones con celdas pequeñas.

Spec: docs/data-science/architecture.md sección 6.1.

Cuando una celda específica (ej. organ X + cpv4 Y + tipus Obres) tiene
pocas observaciones (n < 30), la media muestral es ruido. Hacemos shrinkage
hacia un prior global más estable.

posterior_mean = (n * sample_mean + k * prior_mean) / (n + k)

`k` es un pseudocount calibrable. k=30 = "trato la celda como si tuviera
30 observaciones del prior antes de ver datos reales". Más alto = más
conservador (más pull al prior).

Cuando la celda específica tiene n=0, fallback a celdas más amplias en
orden: (organ, cpv4) → (cpv4) → global.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class BayesianAggregate:
    """Resultado de un cálculo bayesiano con metadata para explicabilidad."""

    posterior_mean: float
    sample_mean: float | None
    prior_mean: float
    n_obs: int
    pseudocount: int
    fallback_level: Literal["exact", "cpv4", "global"]


def bayesian_shrinkage(
    sample_mean: float | None,
    n_obs: int,
    prior_mean: float,
    pseudocount: int = 30,
) -> float:
    """Calcula la media posterior con shrinkage hacia el prior.

    Si n_obs == 0 o sample_mean is None → devuelve prior_mean directamente.
    Cuanto más alto n_obs, más peso a sample_mean. Cuanto más alto k, más al prior.
    """
    if n_obs <= 0 or sample_mean is None:
        return prior_mean
    weight_sample = n_obs / (n_obs + pseudocount)
    weight_prior = pseudocount / (n_obs + pseudocount)
    return weight_sample * sample_mean + weight_prior * prior_mean


def competencia_posterior(
    cell_exact: tuple[float | None, int] | None,
    cell_cpv4: tuple[float | None, int] | None,
    cell_global: tuple[float, int],
    pseudocount_exact: int = 30,
    pseudocount_cpv4: int = 50,
    min_obs_exact: int = 5,
) -> BayesianAggregate:
    """Competencia esperada (ofertes_rebudes) con fallback bayesiano.

    Args:
        cell_exact: (avg, n) en celda (organ, cpv4, tipus) — None si no existe
        cell_cpv4: (avg, n) en celda (cpv4, tipus) — None si no existe
        cell_global: (avg, n) global obras — siempre presente
        pseudocount_exact: shrinkage hacia cpv4 cuando aplicamos exact
        pseudocount_cpv4: shrinkage hacia global cuando aplicamos cpv4
        min_obs_exact: si exact tiene n < min, saltar a cpv4

    Returns:
        BayesianAggregate con posterior_mean + tracking de qué nivel se usó.
    """
    global_mean, _global_n = cell_global

    # Nivel 1: celda exacta con n suficiente
    if cell_exact is not None:
        avg_exact, n_exact = cell_exact
        if avg_exact is not None and n_exact >= min_obs_exact:
            cpv4_mean = cell_cpv4[0] if cell_cpv4 and cell_cpv4[0] is not None else global_mean
            posterior = bayesian_shrinkage(
                sample_mean=avg_exact,
                n_obs=n_exact,
                prior_mean=cpv4_mean,
                pseudocount=pseudocount_exact,
            )
            return BayesianAggregate(
                posterior_mean=posterior,
                sample_mean=avg_exact,
                prior_mean=cpv4_mean,
                n_obs=n_exact,
                pseudocount=pseudocount_exact,
                fallback_level="exact",
            )

    # Nivel 2: celda cpv4
    if cell_cpv4 is not None:
        avg_cpv4, n_cpv4 = cell_cpv4
        if avg_cpv4 is not None and n_cpv4 > 0:
            posterior = bayesian_shrinkage(
                sample_mean=avg_cpv4,
                n_obs=n_cpv4,
                prior_mean=global_mean,
                pseudocount=pseudocount_cpv4,
            )
            return BayesianAggregate(
                posterior_mean=posterior,
                sample_mean=avg_cpv4,
                prior_mean=global_mean,
                n_obs=n_cpv4,
                pseudocount=pseudocount_cpv4,
                fallback_level="cpv4",
            )

    # Nivel 3: global
    return BayesianAggregate(
        posterior_mean=global_mean,
        sample_mean=None,
        prior_mean=global_mean,
        n_obs=0,
        pseudocount=0,
        fallback_level="global",
    )
