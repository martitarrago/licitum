"""licitacion_estado_empresa — M6 Tracker (pipeline operativo)

Tabla N:M entre empresa y licitación con su estado en el ciclo público.
Optimización clave: solo se crea una fila cuando el usuario interactúa con
la licitación. Sin fila → estado implícito "ninguno" (la licitación está
en M1 pero no en el pipeline).

Estados modelados (10):
  en_preparacion → presentada → en_subsanacion (3d hábiles, reloj legal) →
  apertura_sobres → adjudicacion_provisional →
  documentacion_previa (10d hábiles, reloj legal) → adjudicada →
  formalizada → perdida → rechazada

Revision ID: 0013_tracker
Revises: 0012_pliego_analisis_ia
Create Date: 2026-04-27

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_tracker"
down_revision: Union[str, None] = "0012_pliego_analisis_ia"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "licitacion_estado_empresa",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("licitacion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("estado", sa.String(32), nullable=False),
        sa.Column("deadline_actual", sa.Date, nullable=True),
        sa.Column("nota", sa.Text, nullable=True),
        sa.Column(
            "estado_actualizado_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["empresa_id"], ["empresas.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["licitacion_id"], ["licitaciones.id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "empresa_id",
            "licitacion_id",
            name="uq_licitacion_estado_empresa_pareja",
        ),
    )
    op.create_index(
        "ix_licitacion_estado_empresa_empresa_id",
        "licitacion_estado_empresa",
        ["empresa_id"],
    )
    op.create_index(
        "ix_licitacion_estado_empresa_estado",
        "licitacion_estado_empresa",
        ["estado"],
    )
    op.create_index(
        "ix_licitacion_estado_empresa_deadline_actual",
        "licitacion_estado_empresa",
        ["deadline_actual"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_licitacion_estado_empresa_deadline_actual",
        "licitacion_estado_empresa",
    )
    op.drop_index(
        "ix_licitacion_estado_empresa_estado", "licitacion_estado_empresa"
    )
    op.drop_index(
        "ix_licitacion_estado_empresa_empresa_id", "licitacion_estado_empresa"
    )
    op.drop_table("licitacion_estado_empresa")
