"""licitacion_score_empresa — score cacheado del motor de ganabilidad por empresa.

Calcular el score on-demand al renderizar el feed (1440 licitaciones × 5-7
queries por una) es inviable. Cacheamos en esta tabla el resultado de
score_licitacion(licitacion, empresa) y lo invalidamos cuando cambia la
licitación o cuando cambia el perfil M2 de la empresa (hash).

Spec: docs/data-science/architecture.md sección 7 + plan del Radar.

Revision ID: 0020_score_empresa
Revises: 0019_pscp_baja_bounds
Create Date: 2026-04-28

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_score_empresa"
down_revision: Union[str, None] = "0019_pscp_baja_bounds"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "licitacion_score_empresa",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("licitacion_id", postgresql.UUID(as_uuid=True), nullable=False),

        # Resultado del scoring
        sa.Column("score", sa.SmallInteger, nullable=False),  # 0-100
        sa.Column("confidence", sa.String(8), nullable=False),  # 'alta'|'media'|'baja'|'n/a'
        sa.Column(
            "descartada",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("reason_descarte", sa.Text, nullable=True),
        sa.Column("data_completeness_pct", sa.SmallInteger, nullable=False),

        # Breakdown serializado
        sa.Column(
            "breakdown_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column(
            "hard_filters_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),

        # Hash del perfil M2 que generó este score — invalida si cambia M2
        sa.Column("empresa_context_hash", sa.Text, nullable=False),

        # Auditoría
        sa.Column(
            "computed_at",
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
        sa.UniqueConstraint(
            "empresa_id", "licitacion_id", name="uq_score_empresa_licitacion"
        ),
        sa.ForeignKeyConstraint(
            ["empresa_id"], ["empresas.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["licitacion_id"], ["licitaciones.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "score >= 0 AND score <= 100", name="ck_score_range"
        ),
        sa.CheckConstraint(
            "data_completeness_pct >= 0 AND data_completeness_pct <= 100",
            name="ck_completeness_range",
        ),
        sa.CheckConstraint(
            "confidence IN ('alta', 'media', 'baja', 'n/a')",
            name="ck_confidence_enum",
        ),
    )

    # Sort principal del Radar: por score descendente, descartadas al final
    op.create_index(
        "ix_score_empresa_score_desc",
        "licitacion_score_empresa",
        ["empresa_id", sa.text("descartada"), sa.text("score DESC NULLS LAST")],
    )
    # Acceso por licitación (cuando un cambio invalida)
    op.create_index(
        "ix_score_licitacion_id",
        "licitacion_score_empresa",
        ["licitacion_id"],
    )
    # Para detectar scores stales por empresa (cambió M2)
    op.create_index(
        "ix_score_empresa_hash",
        "licitacion_score_empresa",
        ["empresa_id", "empresa_context_hash"],
    )


def downgrade() -> None:
    op.drop_index("ix_score_empresa_hash", "licitacion_score_empresa")
    op.drop_index("ix_score_licitacion_id", "licitacion_score_empresa")
    op.drop_index("ix_score_empresa_score_desc", "licitacion_score_empresa")
    op.drop_table("licitacion_score_empresa")
