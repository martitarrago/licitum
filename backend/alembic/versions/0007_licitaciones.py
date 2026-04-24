"""licitaciones: tabla M2 Radar IA

Revision ID: 0007_licitaciones
Revises: 0006_pdf_url_nullable
Create Date: 2026-04-24

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_licitaciones"
down_revision: Union[str, None] = "0006_pdf_url_nullable"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "licitaciones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expediente", sa.String(512), nullable=False),
        sa.Column("titulo", sa.Text, nullable=True),
        sa.Column("organismo", sa.String(512), nullable=True),
        sa.Column("organismo_id", sa.String(256), nullable=True),
        sa.Column("importe_licitacion", sa.Numeric(16, 2), nullable=True),
        sa.Column("importe_presupuesto_base", sa.Numeric(16, 2), nullable=True),
        sa.Column("fecha_publicacion", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fecha_limite", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "cpv_codes",
            postgresql.ARRAY(sa.String(16)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("tipo_contrato", sa.String(64), nullable=True),
        sa.Column("tipo_procedimiento", sa.String(64), nullable=True),
        sa.Column("clasificacion_requerida", sa.String(256), nullable=True),
        sa.Column("url_placsp", sa.String(1024), nullable=True),
        sa.Column("semaforo", sa.String(16), nullable=False, server_default="gris"),
        sa.Column("semaforo_razon", sa.Text, nullable=True),
        sa.Column(
            "raw_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("ingestado_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("expediente", name="uq_licitaciones_expediente"),
    )
    op.create_index("ix_licitaciones_expediente", "licitaciones", ["expediente"])
    op.create_index("ix_licitaciones_organismo_id", "licitaciones", ["organismo_id"])
    op.create_index("ix_licitaciones_semaforo", "licitaciones", ["semaforo"])


def downgrade() -> None:
    op.drop_index("ix_licitaciones_semaforo", "licitaciones")
    op.drop_index("ix_licitaciones_organismo_id", "licitaciones")
    op.drop_index("ix_licitaciones_expediente", "licitaciones")
    op.drop_table("licitaciones")
