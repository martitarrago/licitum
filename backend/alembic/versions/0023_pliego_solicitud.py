"""licitacion_analisis_solicitud: registro empresa↔licitación

El análisis IA del pliego es global (cache en `licitacion_analisis_ia`,
PK = licitacion_id). Pero la UI de "/pliegos analizados" debe filtrar por
empresa: cada empresa solo ve los pliegos en cuyo análisis ella ha
intervenido (botón manual del usuario o encolación automática del cron).

Sin esta tabla la lista mostraba el cache global completo a cualquier
empresa, exponiendo análisis encolados por otras empresas.

Backfill: por cada licitación con análisis `completado` y al menos un
score viable (`licitacion_score_empresa.score >= 50`) para una empresa,
inserta una solicitud con `origen='cron'` (asumimos que el dispatcher
es lo que lo procesó). El botón manual NO tenía registro previo, así
que algunos backfills serán falsos positivos — aceptable para que las
empresas no vean su listado vacío justo después del deploy.

Revision ID: 0023_pliego_solicitud
Revises: 0022_empresa_provincia_codigo
Create Date: 2026-05-04

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0023_pliego_solicitud"
down_revision: Union[str, None] = "0022_empresa_provincia_codigo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "licitacion_analisis_solicitud",
        sa.Column(
            "empresa_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("empresas.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "licitacion_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("licitaciones.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("origen", sa.String(16), nullable=False),
        sa.Column(
            "solicitado_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )
    op.create_index(
        "ix_pliego_solicitud_empresa",
        "licitacion_analisis_solicitud",
        ["empresa_id"],
    )

    # Backfill: por cada (empresa, licitación) con análisis completado y
    # score viable (>= 50), insertar solicitud con origen='cron'.
    op.execute(
        """
        INSERT INTO licitacion_analisis_solicitud (empresa_id, licitacion_id, origen, solicitado_at)
        SELECT lse.empresa_id, lai.licitacion_id, 'cron', COALESCE(lai.procesado_at, lai.created_at)
        FROM licitacion_analisis_ia lai
        JOIN licitacion_score_empresa lse ON lse.licitacion_id = lai.licitacion_id
        WHERE lai.estado = 'completado'
          AND lse.score >= 50
          AND lse.descartada = false
        ON CONFLICT (empresa_id, licitacion_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_pliego_solicitud_empresa", table_name="licitacion_analisis_solicitud")
    op.drop_table("licitacion_analisis_solicitud")
