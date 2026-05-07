"""user_empresa — vínculo entre auth.users (Supabase) y empresas

Tabla intermedia que liga el `auth.users.id` (UUID generado por Supabase Auth)
con la `empresas.id` que vive en el schema público. No se declara FK contra
`auth.users` porque está en otro schema gestionado por Supabase y la tabla
puede no existir durante migraciones de tests; la integridad la garantiza el
flujo de seed/admin.

Revision ID: 0028_user_empresa
Revises: 0027_oferta_economica
Create Date: 2026-05-07
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0028_user_empresa"
down_revision: Union[str, None] = "0027_oferta_economica"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_empresa",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rol", sa.String(32), nullable=False, server_default="admin"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("user_id"),
        sa.ForeignKeyConstraint(
            ["empresa_id"], ["empresas.id"], ondelete="CASCADE"
        ),
    )
    op.create_index(
        "ix_user_empresa_empresa_id",
        "user_empresa",
        ["empresa_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_empresa_empresa_id", "user_empresa")
    op.drop_table("user_empresa")
