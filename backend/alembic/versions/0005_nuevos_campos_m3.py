"""m3: tipo_documento, es_valido_solvencia, porcentaje_ute, contratista_principal

Revision ID: 0005_nuevos_campos_m3
Revises: 0004_campos_opcionales
Create Date: 2026-04-20

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_nuevos_campos_m3"
down_revision: Union[str, None] = "0004_campos_opcionales"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("certificados_obra", sa.Column("tipo_documento", sa.Text(), nullable=True))
    op.add_column("certificados_obra", sa.Column("es_valido_solvencia", sa.Boolean(), nullable=True))
    op.add_column("certificados_obra", sa.Column("razon_invalidez", sa.Text(), nullable=True))
    op.add_column("certificados_obra", sa.Column("porcentaje_ute", sa.Numeric(5, 2), nullable=True))
    op.add_column(
        "certificados_obra",
        sa.Column(
            "contratista_principal",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("certificados_obra", "contratista_principal")
    op.drop_column("certificados_obra", "porcentaje_ute")
    op.drop_column("certificados_obra", "razon_invalidez")
    op.drop_column("certificados_obra", "es_valido_solvencia")
    op.drop_column("certificados_obra", "tipo_documento")
