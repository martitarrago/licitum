"""empresas_relic + clasificaciones_relic — M2 caja fuerte (RELIC Catalunya)

Crea las tablas para sincronizar empresas con RELIC (Registre Electrònic
d'Empreses Licitadores i Classificades de Catalunya). Source of truth:
Socrata dataset t3wj-j4pu en analisi.transparenciacatalunya.cat.

Diseño:
  - empresas_relic: 1:1 con empresas. Una empresa o tiene inscripción RELIC
    o no. n_registral es la clave de sincronización con Socrata.
  - clasificaciones_relic: N:1 con empresas_relic. Una fila por clasificación
    (sigles_cl). Se reemplazan en bloque en cada sync (delete + insert).

Revision ID: 0010_empresas_relic
Revises: 0009_score_afinidad
Create Date: 2026-04-27

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_empresas_relic"
down_revision: Union[str, None] = "0009_score_afinidad"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "empresas_relic",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("n_registral", sa.String(64), nullable=False),
        sa.Column("nom_empresa", sa.String(512), nullable=True),
        sa.Column(
            "prohibicio", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "prohibicio_data",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("data_actualitzacio", sa.Date, nullable=True),
        sa.Column(
            "ultima_sincronizacion", sa.DateTime(timezone=True), nullable=True
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
        sa.UniqueConstraint("empresa_id", name="uq_empresas_relic_empresa_id"),
        sa.UniqueConstraint("n_registral", name="uq_empresas_relic_n_registral"),
    )
    op.create_index(
        "ix_empresas_relic_n_registral", "empresas_relic", ["n_registral"]
    )

    op.create_table(
        "clasificaciones_relic",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "empresa_relic_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("tipus_cl", sa.String(16), nullable=False),
        sa.Column("sigles_cl", sa.String(8), nullable=False),
        sa.Column("grupo", sa.String(2), nullable=False),
        sa.Column("subgrupo", sa.String(2), nullable=True),
        sa.Column("categoria", sa.SmallInteger, nullable=True),
        sa.Column("subgrup_cl_text", sa.String(255), nullable=True),
        sa.Column("categoria_cl_text", sa.String(255), nullable=True),
        sa.Column(
            "suspensio", sa.Boolean, nullable=False, server_default=sa.text("false")
        ),
        sa.Column("data_atorgament", sa.Date, nullable=True),
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
            ["empresa_relic_id"],
            ["empresas_relic.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_clasificaciones_relic_empresa_relic_id",
        "clasificaciones_relic",
        ["empresa_relic_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_clasificaciones_relic_empresa_relic_id", "clasificaciones_relic"
    )
    op.drop_table("clasificaciones_relic")
    op.drop_index("ix_empresas_relic_n_registral", "empresas_relic")
    op.drop_table("empresas_relic")
