"""m3: campos de certificado opcionales al crear (se rellenan tras extracción)

Revision ID: 0004_campos_opcionales
Revises: 0003_add_extraction_error
Create Date: 2026-04-20

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_campos_opcionales"
down_revision: Union[str, None] = "0003_add_extraction_error"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("certificados_obra", "titulo", nullable=True)
    op.alter_column("certificados_obra", "organismo", nullable=True)
    op.alter_column("certificados_obra", "importe_adjudicacion", nullable=True)
    op.alter_column("certificados_obra", "fecha_inicio", nullable=True)
    op.alter_column("certificados_obra", "fecha_fin", nullable=True)
    op.alter_column("certificados_obra", "numero_expediente", nullable=True)


def downgrade() -> None:
    # Rellena nulls antes de volver a NOT NULL
    op.execute("UPDATE certificados_obra SET titulo = 'Sin título' WHERE titulo IS NULL")
    op.execute("UPDATE certificados_obra SET organismo = '' WHERE organismo IS NULL")
    op.execute("UPDATE certificados_obra SET importe_adjudicacion = 0 WHERE importe_adjudicacion IS NULL")
    op.execute("UPDATE certificados_obra SET fecha_inicio = NOW() WHERE fecha_inicio IS NULL")
    op.execute("UPDATE certificados_obra SET fecha_fin = NOW() WHERE fecha_fin IS NULL")
    op.execute("UPDATE certificados_obra SET numero_expediente = gen_random_uuid()::text WHERE numero_expediente IS NULL")
    op.alter_column("certificados_obra", "titulo", nullable=False)
    op.alter_column("certificados_obra", "organismo", nullable=False)
    op.alter_column("certificados_obra", "importe_adjudicacion", nullable=False)
    op.alter_column("certificados_obra", "fecha_inicio", nullable=False)
    op.alter_column("certificados_obra", "fecha_fin", nullable=False)
    op.alter_column("certificados_obra", "numero_expediente", nullable=False)
