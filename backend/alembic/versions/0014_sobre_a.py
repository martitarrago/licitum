"""sobre_a_generaciones — M4 Sobre A: histórico de DEUC + declaración responsable

Tabla de auditoría: una fila por cada Sobre A generado para una pareja
(empresa, licitación). Guarda snapshot de los datos al momento de la
generación + HTML renderizado, para poder consultar exactamente qué firmó
el cliente meses después.

Revision ID: 0014_sobre_a
Revises: 0013_tracker
Create Date: 2026-04-27

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_sobre_a"
down_revision: Union[str, None] = "0013_tracker"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sobre_a_generaciones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("licitacion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expediente", sa.String(512), nullable=False),
        sa.Column("html", sa.Text, nullable=False),
        sa.Column(
            "datos_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "usa_relic",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
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
    )
    op.create_index(
        "ix_sobre_a_empresa_id", "sobre_a_generaciones", ["empresa_id"]
    )
    op.create_index(
        "ix_sobre_a_created_at",
        "sobre_a_generaciones",
        [sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_sobre_a_created_at", "sobre_a_generaciones")
    op.drop_index("ix_sobre_a_empresa_id", "sobre_a_generaciones")
    op.drop_table("sobre_a_generaciones")
