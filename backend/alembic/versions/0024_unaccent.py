"""install unaccent extension for accent-insensitive search

Permite que el filtro `q` del Radar de licitaciones (y otros buscadores)
matchee "Sant Cugat" y "Sánt Cugat" como equivalentes, alineándose con
el comportamiento client-side ya implementado en /pliegos.

Revision ID: 0024_unaccent
Revises: 0023_pliego_solicitud
Create Date: 2026-05-04

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "0024_unaccent"
down_revision: Union[str, None] = "0023_pliego_solicitud"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")


def downgrade() -> None:
    # No tocamos la extensión en downgrade — puede ser usada por otros
    # objetos del esquema. Drop manual si realmente se quiere quitar.
    pass
