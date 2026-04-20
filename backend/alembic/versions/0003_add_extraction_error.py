"""m3: añade columna extraction_error

Revision ID: 0003_add_extraction_error
Revises: 0002_add_procesando
Create Date: 2026-04-20

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_add_extraction_error"
down_revision: Union[str, None] = "0002_add_procesando"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "certificados_obra",
        sa.Column("extraction_error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("certificados_obra", "extraction_error")
