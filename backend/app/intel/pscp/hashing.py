"""content_hash sobre campos clave para detectar cambios reales.

Spec: docs/data-science/architecture.md sección 5.3

PSCP republishes registros sin cambios reales (campos no clave, nombre cosmético
del órgano). Si re-procesamos basándonos en `last_seen_at`, gastamos refresh de
mviews y movemos `updated_at` por nada.

Solución: hash determinístico sobre los campos que sí afectan al modelo. Si el
hash no cambia entre ediciones, no se actualiza `updated_at` — sólo `last_seen_at`.
"""
from __future__ import annotations

import hashlib
from typing import Any

# Campos que afectan al modelo. Si cualquiera cambia → considerar update real.
# NO incluye campos cosméticos (nom_organ, denominacio si solo cambia capitalización…)
KEY_FIELDS_FOR_HASH: tuple[str, ...] = (
    # Identidad
    "codi_expedient",
    "numero_lot",
    # Estado
    "fase_publicacio",
    "resultat",
    # Importes (afectan al cálculo de baja)
    "import_adjudicacio_sense",
    "pressupost_licitacio_sense",
    "pressupost_licitacio_sense_1",
    "valor_estimat_expedient",
    # Competencia
    "ofertes_rebudes",
    # Adjudicatario (cambio = nueva adjudicación o corrección)
    "identificacio_adjudicatari",
    # Fechas estructurales
    "data_publicacio_adjudicacio",
    "data_publicacio_formalitzacio",
    "data_adjudicacio_contracte",
    "data_formalitzacio_contracte",
    # Categorías (cambio raro pero relevante)
    "tipus_contracte",
    "procediment",
    "codi_cpv",
    "codi_organ",
)


def compute_content_hash(record: dict[str, Any]) -> str:
    """SHA-256 hex sobre los campos clave concatenados.

    Determinístico: misma entrada → mismo hash. Insensible al orden de
    keys del dict porque iteramos `KEY_FIELDS_FOR_HASH` explícitamente.
    """
    parts: list[str] = []
    for f in KEY_FIELDS_FOR_HASH:
        v = record.get(f)
        if v is None:
            parts.append("")
        else:
            parts.append(str(v).strip())
    canonical = "|".join(parts)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
