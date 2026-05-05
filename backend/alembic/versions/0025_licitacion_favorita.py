"""licitacion_favorita_empresa — bandeja de favoritos del Radar

Tabla N:M entre empresa y licitación que marca interés explícito sin
implicar pipeline. La acción "añadir al seguimiento" del Radar se
sustituye por un toggle de favorito (corazón). El paso a pipeline ocurre
después, al pulsar "Preparar Sobre A" desde el análisis del pliego.

Revision ID: 0025_licitacion_favorita
Revises: 0024_unaccent
Create Date: 2026-05-05

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025_licitacion_favorita"
down_revision: Union[str, None] = "0024_unaccent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "licitacion_favorita_empresa",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("licitacion_id", postgresql.UUID(as_uuid=True), nullable=False),
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
            name="uq_licitacion_favorita_empresa_pareja",
        ),
    )
    op.create_index(
        "ix_licitacion_favorita_empresa_empresa_id",
        "licitacion_favorita_empresa",
        ["empresa_id"],
    )
    op.create_index(
        "ix_licitacion_favorita_empresa_licitacion_id",
        "licitacion_favorita_empresa",
        ["licitacion_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_licitacion_favorita_empresa_licitacion_id",
        "licitacion_favorita_empresa",
    )
    op.drop_index(
        "ix_licitacion_favorita_empresa_empresa_id",
        "licitacion_favorita_empresa",
    )
    op.drop_table("licitacion_favorita_empresa")
