"""Drop UNIQUE index on expedient_lot_key.

Bug detectado al primer backfill: PSCP publica múltiples filas por
(codi_expedient, numero_lot), una por fase de publicación (anuncio →
adjudicació → formalització). Cada fila tiene un socrata_row_id distinto
pero comparte expedient_lot_key.

El identificador único real es `socrata_row_id` (ya UNIQUE desde 0015).
Eliminamos el unique sobre expedient_lot_key — pasa a ser índice no-unique.

Las queries del modelo deduplican o agregan por expediente cuando lo
necesitan (típicamente filtrando por fase_publicacio = formalització o
escogiendo la fila más reciente por data_publicacio_*).

Revision ID: 0016_pscp_drop_unique
Revises: 0015_pscp_intel
Create Date: 2026-04-28

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0016_pscp_drop_unique"
down_revision: Union[str, None] = "0015_pscp_intel"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("uq_pscp_adj_expedient_lot", table_name="pscp_adjudicacion")
    op.create_index(
        "ix_pscp_adj_expedient_lot",
        "pscp_adjudicacion",
        ["expedient_lot_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_pscp_adj_expedient_lot", table_name="pscp_adjudicacion")
    op.create_index(
        "uq_pscp_adj_expedient_lot",
        "pscp_adjudicacion",
        ["expedient_lot_key"],
        unique=True,
    )
