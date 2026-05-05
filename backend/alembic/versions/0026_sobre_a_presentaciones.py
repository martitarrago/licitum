"""sobre_a_presentaciones — archivo del Sobre A firmado y presentado al portal

Tabla nueva. Una fila por (empresa, licitación) — el usuario sube UNA vez
el PDF que envió al portal y queda como prueba histórica. Si re-sube,
sustituye al anterior (el R2 antiguo se borra). El estado del pipeline
(LicitacionEstadoEmpresa) pasa automáticamente a `presentada` al subir y
vuelve a `en_preparacion` al borrar.

Revision ID: 0026_sobre_a_presentaciones
Revises: 0025_licitacion_favorita
Create Date: 2026-05-05

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026_sobre_a_presentaciones"
down_revision: Union[str, None] = "0025_licitacion_favorita"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sobre_a_presentaciones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("licitacion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("archivo_url", sa.Text, nullable=False),
        sa.Column("archivo_filename", sa.String(512), nullable=False),
        sa.Column("subido_at", sa.DateTime(timezone=True), nullable=False),
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
            name="uq_sobre_a_presentaciones_pareja",
        ),
    )
    op.create_index(
        "ix_sobre_a_presentaciones_empresa_id",
        "sobre_a_presentaciones",
        ["empresa_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_sobre_a_presentaciones_empresa_id",
        "sobre_a_presentaciones",
    )
    op.drop_table("sobre_a_presentaciones")
