"""Parsers para campos PSCP no triviales (importes con `||`, fechas).

PSCP devuelve algunos campos como TEXT incluso cuando son numéricos,
por la convención de concatenación multi-lote con `||`.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any


def parse_first_amount(raw: Any) -> Decimal | None:
    """Parsea el primer importe de un campo PSCP estilo `1234.56||789.10`.

    Devuelve None si no es parseable. Tolera coma decimal y espacios.
    """
    if raw is None:
        return None
    s = str(raw).split("||")[0].strip()
    if not s:
        return None
    s = s.replace(" ", "").replace(",", ".")
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def parse_decimal(raw: Any) -> Decimal | None:
    """Parsea un campo numérico simple a Decimal."""
    if raw is None:
        return None
    if isinstance(raw, (int, float, Decimal)):
        return Decimal(str(raw))
    s = str(raw).strip().replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def parse_int(raw: Any) -> int | None:
    """Parsea un campo entero. Tolera '5.0' como 5."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    try:
        return int(float(str(raw).strip()))
    except (ValueError, TypeError):
        return None


def parse_datetime(raw: Any) -> datetime | None:
    """Parsea un timestamp ISO 8601 de Socrata (`2026-04-28T12:34:56.000`)."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    # Socrata devuelve sin tz; tratamos como UTC naive por consistencia con la BBDD timezone-aware
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def parse_bool_si_no(raw: Any) -> bool | None:
    """PSCP usa 'Sí'/'No' para `es_agregada`."""
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if s in ("sí", "si", "yes", "true", "1"):
        return True
    if s in ("no", "false", "0"):
        return False
    return None
