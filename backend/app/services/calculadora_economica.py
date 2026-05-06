"""Motor de cálculo de la oferta económica (M6 Calculadora).

Implementa las 4 fórmulas LCSP típicas para calcular puntos económicos
de una oferta dado:
  - presupuesto_base: importe sin IVA del PCAP
  - baja_pct: % de baja sobre el presupuesto base que oferta el licitador
  - puntos_max: puntos máximos asignados al criterio económico
  - parámetros específicos según fórmula (umbral saciedad, baja media, etc.)

También combina con `estimar_baja_temeraria` (LCSP art. 149) y la baja
media histórica del órgano para producir una **recomendación** de
rango óptimo de baja: "para máxima puntuación sin entrar en temeraria,
oferta entre X y Y %".
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Any, Literal

from app.intel.scoring.lcsp import TemerariaEstimate, estimar_baja_temeraria

# Tipos de fórmula que extrae M3 del PCAP (mantener sincronizado con
# FORMULA_TIPO_LABELS del frontend).
FormulaTipo = Literal[
    "lineal",
    "proporcional_inversa",
    "lineal_con_saciedad",
    "cuadratica",
    "otra",
    "no_detectado",
]


@dataclass(frozen=True)
class CalculoResultado:
    importe_ofertado: float
    importe_iva: float | None
    importe_total: float | None
    puntos_estimados: float | None
    puntos_max_referencia: float | None
    diff_vs_baja_media: float | None  # baja_pct - baja_media_historica
    entra_en_temeraria: bool
    temeraria: TemerariaEstimate | None
    nivel_riesgo: Literal["seguro", "atencion", "temerario"]
    nota_riesgo: str

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if d.get("temeraria"):
            d["temeraria"] = asdict(self.temeraria)  # type: ignore[arg-type]
        return d


@dataclass(frozen=True)
class Recomendacion:
    rango_optimo_min_pct: float | None
    rango_optimo_max_pct: float | None
    pct_sugerido: float | None
    razonamiento: str
    confianza: Literal["alta", "media", "baja", "ninguna"]


def calcular_puntos(
    *,
    formula_tipo: str | None,
    baja_pct: float,
    baja_max_observada_pct: float,
    puntos_max: float = 100.0,
    umbral_saciedad_pct: float | None = None,
) -> float | None:
    """Calcula los puntos económicos según la fórmula declarada en el PCAP.

    NOTA: el cálculo real depende de la mejor oferta del concurso (que
    no conocemos). Aproximamos con `baja_max_observada_pct` que en cálculo
    en vivo es lo que el usuario quiere comparar contra (típicamente la
    propia oferta del usuario, o una baja máxima histórica). Esto da un
    estimador, no un valor exacto.
    """
    if not formula_tipo or formula_tipo in ("otra", "no_detectado"):
        return None
    if baja_max_observada_pct <= 0:
        # Sin contexto de baja máxima → no podemos estimar relativamente.
        # Para fórmulas lineales, asumimos la propia baja como "techo" de
        # referencia: es decir, si nadie más oferta más baja, te llevas
        # los puntos máximos.
        baja_max_observada_pct = max(baja_pct, 1.0)

    # Lineal directa: puntos proporcionales a la baja respecto al techo.
    if formula_tipo == "lineal":
        if baja_max_observada_pct <= 0:
            return 0.0
        ratio = min(1.0, max(0.0, baja_pct / baja_max_observada_pct))
        return round(puntos_max * ratio, 2)

    # Proporcional inversa: forma típica P = Pmax * (mejor_baja / tu_baja)
    # invertida — premia la mejor baja con max puntos. Aproximamos con
    # baja_max_observada como la "mejor" del lote.
    if formula_tipo == "proporcional_inversa":
        if baja_pct <= 0:
            return 0.0
        # Si tu baja es la mayor (== max), te llevas puntos_max
        ratio = min(1.0, baja_pct / baja_max_observada_pct)
        return round(puntos_max * ratio, 2)

    # Lineal con umbral de saciedad: por encima del umbral los puntos no suben.
    if formula_tipo == "lineal_con_saciedad":
        umbral = umbral_saciedad_pct or baja_max_observada_pct
        if umbral <= 0:
            return puntos_max
        ratio = min(1.0, max(0.0, baja_pct / umbral))
        return round(puntos_max * ratio, 2)

    # Cuadrática: penaliza más fuerte las bajas medias y premia los extremos
    # (formato P = Pmax * (baja/max)^2 — variante común para incentivar
    # bajas agresivas pero no temerarias).
    if formula_tipo == "cuadratica":
        if baja_max_observada_pct <= 0:
            return 0.0
        ratio = min(1.0, max(0.0, baja_pct / baja_max_observada_pct))
        return round(puntos_max * (ratio**2), 2)

    return None


def calcular(
    *,
    presupuesto_base: float,
    baja_pct: float,
    iva_pct: float | None = 21.0,
    formula_tipo: str | None = None,
    umbral_saciedad_pct: float | None = None,
    puntos_max: float = 100.0,
    baja_media_historica_pct: float | None = None,
    ofertes_esperadas: float | None = None,
    temeraria_threshold_override: float | None = None,
) -> CalculoResultado:
    """Cálculo en vivo a partir de un % de baja.

    Devuelve importe ofertado, riesgo temerario, comparativa con baja
    media histórica y estimación de puntos económicos. NO persiste —
    se llama en cada cambio del slider del frontend.
    """
    presupuesto_base = max(0.0, float(presupuesto_base))
    baja_pct = max(0.0, float(baja_pct))

    importe_ofertado = round(presupuesto_base * (1 - baja_pct / 100.0), 2)
    importe_iva = (
        round(importe_ofertado * (iva_pct / 100.0), 2)
        if iva_pct is not None
        else None
    )
    importe_total = (
        round(importe_ofertado + importe_iva, 2)
        if importe_iva is not None
        else None
    )

    # Threshold temeraria: si el PCAP lo dice explícito, lo usamos; si no,
    # estimación ex-ante con histórico.
    temeraria: TemerariaEstimate | None = None
    if temeraria_threshold_override is not None:
        threshold = float(temeraria_threshold_override)
    else:
        temeraria = estimar_baja_temeraria(
            ofertes_esperadas=ofertes_esperadas,
            baja_media_historica=baja_media_historica_pct,
        )
        threshold = temeraria.threshold_pct

    entra_temeraria = baja_pct >= threshold

    # Nivel de riesgo: 3 zonas
    margen = threshold - baja_pct
    if entra_temeraria:
        nivel: Literal["seguro", "atencion", "temerario"] = "temerario"
        nota = (
            f"La baja propuesta ({baja_pct:.1f}%) iguala o supera el umbral "
            f"de baja anormalmente baja estimado ({threshold:.1f}%). Si "
            "presentas esta oferta el órgano puede pedirte justificación o "
            "rechazarla."
        )
    elif margen <= 2.0:
        nivel = "atencion"
        nota = (
            f"Estás a {margen:.1f} pp del umbral temerario "
            f"({threshold:.1f}%). Hay riesgo razonable de tener que justificar."
        )
    else:
        nivel = "seguro"
        nota = (
            f"La baja queda {margen:.1f} pp por debajo del umbral temerario "
            f"({threshold:.1f}%). Margen de seguridad cómodo."
        )

    diff = (
        round(baja_pct - baja_media_historica_pct, 2)
        if baja_media_historica_pct is not None
        else None
    )

    # Puntos estimados — comparamos contra la propia baja como mejor del lote
    # (caso más optimista) y como baja media histórica (caso esperado).
    # Para el "estimado por defecto" usamos baja media histórica si está,
    # sino la propia baja.
    referencia_baja = baja_media_historica_pct or baja_pct
    puntos = calcular_puntos(
        formula_tipo=formula_tipo,
        baja_pct=baja_pct,
        baja_max_observada_pct=max(referencia_baja, baja_pct),
        puntos_max=puntos_max,
        umbral_saciedad_pct=umbral_saciedad_pct,
    )

    return CalculoResultado(
        importe_ofertado=importe_ofertado,
        importe_iva=importe_iva,
        importe_total=importe_total,
        puntos_estimados=puntos,
        puntos_max_referencia=puntos_max,
        diff_vs_baja_media=diff,
        entra_en_temeraria=entra_temeraria,
        temeraria=temeraria,
        nivel_riesgo=nivel,
        nota_riesgo=nota,
    )


def recomendar_baja(
    *,
    formula_tipo: str | None,
    baja_media_historica_pct: float | None,
    ofertes_esperadas: float | None,
    umbral_saciedad_pct: float | None = None,
    temeraria_threshold_override: float | None = None,
) -> Recomendacion:
    """Devuelve un rango óptimo y un % sugerido para maximizar puntos
    económicos sin entrar en temeraria.
    """
    # Threshold de temeraria
    if temeraria_threshold_override is not None:
        threshold = float(temeraria_threshold_override)
        confianza_temer = "alta"
    else:
        t = estimar_baja_temeraria(
            ofertes_esperadas=ofertes_esperadas,
            baja_media_historica=baja_media_historica_pct,
        )
        threshold = t.threshold_pct
        confianza_temer = t.confianza

    # Sin histórico ni saciedad → recomendación blanda
    if baja_media_historica_pct is None and umbral_saciedad_pct is None:
        return Recomendacion(
            rango_optimo_min_pct=None,
            rango_optimo_max_pct=None,
            pct_sugerido=None,
            razonamiento=(
                "Sin histórico suficiente del órgano para esta categoría. "
                "Decisión a criterio del licitador. El umbral temerario "
                f"estimado es {threshold:.1f}% — no superarlo."
            ),
            confianza="ninguna",
        )

    margen_seguridad = 2.0  # pp de margen al threshold temerario
    techo_seguro = max(0.0, threshold - margen_seguridad)

    # Si hay umbral de saciedad → óptimo es justo en el umbral, siempre clampado
    # bajo el techo seguro
    if umbral_saciedad_pct is not None and umbral_saciedad_pct > 0:
        sugerido = max(0.0, min(umbral_saciedad_pct, techo_seguro))
        return Recomendacion(
            rango_optimo_min_pct=round(max(sugerido - 1.0, 0.0), 2),
            rango_optimo_max_pct=round(sugerido, 2),
            pct_sugerido=round(sugerido, 2),
            razonamiento=(
                f"El PCAP fija un umbral de saciedad en {umbral_saciedad_pct:.1f}%. "
                "Por encima de ese punto los puntos económicos no crecen; "
                "por debajo, sí. La oferta óptima es exactamente el umbral, "
                f"siempre que quede bajo el threshold temerario ({threshold:.1f}%)."
            ),
            confianza="alta" if confianza_temer == "alta" else "media",
        )

    media = baja_media_historica_pct or 0.0
    confianza_final: Literal["alta", "media", "baja", "ninguna"] = (
        "alta" if confianza_temer == "alta" else "media"
    )

    # Caso conflictivo: la baja media histórica está pegada al techo seguro
    # (no queda hueco para diferenciarse). Suele pasar cuando la regla rígida
    # LCSP (149.2.a/b con n=1 ó 2) da un threshold bajo (25/20%) que choca con
    # un histórico alto. Pegamos al techo seguro y avisamos que el umbral
    # rígido es muy restrictivo.
    if media + 1.0 >= techo_seguro:
        sugerido = techo_seguro
        rango_max_v = techo_seguro
        rango_min_v = max(min(media - 2.0, rango_max_v - 1.0), 0.0)
        razonamiento = (
            f"La baja media histórica del órgano ({media:.1f}%) iguala o supera "
            f"el umbral temerario estimado ({threshold:.1f}%). En este caso la "
            "regla rígida LCSP es más restrictiva que el comportamiento real "
            f"del órgano. Sugerencia: pegarse al umbral con {margen_seguridad:.0f} pp "
            f"de margen ({sugerido:.1f}%) y preparar justificación de costes "
            "por si la mesa pide explicación."
        )
        return Recomendacion(
            rango_optimo_min_pct=round(rango_min_v, 2),
            rango_optimo_max_pct=round(rango_max_v, 2),
            pct_sugerido=round(sugerido, 2),
            razonamiento=razonamiento,
            confianza="baja",
        )

    # Lineal y cuadrática: cuanto más baja, más puntos → tirar al techo seguro
    # Proporcional inversa: idem (la mejor baja se lleva los puntos)
    if formula_tipo in ("lineal", "cuadratica", "proporcional_inversa"):
        rango_min = media + 1.0
        rango_max = techo_seguro
        sugerido = min((rango_min + rango_max) / 2.0, techo_seguro)
        razonamiento = (
            f"La baja media histórica del órgano es {media:.1f}%. "
            f"Para diferenciarte sin acercarte al umbral temerario "
            f"({threshold:.1f}%) busca un rango {rango_min:.1f}–{rango_max:.1f}% "
            "según tu margen. La fórmula del PCAP premia bajas mayores."
        )
    else:
        # Sin fórmula clara: rango conservador en torno a la media, todo
        # clampado bajo el techo seguro.
        rango_min = max(media - 1.0, 0.0)
        rango_max = min(media + 3.0, techo_seguro)
        sugerido = min(media + 1.5, rango_max)
        razonamiento = (
            f"Fórmula no detectada con claridad. Histórico del órgano: "
            f"{media:.1f}% baja media. Recomendamos un rango cercano "
            f"({rango_min:.1f}–{rango_max:.1f}%) que se diferencie "
            "ligeramente de la media sin pasarse."
        )

    return Recomendacion(
        rango_optimo_min_pct=round(rango_min, 2),
        rango_optimo_max_pct=round(rango_max, 2),
        pct_sugerido=round(sugerido, 2),
        razonamiento=razonamiento,
        confianza=confianza_final,
    )


def to_float(v: Decimal | float | int | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
