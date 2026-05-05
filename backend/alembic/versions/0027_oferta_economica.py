"""oferta_economica_generaciones — versiones de la calculadora económica (M6)

Mismo patrón que sobre_a_generaciones: cada vez que el usuario "guarda
versión" de su oferta económica se persiste un snapshot completo (datos
de empresa, contexto del pliego, intel histórica del órgano, parámetros
del cálculo, resultado y HTML renderizado). El cálculo en vivo del
slider NO toca esta tabla — solo persiste lo que el usuario decide
guardar.

Revision ID: 0027_oferta_economica
Revises: 0026_sobre_a_presentaciones
Create Date: 2026-05-05

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0027_oferta_economica"
down_revision: Union[str, None] = "0026_sobre_a_presentaciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "oferta_economica_generaciones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("licitacion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expediente", sa.String(512), nullable=False),
        # Inputs del cálculo
        sa.Column("presupuesto_base", sa.Numeric(15, 2), nullable=False),
        sa.Column("baja_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("importe_ofertado", sa.Numeric(15, 2), nullable=False),
        # Análisis del riesgo temerario en el momento de guardar
        sa.Column("temeraria_threshold_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("entra_en_temeraria", sa.Boolean, nullable=False),
        # Snapshot completo (contexto pliego + intel + cálculo) para auditoría
        sa.Column(
            "datos_snapshot",
            postgresql.JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        # HTML renderizado del documento (igual patrón que sobre_a_generaciones)
        sa.Column("html", sa.Text, nullable=False),
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
        "ix_oferta_economica_empresa_id",
        "oferta_economica_generaciones",
        ["empresa_id"],
    )
    op.create_index(
        "ix_oferta_economica_licitacion_id",
        "oferta_economica_generaciones",
        ["licitacion_id"],
    )
    op.create_index(
        "ix_oferta_economica_created_at",
        "oferta_economica_generaciones",
        [sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_oferta_economica_created_at", "oferta_economica_generaciones")
    op.drop_index("ix_oferta_economica_licitacion_id", "oferta_economica_generaciones")
    op.drop_index("ix_oferta_economica_empresa_id", "oferta_economica_generaciones")
    op.drop_table("oferta_economica_generaciones")
