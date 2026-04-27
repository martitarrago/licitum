"""licitacion_analisis_ia — M3 cache global del análisis IA del pliego

Almacena la extracción estructurada del PCAP (presupuesto, plazo, solvencia,
fórmula económica, baja temeraria, banderas rojas) por licitación. Cache GLOBAL:
una sola fila por `licitacion_id`. La recomendación ir/no ir se calcula
on-the-fly cruzando con datos de M2 — no se persiste.

Revision ID: 0012_pliego_analisis_ia
Revises: 0011_empresa_extendida
Create Date: 2026-04-27

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_pliego_analisis_ia"
down_revision: Union[str, None] = "0011_empresa_extendida"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE estado_analisis_pliego AS ENUM "
        "('pendiente', 'procesando', 'completado', 'fallido')"
    )
    op.create_table(
        "licitacion_analisis_ia",
        sa.Column("licitacion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pdf_url", sa.String(1024), nullable=True),
        sa.Column(
            "estado",
            postgresql.ENUM(
                "pendiente",
                "procesando",
                "completado",
                "fallido",
                name="estado_analisis_pliego",
                create_type=False,
            ),
            nullable=False,
            server_default="pendiente",
        ),
        sa.Column(
            "extracted_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("idioma_detectado", sa.String(8), nullable=True),
        sa.Column("confianza_global", sa.Numeric(3, 2), nullable=True),
        sa.Column("error_mensaje", sa.Text, nullable=True),
        sa.Column("procesado_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("licitacion_id"),
        sa.ForeignKeyConstraint(
            ["licitacion_id"],
            ["licitaciones.id"],
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("licitacion_analisis_ia")
    op.execute("DROP TYPE estado_analisis_pliego")
