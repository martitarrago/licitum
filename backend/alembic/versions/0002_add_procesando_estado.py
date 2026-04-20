"""m3: añade 'procesando' al enum estado_certificado

Revision ID: 0002_add_procesando
Revises: 0001_initial_m3
Create Date: 2026-04-17

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0002_add_procesando"
down_revision: Union[str, None] = "0001_initial_m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE estado_certificado "
        "ADD VALUE IF NOT EXISTS 'procesando' BEFORE 'validado'"
    )


def downgrade() -> None:
    # PostgreSQL no permite eliminar un valor de un ENUM sin recrear el tipo.
    # Revertir requiere un proceso destructivo: mover tabla, drop type,
    # crear type nuevo sin el valor, restaurar tabla. No lo automatizamos.
    pass
