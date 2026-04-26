"""Catálogo CPV → ROLECE y helpers para el semáforo del Radar.

Este módulo encapsula tres piezas puras (sin BD, sin I/O) que el evaluador
de solvencia y el worker usan para clasificar licitaciones:

  1. ``CPV_PREFIX_TO_GRUPOS``  — mapeo prefijo CPV (4 dígitos) → grupos ROLECE
     exigibles. Operamos a nivel de GRUPO (A–K), no de subgrupo.
  2. ``extraer_grupos_exigidos(cpv_codes)`` — unión de grupos exigidos por la
     lista de códigos CPV de una licitación.
  3. ``parsear_anualidad(importe, durada_text)`` — convierte importe total y
     duración (texto en catalán/castellano) en anualidad media para deducir
     la categoría ROLECE exigida (RD 1098/2001 art. 26).

La granularidad de "grupo único" es deliberada: cubre el 95 % de los casos
con margen para refinar a subgrupo más adelante sin reescribir consumidores.
"""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Final

# ---------------------------------------------------------------------------
# Catálogo de grupos ROLECE
# ---------------------------------------------------------------------------

GRUPOS_ROLECE: Final[tuple[str, ...]] = (
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K",
)

GRUPO_NOMBRE: Final[dict[str, str]] = {
    "A": "Movimiento de tierras y perforaciones",
    "B": "Puentes, viaductos y grandes estructuras",
    "C": "Edificaciones",
    "D": "Ferroviarias",
    "E": "Hidráulicas",
    "F": "Marítimas",
    "G": "Viales y pistas",
    "H": "Transportes de productos petrolíferos y gaseosos",
    "I": "Instalaciones eléctricas",
    "J": "Instalaciones mecánicas",
    "K": "Especiales",
}

# ---------------------------------------------------------------------------
# Mapeo CPV (prefijo de 4 dígitos) → grupos ROLECE exigibles
#
# Si un CPV mapea a varios grupos, basta tener cualquiera para encajar.
# Cobertura: familia 45* (construcción) — el dataset Socrata de obras tiene
# 100 % de los CPV en esta familia. Mantener mapeo explícito y comentado;
# añadir entradas nuevas según aparezcan datos no cubiertos (fallarán a GRIS
# limpiamente sin romper nada).
# ---------------------------------------------------------------------------

CPV_PREFIX_TO_GRUPOS: Final[dict[str, list[str]]] = {
    # 4500 — Trabajos de construcción genéricos: matchea cualquier grupo
    "4500": list(GRUPOS_ROLECE),

    # 4510-4513 — Preparación del terreno (demoliciones, excavaciones, sondeos)
    "4510": ["A"],
    "4511": ["A", "C"],   # 45111 demoliciones también afecta a C1
    "4512": ["A", "K"],   # 45120 sondeos / pruebas
    "4513": ["A"],

    # 4520-4527 — Construcción / ingeniería civil
    "4520": ["B", "C"],                # genérico estructuras
    "4521": ["C"],                     # edificios (residenciales, ocio, comerciales, sanitarios, educativos…)
    "4522": ["A", "B", "C", "E"],      # estructuras + obra civil excepto puentes
    "4523": ["G", "D", "C"],           # carreteras (G) + ferroviarias (D) + pavimentaciones (C6)
    "4524": ["F", "E"],                # marítimas + hidráulicas (defensa, dragado, presas)
    "4525": ["C", "I", "J", "K"],      # plantas industriales / minería
    "4526": ["C", "K"],                # cubiertas, fachadas, especializados (pilotes, tablestacados)
    "4527": ["C"],                     # otros edificación

    # 4530-4534 — Trabajos de instalación
    "4530": ["I", "J"],   # genérico instalaciones
    "4531": ["I"],        # eléctricas (cableado, alumbrado, telecomunicaciones)
    "4532": ["C", "K"],   # aislamientos (térmico, acústico)
    "4533": ["J", "E"],   # fontanería, calefacción, climatización, refrigeración
    "4534": ["C", "J"],   # cierre, barandillas, alarmas, contraincendios

    # 4540-4545 — Acabados de edificios
    "4540": ["C"],
    "4541": ["C"],        # yeseros (C4)
    "4542": ["C"],        # carpintería (C8/C9)
    "4543": ["C"],        # pavimentos y revestimientos (C6)
    "4544": ["C", "K"],   # pintura y acristalamiento (K4)
    "4545": ["C", "K"],   # otros acabados
}

# ---------------------------------------------------------------------------
# Categorías ROLECE por anualidad — RD 1098/2001 art. 26 + LCSP 2017
# ---------------------------------------------------------------------------

# Tope superior INCLUSIVE de cada categoría. None = sin tope (cat 6).
CATEGORIA_TOPES: Final[list[tuple[int, Decimal | None]]] = [
    (1, Decimal("150000")),
    (2, Decimal("360000")),
    (3, Decimal("840000")),
    (4, Decimal("2400000")),
    (5, Decimal("5000000")),
    (6, None),
]

CATEGORIA_RANGO_TEXTO: Final[dict[int, str]] = {
    1: "hasta 150 000 €",
    2: "150 000–360 000 €",
    3: "360 000–840 000 €",
    4: "840 000–2,4 M€",
    5: "2,4 M€–5 M€",
    6: "más de 5 M€",
}


def categoria_por_anualidad(anualidad: Decimal | None) -> int | None:
    """Devuelve la categoría ROLECE (1-6) exigida para una anualidad dada.

    Devuelve None si la anualidad es None o negativa (no se puede deducir).
    """
    if anualidad is None or anualidad < 0:
        return None
    for cat, tope in CATEGORIA_TOPES:
        if tope is None or anualidad <= tope:
            return cat
    return 6  # unreachable — la última entrada tiene tope=None


# ---------------------------------------------------------------------------
# Parseo de duración del contrato
#
# Formatos vistos en datos reales del dataset Socrata (catalán):
#   "2 anys" / "1 any" / "6 mesos" / "1 mes"
#   "1 any 6 mesos" / "4 anys 0 mesos 0 dies" / "2 mesos 15 dies"
#   "29 dies" / "10 anys"
#   Casos no parseables: "01/07/2026 a 31/12/2026" (rango de fechas)
# ---------------------------------------------------------------------------

_DURADA_PART_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*"
    r"(any|anys|año|años|year|years|"
    r"mes|mesos|meses|month|months|"
    r"setm|setmana|setmanes|semana|semanas|week|weeks|"
    r"dia|dias|dies|día|días|day|days)\b",
    re.IGNORECASE,
)


def parsear_durada_anys(durada_text: str | None) -> Decimal | None:
    """Convierte texto de duración a años decimales.

    Suma todos los componentes detectados (años + meses + días + semanas).
    Devuelve None si no se reconoce ninguna unidad — el caller debe aplicar
    su propio fallback.
    """
    if not durada_text:
        return None

    total = Decimal(0)
    for num_str, unit in _DURADA_PART_RE.findall(durada_text):
        try:
            num = Decimal(num_str.replace(",", "."))
        except Exception:
            continue
        if num <= 0:
            continue
        u = unit.lower()
        if u.startswith(("any", "año", "year")):
            total += num
        elif u.startswith(("mes", "month")):
            total += num / Decimal(12)
        elif u.startswith(("setm", "semana", "week")):
            total += num / Decimal("52")
        elif u.startswith(("dia", "día", "day", "dies")):
            total += num / Decimal("365")

    return total if total > 0 else None


def parsear_anualidad(
    importe: Decimal | None,
    durada_text: str | None,
) -> tuple[Decimal | None, bool]:
    """Calcula la anualidad media a partir del importe y la duración.

    Política aplicada:
      - Si no hay importe → (None, False).
      - Si la duración no se puede parsear → fallback 1 año, devuelve
        (importe, True). El flag permite al caller medir la proporción
        de fallbacks (logging).
      - Si la duración es < 1 año → cap inferior de 1 año. Evita
        anualidades inflacionarias en contratos cortos (un contrato de
        100 K€ en 29 días NO debe exigir cat 6 — la anualidad media
        legal se piensa para contratos plurianuales).
    """
    if importe is None:
        return None, False

    anys = parsear_durada_anys(durada_text)
    if anys is None or anys <= 0:
        return importe, True  # fallback: asumir 1 año

    anys_efectivos = anys if anys >= Decimal(1) else Decimal(1)
    return importe / anys_efectivos, False


# ---------------------------------------------------------------------------
# Match CPV → grupos exigidos
# ---------------------------------------------------------------------------


def extraer_grupos_exigidos(cpv_codes: list[str] | None) -> set[str]:
    """Unión de grupos ROLECE exigidos por una lista de CPVs.

    Match por prefijo de los primeros 4 dígitos (ignorando guiones y dígito
    verificador). Soporta también valores compuestos del dataset Socrata
    en los que dos CPVs vienen pegados con el separador ``||``
    (p. ej. ``"45310000-3||4526"`` — mismo formato que ``codi_nuts``).
    Si ningún CPV mapea, devuelve set vacío — el caller decide el
    comportamiento (típicamente GRIS = "no se puede clasificar").
    """
    if not cpv_codes:
        return set()
    grupos: set[str] = set()
    for raw in cpv_codes:
        if not raw:
            continue
        for cpv in raw.split("||"):
            prefix = cpv.replace("-", "").strip()[:4]
            for g in CPV_PREFIX_TO_GRUPOS.get(prefix, ()):
                grupos.add(g)
    return grupos
