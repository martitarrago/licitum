"""certificados_obra: pdf_url nullable para entrada manual

Revision ID: 0006_pdf_url_nullable
Revises: 0005_nuevos_campos_m3
Create Date: 2026-04-24

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006_pdf_url_nullable"
down_revision: Union[str, None] = "0005_nuevos_campos_m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("certificados_obra", "pdf_url", nullable=True)


def downgrade() -> None:
    # Rellena vacíos antes de volver a NOT NULL
    op.execute("UPDATE certificados_obra SET pdf_url = '' WHERE pdf_url IS NULL")
    op.alter_column("certificados_obra", "pdf_url", nullable=False)
