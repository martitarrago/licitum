"""Motor de cálculo de la oferta económica (M6 Calculadora).

Implementa las 4 fórmulas LCSP típicas para calcular puntos económicos
de una oferta dado:
  - presupuesto_base: importe sin IVA del PCAP
  - baja_pct: % de baja sobre el presupuesto base que oferta el licitador
  - puntos_max: puntos máximos asignados al criterio económico
  - parámetros específicos según fórmula (umbral saciedad, baja media, etc.)

`recomendar_baja` produce una recomendación con 3 puntos de referencia
(conservadora=mediana, competitiva=p90, saciedad si aplica) + el techo
legal. Decide el default por reglas multi-factor (peso del precio, n_obs,
fórmula, caso conflicto mediana>temeraria).
"""
from __future__ import annotations

import re
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

PuntoLabel = Literal["conservadora", "competitiva", "saciedad", "techo_legal"]
ThresholdFuente = Literal["pcap", "lcsp_149", "fallback"]

# Mínimo de observaciones para fiarnos de baja_p90 (si hay menos, p90 es
# ruido y caemos a mediana+buffer).
_MIN_N_OBS_P90_FIABLE = 10
# Margen de seguridad pp por debajo del threshold temerario.
_MARGEN_SEGURIDAD_PP = 2.0
# Umbral de peso del precio bajo el cual sugerimos siempre conservador
# (la memoria técnica decide).
_PESO_PRECIO_BAJO_PCT = 40.0


NivelRiesgo = Literal["seguro", "atencion", "temerario", "no_estimable"]


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
    nivel_riesgo: NivelRiesgo
    nota_riesgo: str

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if d.get("temeraria"):
            d["temeraria"] = asdict(self.temeraria)  # type: ignore[arg-type]
        return d


@dataclass(frozen=True)
class PuntoReferencia:
    label: PuntoLabel
    pct: float
    importe: float | None
    es_default: bool
    es_temerario: bool
    descripcion: str


@dataclass(frozen=True)
class Recomendacion:
    pct_sugerido: float | None
    pct_sugerido_label: PuntoLabel | None
    referencias: list[PuntoReferencia]
    techo_temerario_pct: float | None
    techo_temerario_fuente: ThresholdFuente | None
    peso_precio_pct: float | None
    razonamiento: str
    advertencias: list[str]
    confianza: Literal["alta", "media", "baja", "ninguna"]
    # Campos legacy mantenidos para compat con frontend hasta el PR del slider:
    rango_optimo_min_pct: float | None
    rango_optimo_max_pct: float | None


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
        baja_max_observada_pct = max(baja_pct, 1.0)

    if formula_tipo == "lineal":
        if baja_max_observada_pct <= 0:
            return 0.0
        ratio = min(1.0, max(0.0, baja_pct / baja_max_observada_pct))
        return round(puntos_max * ratio, 2)

    if formula_tipo == "proporcional_inversa":
        if baja_pct <= 0:
            return 0.0
        ratio = min(1.0, baja_pct / baja_max_observada_pct)
        return round(puntos_max * ratio, 2)

    if formula_tipo == "lineal_con_saciedad":
        umbral = umbral_saciedad_pct or baja_max_observada_pct
        if umbral <= 0:
            return puntos_max
        ratio = min(1.0, max(0.0, baja_pct / umbral))
        return round(puntos_max * ratio, 2)

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
    """Cálculo en vivo a partir de un % de baja."""
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

    temeraria: TemerariaEstimate | None = None
    threshold: float | None
    if temeraria_threshold_override is not None:
        threshold = float(temeraria_threshold_override)
    else:
        temeraria = estimar_baja_temeraria(
            ofertes_esperadas=ofertes_esperadas,
            baja_media_historica=baja_media_historica_pct,
        )
        threshold = temeraria.threshold_pct if temeraria is not None else None

    if threshold is None:
        # Sin base para estimar el umbral. No inventamos: marcamos como no
        # estimable y dejamos que el usuario lo valore con prudencia.
        nivel: NivelRiesgo = "no_estimable"
        entra_temeraria = False
        nota = (
            "No hay base para estimar el umbral temerario ex-ante (se necesita "
            "número esperado de ofertas o media histórica de bajas en el "
            "órgano). No podemos valorar el riesgo LCSP 149 hasta tener más "
            "datos."
        )
    else:
        entra_temeraria = baja_pct >= threshold
        margen = threshold - baja_pct
        if entra_temeraria:
            nivel = "temerario"
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


# ─── Threshold temerario desde el extracto del PCAP ──────────────────────────

# Patrones aceptados — sólo expresiones unívocas. Si la cláusula es ambigua
# preferimos None y dejar que LCSP/IA decidan, antes que inventar.
#   (a) "X% sobre el presupuesto"            → threshold absoluto = X
#   (b) "X puntos / pp / percentuales sobre la media" → threshold = media + X
#   (c) "media + X" / "mitjana + X"          → threshold = media + X
# DELIBERADAMENTE NO aceptamos "X% sobre la media" — ambiguo (puede ser
# pp o porcentaje del propio valor). Si el PCAP es claro lo dirá con "puntos".
_RE_PCT_SOBRE_PRESUPUESTO = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*%\s*(?:sobre|de|s/?)\s*(?:el\s+|la\s+|l['']?\s*)?"
    r"(?:presupost|pressupost|presupuesto|importe|licitaci[oó]n)",
    re.IGNORECASE,
)
_RE_PUNTOS_SOBRE_MEDIA = re.compile(
    r"(\d+(?:[.,]\d+)?)"
    r"\s*(?:p\.?p\.?|punt(?:o|os|s)?(?:\s+percentual(?:s|es)?)?|percentual(?:s|es)?)"
    r"[^.\n]{0,40}?(?:media|mitjana|mitja)",
    re.IGNORECASE,
)
_RE_MEDIA_MAS_X = re.compile(
    r"(?:media|mitjana|mitja)\s*\+\s*(\d+(?:[.,]\d+)?)",
    re.IGNORECASE,
)


def extraer_threshold_pcap(
    extracto: str | None,
    baja_media_historica: float | None,
) -> tuple[float, str] | None:
    """Intenta extraer un threshold temerario numérico del extracto del PCAP.

    Sólo devuelve un valor cuando el patrón es inequívoco. Para patrones
    relativos a la media requiere `baja_media_historica`. Si la cláusula es
    ambigua o no matchea, devuelve None y el motor cae a LCSP — preferimos
    silencio a un número fabricado.
    """
    if not extracto:
        return None
    s = str(extracto)

    m = _RE_PCT_SOBRE_PRESUPUESTO.search(s)
    if m:
        pct = float(m.group(1).replace(",", "."))
        if 0 < pct < 100:
            return pct, f"PCAP fija temeraria en {pct:.1f}% sobre presupuesto base"

    if baja_media_historica is not None:
        for regex in (_RE_PUNTOS_SOBRE_MEDIA, _RE_MEDIA_MAS_X):
            m = regex.search(s)
            if m:
                x = float(m.group(1).replace(",", "."))
                if 0 < x < 50:
                    threshold = round(baja_media_historica + x, 2)
                    return (
                        threshold,
                        f"PCAP fija temeraria en media + {x:.1f}pp "
                        f"(≈ {threshold:.1f}% con histórico actual)",
                    )

    return None


# ─── Recomendador con 3 referencias + reglas multi-factor ────────────────────


def _clamp(v: float, *, lo: float = 0.0, hi: float | None = None) -> float:
    if hi is not None:
        v = min(v, hi)
    return max(lo, v)


def _importe(presupuesto: float | None, pct: float) -> float | None:
    if presupuesto is None or presupuesto <= 0:
        return None
    return round(presupuesto * (1 - pct / 100.0), 2)


def _resolver_threshold(
    *,
    temeraria_threshold_override: float | None,
    baja_temeraria_pct: float | None,
    baja_temeraria_base: str | None,
    baja_temeraria_extracto: str | None,
    baja_media_historica_pct: float | None,
    ofertes_esperadas: float | None,
) -> tuple[
    float | None,
    ThresholdFuente | None,
    str | None,
    Literal["alta", "media", "baja"] | None,
]:
    """Devuelve (threshold, fuente, motivo, confianza) según prioridad:
    override → campo explícito IA → extracto regex → LCSP 149.2.

    Si ninguna fuente proporciona base sólida, devuelve (None, None, None, None).
    Nunca inventa un valor por defecto.
    """
    if temeraria_threshold_override is not None:
        return (
            float(temeraria_threshold_override),
            "pcap",
            f"Threshold definido manualmente: {temeraria_threshold_override:.1f}%",
            "alta",
        )

    # Campo numérico extraído por IA (Paso C). Sólo lo usamos si la base es
    # absoluta (sobre presupuesto). Para bases relativas (media) la IA no nos
    # da el pct directamente — caemos a la regex o LCSP.
    if (
        baja_temeraria_pct is not None
        and baja_temeraria_pct > 0
        and baja_temeraria_base == "presupuesto_base"
    ):
        return (
            float(baja_temeraria_pct),
            "pcap",
            (
                f"PCAP fija temeraria en {baja_temeraria_pct:.1f}% sobre "
                "presupuesto base (extracción IA)"
            ),
            "alta",
        )

    extraido = extraer_threshold_pcap(
        baja_temeraria_extracto, baja_media_historica_pct
    )
    if extraido is not None:
        threshold, motivo = extraido
        return threshold, "pcap", motivo, "alta"

    t = estimar_baja_temeraria(
        ofertes_esperadas=ofertes_esperadas,
        baja_media_historica=baja_media_historica_pct,
    )
    if t is None:
        return None, None, None, None
    return t.threshold_pct, "lcsp_149", t.metodo, t.confianza  # type: ignore[return-value]


def recomendar_baja(
    *,
    formula_tipo: str | None,
    baja_media_historica_pct: float | None,
    ofertes_esperadas: float | None,
    umbral_saciedad_pct: float | None = None,
    temeraria_threshold_override: float | None = None,
    baja_mediana_historica_pct: float | None = None,
    baja_p90_historica_pct: float | None = None,
    n_obs_historico: int | None = None,
    pct_criterios_objetivos: float | None = None,
    baja_temeraria_extracto: str | None = None,
    baja_temeraria_pct: float | None = None,
    baja_temeraria_base: str | None = None,
    presupuesto_base: float | None = None,
) -> Recomendacion:
    """Recomendación multi-referencia para la oferta económica.

    Devuelve una `Recomendacion` con:
      - 3 referencias (conservadora=mediana, competitiva=p90, saciedad
        si la fórmula la tiene, techo_legal)
      - default elegido por reglas multi-factor (peso del precio,
        n_obs, fórmula, caso conflicto mediana>temeraria)
      - razonamiento + lista de advertencias
      - threshold temerario con su fuente (pcap | lcsp_149 | fallback)

    Mantiene compat con campos legacy `rango_optimo_min_pct`/`rango_optimo_max_pct`
    para no romper el frontend antes del PR del slider con marks.
    """
    threshold, threshold_fuente, threshold_motivo, confianza_threshold = (
        _resolver_threshold(
            temeraria_threshold_override=temeraria_threshold_override,
            baja_temeraria_pct=baja_temeraria_pct,
            baja_temeraria_base=baja_temeraria_base,
            baja_temeraria_extracto=baja_temeraria_extracto,
            baja_media_historica_pct=baja_media_historica_pct,
            ofertes_esperadas=ofertes_esperadas,
        )
    )
    techo_seguro: float | None = (
        max(0.0, threshold - _MARGEN_SEGURIDAD_PP)
        if threshold is not None
        else None
    )

    advertencias: list[str] = []
    referencias: list[PuntoReferencia] = []

    # Anclas históricas — la mediana es la ancla; sin ella, no hay base
    # estadística. NO caemos al avg para disimular ausencia de datos.
    mediana = baja_mediana_historica_pct
    n_obs = n_obs_historico or 0
    p90_fiable = (
        baja_p90_historica_pct
        if baja_p90_historica_pct is not None and n_obs >= _MIN_N_OBS_P90_FIABLE
        else None
    )

    sin_historico = mediana is None
    tiene_saciedad = (
        umbral_saciedad_pct is not None and umbral_saciedad_pct > 0
    )

    # ── Caso especial: sin histórico ni saciedad ──────────────────────────
    if sin_historico and not tiene_saciedad:
        if threshold is not None and techo_seguro is not None:
            referencias.append(
                PuntoReferencia(
                    label="techo_legal",
                    pct=round(techo_seguro, 2),
                    importe=_importe(presupuesto_base, techo_seguro),
                    es_default=False,
                    es_temerario=False,
                    descripcion=(
                        f"Justo bajo el umbral temerario ({threshold:.1f}%). "
                        "Sólo elegir aquí con justificación de costes preparada."
                    ),
                )
            )
            razonamiento = (
                "Sin histórico del órgano y sin umbral de saciedad declarado. "
                "Decisión a criterio del licitador. El umbral temerario "
                f"estimado es {threshold:.1f}%."
            )
        else:
            razonamiento = (
                "Sin histórico del órgano, sin umbral de saciedad, y sin base "
                "para estimar el umbral temerario ex-ante (LCSP 149.2 requiere "
                "número esperado de ofertas o media histórica). Decisión a "
                "criterio del licitador."
            )
        return Recomendacion(
            pct_sugerido=None,
            pct_sugerido_label=None,
            referencias=referencias,
            techo_temerario_pct=(
                round(threshold, 2) if threshold is not None else None
            ),
            techo_temerario_fuente=threshold_fuente,
            peso_precio_pct=pct_criterios_objetivos,
            razonamiento=razonamiento,
            advertencias=advertencias,
            confianza="ninguna",
            rango_optimo_min_pct=None,
            rango_optimo_max_pct=None,
        )

    # ── Construir las referencias disponibles ─────────────────────────────
    # CONSERVADORA — sólo cuando tenemos mediana real.
    if mediana is not None:
        pct_cons = (
            _clamp(mediana, hi=techo_seguro)
            if techo_seguro is not None
            else mediana
        )
        es_temerario_cons = (
            techo_seguro is not None and mediana > techo_seguro
        )
        descripcion_cons = (
            f"Mediana histórica del órgano. El 50% de los adjudicatarios "
            f"ganaron con bajas iguales o menores."
        )
        if es_temerario_cons:
            descripcion_cons = (
                f"Mediana histórica ({mediana:.1f}%) supera el umbral temerario; "
                f"clampada a {pct_cons:.1f}%."
            )
        referencias.append(
            PuntoReferencia(
                label="conservadora",
                pct=round(pct_cons, 2),
                importe=_importe(presupuesto_base, pct_cons),
                es_default=False,
                es_temerario=es_temerario_cons,
                descripcion=descripcion_cons,
            )
        )

    # COMPETITIVA — sólo si tenemos P90 fiable. Sin él, no inventamos
    # mediana+2pp; preferimos no mostrar la referencia.
    if p90_fiable is not None:
        pct_comp_raw = p90_fiable
        pct_comp = (
            _clamp(pct_comp_raw, hi=techo_seguro)
            if techo_seguro is not None
            else pct_comp_raw
        )
        es_temerario_comp = (
            techo_seguro is not None and pct_comp_raw > techo_seguro
        )
        referencias.append(
            PuntoReferencia(
                label="competitiva",
                pct=round(pct_comp, 2),
                importe=_importe(presupuesto_base, pct_comp),
                es_default=False,
                es_temerario=es_temerario_comp,
                descripcion=(
                    "P90 histórico — sólo el 10% de adjudicatarios ganaron "
                    "con bajas mayores. Diferenciación sin entrar en temeraria."
                ),
            )
        )

    # SACIEDAD — si la fórmula lo declara.
    if tiene_saciedad:
        pct_sac_raw = float(umbral_saciedad_pct or 0)
        pct_sac = (
            _clamp(pct_sac_raw, hi=techo_seguro)
            if techo_seguro is not None
            else pct_sac_raw
        )
        es_temerario_sac = (
            techo_seguro is not None and pct_sac_raw > techo_seguro
        )
        descripcion_sac = (
            f"Umbral de saciedad del PCAP ({umbral_saciedad_pct:.1f}%). "
            "Por encima los puntos económicos no crecen."
        )
        if es_temerario_sac:
            descripcion_sac = (
                f"Umbral de saciedad ({umbral_saciedad_pct:.1f}%) supera el "
                f"techo temerario; clampado a {pct_sac:.1f}%."
            )
        referencias.append(
            PuntoReferencia(
                label="saciedad",
                pct=round(pct_sac, 2),
                importe=_importe(presupuesto_base, pct_sac),
                es_default=False,
                es_temerario=es_temerario_sac,
                descripcion=descripcion_sac,
            )
        )

    # TECHO LEGAL — sólo si conocemos el threshold.
    if threshold is not None and techo_seguro is not None:
        referencias.append(
            PuntoReferencia(
                label="techo_legal",
                pct=round(techo_seguro, 2),
                importe=_importe(presupuesto_base, techo_seguro),
                es_default=False,
                es_temerario=False,
                descripcion=(
                    f"Margen de seguridad ({_MARGEN_SEGURIDAD_PP:.0f} pp) "
                    f"bajo el umbral temerario ({threshold:.1f}%, "
                    f"{threshold_motivo})."
                ),
            )
        )

    # ── Elegir el default por reglas (en orden de prioridad) ──────────────
    default_label, motivo_default, confianza_rec = _elegir_default(
        formula_tipo=formula_tipo,
        mediana=mediana,
        techo_seguro=techo_seguro,
        threshold=threshold,
        n_obs=n_obs,
        p90_fiable=p90_fiable,
        peso_precio_pct=pct_criterios_objetivos,
        tiene_saciedad=tiene_saciedad,
        confianza_threshold=confianza_threshold,
        advertencias=advertencias,
    )

    # ── Marcar default y devolver ─────────────────────────────────────────
    referencias = [
        PuntoReferencia(
            label=r.label,
            pct=r.pct,
            importe=r.importe,
            es_default=(r.label == default_label),
            es_temerario=r.es_temerario,
            descripcion=r.descripcion,
        )
        for r in referencias
    ]
    default_ref = next(
        (r for r in referencias if r.label == default_label), None
    )
    pct_sugerido = default_ref.pct if default_ref else None

    razonamiento = _construir_razonamiento(
        default_label=default_label,
        default_ref=default_ref,
        motivo_default=motivo_default,
        threshold=threshold,
        threshold_fuente=threshold_fuente,
        peso_precio_pct=pct_criterios_objetivos,
    )

    # Compat legacy: rango_min = conservadora, rango_max = default.
    cons_ref = next((r for r in referencias if r.label == "conservadora"), None)
    rango_min = cons_ref.pct if cons_ref else None
    rango_max = pct_sugerido
    if rango_min is not None and rango_max is not None and rango_min > rango_max:
        rango_min, rango_max = rango_max, rango_min

    return Recomendacion(
        pct_sugerido=pct_sugerido,
        pct_sugerido_label=default_label,
        referencias=referencias,
        techo_temerario_pct=(
            round(threshold, 2) if threshold is not None else None
        ),
        techo_temerario_fuente=threshold_fuente,
        peso_precio_pct=pct_criterios_objetivos,
        razonamiento=razonamiento,
        advertencias=advertencias,
        confianza=confianza_rec,
        rango_optimo_min_pct=rango_min,
        rango_optimo_max_pct=rango_max,
    )


def _elegir_default(
    *,
    formula_tipo: str | None,
    mediana: float | None,
    techo_seguro: float | None,
    threshold: float | None,
    n_obs: int,
    p90_fiable: float | None,
    peso_precio_pct: float | None,
    tiene_saciedad: bool,
    confianza_threshold: Literal["alta", "media", "baja"] | None,
    advertencias: list[str],
) -> tuple[
    PuntoLabel | None,
    str,
    Literal["alta", "media", "baja", "ninguna"],
]:
    """Aplica la pirámide de reglas para elegir cuál de las referencias es la
    sugerencia por defecto. Devuelve (label, motivo, confianza). label=None si
    no podemos sugerir nada con honestidad (p.ej. la regla decide
    'conservadora' pero no tenemos mediana real)."""
    # 1) Caso patológico: mediana > techo_seguro. Sólo aplica si conocemos
    # ambos. Pegarse al techo y advertir.
    if (
        mediana is not None
        and techo_seguro is not None
        and threshold is not None
        and mediana > techo_seguro
    ):
        advertencias.append(
            f"La mediana histórica ({mediana:.1f}%) supera el umbral temerario "
            f"({threshold:.1f}%). El órgano adjudica habitualmente con bajas "
            "que LCSP considera anormales — los ganadores justifican costes "
            "según art. 149.4. Si llegas a este nivel, prepara justificación."
        )
        return (
            "techo_legal",
            "Mediana histórica supera el umbral temerario; pegarse al techo seguro",
            "baja",
        )

    # 2) Peso del precio bajo (memoria técnica decide) → conservador.
    if (
        peso_precio_pct is not None
        and peso_precio_pct < _PESO_PRECIO_BAJO_PCT
        and mediana is not None
    ):
        return (
            "conservadora",
            (
                f"El precio sólo pondera {peso_precio_pct:.0f}% del total — "
                "la memoria técnica decide la adjudicación, no merece la pena "
                "comprimir margen."
            ),
            _confianza_normal(confianza_threshold),
        )

    # 3) Histórico insuficiente — sólo si tenemos mediana y faltan obs
    # para confiar en p90.
    if (
        mediana is not None
        and n_obs < _MIN_N_OBS_P90_FIABLE
    ):
        return (
            "conservadora",
            f"Histórico limitado ({n_obs} adjudicaciones); ancla en la mediana.",
            "baja" if confianza_threshold == "baja" else "media",
        )

    # 4) Fórmula con saciedad declarada → óptimo es el umbral.
    if formula_tipo == "lineal_con_saciedad" and tiene_saciedad:
        return (
            "saciedad",
            (
                "Fórmula con umbral de saciedad: por encima los puntos no "
                "crecen, así que el óptimo es exactamente el umbral."
            ),
            _confianza_normal(confianza_threshold),
        )

    # 5) Fórmula que premia bajas + peso suficiente + p90 fiable → competitiva.
    # Si no tenemos p90 (n_obs<10), no inventamos; caemos a (6).
    if (
        formula_tipo in ("lineal", "cuadratica", "proporcional_inversa")
        and p90_fiable is not None
        and (
            peso_precio_pct is None
            or peso_precio_pct >= _PESO_PRECIO_BAJO_PCT
        )
    ):
        return (
            "competitiva",
            (
                "La fórmula premia bajas mayores y el precio pondera lo "
                "suficiente. El P90 supera al 90% de adjudicatarios sin "
                "entrar en temeraria."
            ),
            _confianza_normal(confianza_threshold),
        )

    # 6) Fallback: conservadora si tenemos mediana, si no, sin sugerencia.
    if mediana is not None:
        return (
            "conservadora",
            "Fórmula no estándar o caso no cubierto; ancla en lo que históricamente gana.",
            _confianza_normal(confianza_threshold),
        )

    return (
        None,
        "No hay base estadística suficiente para sugerir un punto sin inventar.",
        "ninguna",
    )


def _confianza_normal(
    confianza_threshold: Literal["alta", "media", "baja"] | None,
) -> Literal["alta", "media", "baja"]:
    if confianza_threshold is None:
        return "baja"
    return "alta" if confianza_threshold == "alta" else "media"


def _construir_razonamiento(
    *,
    default_label: PuntoLabel | None,
    default_ref: PuntoReferencia | None,
    motivo_default: str,
    threshold: float | None,
    threshold_fuente: ThresholdFuente | None,
    peso_precio_pct: float | None,
) -> str:
    if default_ref is None or default_label is None:
        return motivo_default

    ancla = (
        f"Sugerencia: {default_ref.pct:.1f}% ({_label_human(default_label)}). "
    )
    motivacion = motivo_default + " "
    contexto = ""
    if threshold is not None and threshold_fuente is not None:
        fuente_txt = {
            "pcap": "definido por el PCAP",
            "lcsp_149": "estimado por LCSP 149.2",
            "fallback": "fallback conservador (sin histórico)",
        }[threshold_fuente]
        contexto = f"Umbral temerario {fuente_txt} en {threshold:.1f}%. "
    else:
        contexto = "Umbral temerario no estimable ex-ante. "
    cierre = ""
    if peso_precio_pct is not None:
        cierre = f"Precio pondera {peso_precio_pct:.0f}%."

    return (ancla + motivacion + contexto + cierre).strip()


def _label_human(label: PuntoLabel) -> str:
    return {
        "conservadora": "anclada en la mediana",
        "competitiva": "anclada en el P90",
        "saciedad": "umbral de saciedad",
        "techo_legal": "techo seguro",
    }[label]


def to_float(v: Decimal | float | int | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
