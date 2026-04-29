"""empresas: añadir direccion_provincia_codigo (INE 2 dígitos)

Hoy `direccion_provincia` es texto libre, y el motor de scoring (`empresa_context.py`)
hace match contra un mapa hardcodeado en UPPERCASE. Resultado: si el usuario
escribe "Barcelona" o "Bcn", la señal geográfica colapsa a 0.5 silenciosamente.

Esta migración añade `direccion_provincia_codigo` (varchar(2), nullable) con
los códigos INE estándar — el mismo formato que ya usan
`empresa_preferencias_territorio.provincia_codigo` y los datos de licitación.

Backfill: se rellena el código a partir del texto existente cuando coincide con
el nombre canónico. Lo demás queda NULL — el usuario tendrá que repickar desde
el dropdown nuevo.

Revision ID: 0022_empresa_provincia_codigo
Revises: 0021_mviews_dir3
Create Date: 2026-04-29

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0022_empresa_provincia_codigo"
down_revision: Union[str, None] = "0021_mviews_dir3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Códigos INE — mismo orden que `frontend/src/lib/api/preferencias.ts:PROVINCIAS`
_BACKFILL_MAP: dict[str, str] = {
    "ALAVA": "01", "ÁLAVA": "01",
    "ALBACETE": "02",
    "ALICANTE": "03",
    "ALMERIA": "04", "ALMERÍA": "04",
    "AVILA": "05", "ÁVILA": "05",
    "BADAJOZ": "06",
    "BALEARES": "07", "ILLES BALEARS": "07",
    "BARCELONA": "08", "BCN": "08",
    "BURGOS": "09",
    "CACERES": "10", "CÁCERES": "10",
    "CADIZ": "11", "CÁDIZ": "11",
    "CASTELLON": "12", "CASTELLÓN": "12",
    "CIUDAD REAL": "13",
    "CORDOBA": "14", "CÓRDOBA": "14",
    "A CORUÑA": "15", "LA CORUÑA": "15", "CORUÑA": "15",
    "CUENCA": "16",
    "GIRONA": "17", "GERONA": "17",
    "GRANADA": "18",
    "GUADALAJARA": "19",
    "GUIPUZCOA": "20", "GUIPÚZCOA": "20", "GIPUZKOA": "20",
    "HUELVA": "21",
    "HUESCA": "22",
    "JAEN": "23", "JAÉN": "23",
    "LEON": "24", "LEÓN": "24",
    "LLEIDA": "25", "LERIDA": "25", "LÉRIDA": "25",
    "LA RIOJA": "26", "RIOJA": "26",
    "LUGO": "27",
    "MADRID": "28",
    "MALAGA": "29", "MÁLAGA": "29",
    "MURCIA": "30",
    "NAVARRA": "31",
    "OURENSE": "32", "ORENSE": "32",
    "ASTURIAS": "33",
    "PALENCIA": "34",
    "LAS PALMAS": "35",
    "PONTEVEDRA": "36",
    "SALAMANCA": "37",
    "SANTA CRUZ DE TENERIFE": "38", "TENERIFE": "38",
    "CANTABRIA": "39",
    "SEGOVIA": "40",
    "SEVILLA": "41",
    "SORIA": "42",
    "TARRAGONA": "43",
    "TERUEL": "44",
    "TOLEDO": "45",
    "VALENCIA": "46",
    "VALLADOLID": "47",
    "VIZCAYA": "48", "BIZKAIA": "48",
    "ZAMORA": "49",
    "ZARAGOZA": "50",
    "CEUTA": "51",
    "MELILLA": "52",
}


def upgrade() -> None:
    op.add_column(
        "empresas",
        sa.Column("direccion_provincia_codigo", sa.String(2), nullable=True),
    )

    # Backfill desde el texto libre
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            "SELECT id, direccion_provincia FROM empresas "
            "WHERE direccion_provincia IS NOT NULL AND deleted_at IS NULL"
        )
    ).fetchall()
    for row in rows:
        normalized = (row.direccion_provincia or "").strip().upper()
        codigo = _BACKFILL_MAP.get(normalized)
        if codigo is None:
            continue
        bind.execute(
            sa.text(
                "UPDATE empresas SET direccion_provincia_codigo = :c WHERE id = :id"
            ),
            {"c": codigo, "id": row.id},
        )


def downgrade() -> None:
    op.drop_column("empresas", "direccion_provincia_codigo")
