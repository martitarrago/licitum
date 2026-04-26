"""m2: score_afinidad para ordenar licitaciones por relevancia historica

Anade columna `score_afinidad` a `licitaciones` (0.00-1.00). El evaluador
del semaforo la calcula cruzando organismo + CPV de la licitacion contra
el historial de certificados validados de la empresa (M3). El frontend
ordena las licitaciones por afinidad descendente dentro de cada nivel
de semaforo.

NULL = no calculada todavia (igual que las semaforo='gris' antiguas);
0.00 = calculada y sin coincidencia historica.

Revision ID: 0009_score_afinidad
Revises: 0008_licitaciones_filtros
Create Date: 2026-04-26

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_score_afinidad"
down_revision: Union[str, None] = "0008_licitaciones_filtros"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "licitaciones",
        sa.Column("score_afinidad", sa.Numeric(3, 2), nullable=True),
    )
    # Indice DESC con NULLS LAST: orden tipico del feed (mayor afinidad arriba,
    # las nuevas sin calcular al final). Postgres respeta nulls_last en index.
    op.execute(
        "CREATE INDEX ix_licitaciones_score_afinidad "
        "ON licitaciones (score_afinidad DESC NULLS LAST)"
    )


def downgrade() -> None:
    op.drop_index("ix_licitaciones_score_afinidad", "licitaciones")
    op.drop_column("licitaciones", "score_afinidad")
