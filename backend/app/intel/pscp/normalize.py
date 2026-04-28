"""Normalización agresiva de CIFs/NIFs/NIEs españoles + UTE explode.

Spec: docs/data-science/architecture.md sección 3.2.1

PSCP no garantiza formato estándar — hemos visto prefijos VAT (ES, PT...),
espacios non-breaking, guiones, mayúsculas mixtas, errores tipográficos.
Sin normalización agresiva una misma empresa aparece como 3-4 CIFs
distintos rompiendo detección de feudos y cruce con RELIC.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

# Letras de control para CIF persona jurídica (E.31 AEAT)
_CIF_LETTERS = "JABCDEFGHI"
# Letras válidas para NIF/DNI persona física (módulo 23)
_NIF_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE"
# Tipo de NIF que SOLO admite letra como dígito de control (no número)
_CIF_LETTER_ONLY_TYPES = "PQSNW"
# Tipo de NIF que SOLO admite número como dígito de control
_CIF_DIGIT_ONLY_TYPES = "ABEH"

# Whitespace agresivo: incluye non-breaking, zero-width, etc.
_WHITESPACE_RE = re.compile(r"[\s ​‌‍⁠﻿]+")
_PUNCT_RE = re.compile(r"[.\-/_]+")
_COUNTRY_PREFIX_RE = re.compile(r"^(ES|PT|FR|DE|IT|GB|AD|BE|NL|LU|IE|AT|FI|SE|DK|PL)([A-Z0-9])")

_ANONIMIZED_RE = re.compile(r"^\*+\d+\*+$")
_CIF_PJ_RE = re.compile(r"^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$")
_NIF_PF_RE = re.compile(r"^\d{8}[A-Z]$")
_NIE_RE = re.compile(r"^[XYZ]\d{7}[A-Z]$")


@dataclass(frozen=True)
class NormalizedCif:
    """Resultado de normalizar un CIF/NIF crudo de PSCP."""

    cif: str
    nif_type: str | None
    is_persona_fisica: bool
    is_anonimizada: bool
    is_extranjera: bool
    checksum_valid: bool
    raw_seen: str


def _strip_aggressive(raw: str) -> str:
    """Strip whitespace agresivo + uppercase + sin puntuación."""
    s = _WHITESPACE_RE.sub("", raw)
    s = s.upper()
    s = _PUNCT_RE.sub("", s)
    return s


def _strip_country_prefix(s: str) -> str:
    """Quita prefijos VAT-style si el resto es un NIF español plausible."""
    m = _COUNTRY_PREFIX_RE.match(s)
    if m and len(s) > 9:
        return s[2:]
    return s


def _validate_nif_pf_checksum(nif: str) -> bool:
    """Valida módulo 23 sobre los 8 dígitos."""
    try:
        n = int(nif[:8])
        return _NIF_LETTERS[n % 23] == nif[8]
    except (ValueError, IndexError):
        return False


def _validate_nie_checksum(nie: str) -> bool:
    """NIE: X→0, Y→1, Z→2, luego módulo 23 igual que NIF."""
    try:
        prefix = "XYZ".index(nie[0])
        n = int(f"{prefix}{nie[1:8]}")
        return _NIF_LETTERS[n % 23] == nie[8]
    except (ValueError, IndexError):
        return False


def _validate_cif_pj_checksum(cif: str) -> bool:
    """Valida CIF persona jurídica (algoritmo E.31)."""
    try:
        digits = cif[1:8]
        control = cif[8]
        # Suma A: dígitos en posiciones pares (indices 1, 3, 5)
        sum_a = sum(int(digits[i]) for i in (1, 3, 5))
        # Suma B: dígitos en posiciones impares × 2, sumando dígitos del producto
        def double_and_sum(d: int) -> int:
            p = d * 2
            return p // 10 + p % 10
        sum_b = sum(double_and_sum(int(digits[i])) for i in (0, 2, 4, 6))
        total = sum_a + sum_b
        digit_control = (10 - total % 10) % 10
        letter_control = _CIF_LETTERS[digit_control]
        first = cif[0]
        if first in _CIF_LETTER_ONLY_TYPES:
            return control == letter_control
        if first in _CIF_DIGIT_ONLY_TYPES:
            return control == str(digit_control)
        # Resto: ambos válidos
        return control == str(digit_control) or control == letter_control
    except (ValueError, IndexError):
        return False


def normalize_cif(raw: str | None) -> NormalizedCif:
    """Normaliza un CIF/NIF/NIE crudo de PSCP a forma canónica.

    Returns NormalizedCif con `cif='__UNKNOWN__'` si el input es None/vacío
    o no encaja en ningún formato reconocible.
    """
    if not raw or not str(raw).strip():
        return NormalizedCif(
            cif="__UNKNOWN__",
            nif_type=None,
            is_persona_fisica=False,
            is_anonimizada=False,
            is_extranjera=False,
            checksum_valid=False,
            raw_seen=raw or "",
        )

    raw_str = str(raw)
    s = _strip_aggressive(raw_str)
    s = _strip_country_prefix(s)

    # Persona física anonimizada: ***1234**
    if _ANONIMIZED_RE.match(s):
        return NormalizedCif(
            cif=s,
            nif_type=None,
            is_persona_fisica=True,
            is_anonimizada=True,
            is_extranjera=False,
            checksum_valid=False,
            raw_seen=raw_str,
        )

    # CIF persona jurídica (8 dígitos + letra/dígito de control)
    if _CIF_PJ_RE.match(s):
        return NormalizedCif(
            cif=s,
            nif_type=s[0],
            is_persona_fisica=False,
            is_anonimizada=False,
            is_extranjera=False,
            checksum_valid=_validate_cif_pj_checksum(s),
            raw_seen=raw_str,
        )

    # NIF persona física (8 dígitos + letra)
    if _NIF_PF_RE.match(s):
        return NormalizedCif(
            cif=s,
            nif_type=None,
            is_persona_fisica=True,
            is_anonimizada=False,
            is_extranjera=False,
            checksum_valid=_validate_nif_pf_checksum(s),
            raw_seen=raw_str,
        )

    # NIE (X/Y/Z + 7 dígitos + letra)
    if _NIE_RE.match(s):
        return NormalizedCif(
            cif=s,
            nif_type=None,
            is_persona_fisica=True,
            is_anonimizada=False,
            is_extranjera=False,
            checksum_valid=_validate_nie_checksum(s),
            raw_seen=raw_str,
        )

    # Desconocido — extranjera o malformado
    return NormalizedCif(
        cif=s if s else "__UNKNOWN__",
        nif_type=None,
        is_persona_fisica=False,
        is_anonimizada=False,
        is_extranjera=True,
        checksum_valid=False,
        raw_seen=raw_str,
    )


def explode_ute(raw_cif: str | None, raw_denom: str | None) -> list[tuple[NormalizedCif, str | None]]:
    """Descompone el campo PSCP `identificacio_adjudicatari` en lista de empresas.

    PSCP concatena UTEs con '||' tanto en CIF como en denominación:
        cif:   "B50819507||B58903295||B60579240"
        denom: "EMPRESA UNO, SL||EMPRESA DOS, SL||EMPRESA TRES, SL"

    Devuelve lista de (NormalizedCif, denominacion_raw_para_esa_empresa).
    Si raw_cif es None/vacío devuelve lista vacía.
    Si denom tiene menos elementos que cif, el sobrante recibe denom=None.
    """
    if not raw_cif or not str(raw_cif).strip():
        return []
    cifs_raw = [c.strip() for c in str(raw_cif).split("||") if c.strip()]
    denoms_raw = [d.strip() for d in str(raw_denom or "").split("||")]
    result: list[tuple[NormalizedCif, str | None]] = []
    for i, c in enumerate(cifs_raw):
        denom = denoms_raw[i] if i < len(denoms_raw) and denoms_raw[i] else None
        result.append((normalize_cif(c), denom))
    return result
