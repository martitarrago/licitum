"""Scoring engine — convierte señales del data layer en score de ganabilidad.

Spec: docs/data-science/architecture.md sección 6.
"""
from app.intel.scoring.bayesian import (
    BayesianAggregate,
    bayesian_shrinkage,
    competencia_posterior,
)
from app.intel.scoring.composite import (
    GanabilidadScore,
    HardFilterResult,
    SignalBreakdown,
    compute_composite_score,
    hard_filter_capacidad,
    hard_filter_clasificacion,
    hard_filter_estado_aceptacion,
    hard_filter_preferencia_no_interesa,
    hard_filter_presupuesto,
    hard_filter_solvencia,
    signal_baja_factible,
    signal_competencia_esperada,
    signal_concentracion_organo,
    signal_encaje_geografico,
    signal_encaje_tecnico,
    signal_preferencias_match,
)
from app.intel.scoring.lcsp import TemerariaEstimate, estimar_baja_temeraria

__all__ = [
    "BayesianAggregate",
    "GanabilidadScore",
    "HardFilterResult",
    "SignalBreakdown",
    "TemerariaEstimate",
    "bayesian_shrinkage",
    "competencia_posterior",
    "compute_composite_score",
    "estimar_baja_temeraria",
    "hard_filter_capacidad",
    "hard_filter_clasificacion",
    "hard_filter_estado_aceptacion",
    "hard_filter_preferencia_no_interesa",
    "hard_filter_presupuesto",
    "hard_filter_solvencia",
    "signal_baja_factible",
    "signal_competencia_esperada",
    "signal_concentracion_organo",
    "signal_encaje_geografico",
    "signal_encaje_tecnico",
    "signal_preferencias_match",
]
