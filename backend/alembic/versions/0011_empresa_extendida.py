"""empresa extendida + documentos_empresa — M2 datos básicos + caja fuerte de docs

Extiende `empresas` con datos del DEUC (dirección, representante, volumen
de negocio…) y crea `documentos_empresa` para certificados administrativos
con caducidad (Hacienda, Seguridad Social, pólizas, ISOs, REA, TC2).

Revision ID: 0011_empresa_extendida
Revises: 0010_empresas_relic
Create Date: 2026-04-27

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_empresa_extendida"
down_revision: Union[str, None] = "0010_empresas_relic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Extensión de `empresas` ─────────────────────────────────────────
    op.add_column("empresas", sa.Column("direccion_calle", sa.String(255), nullable=True))
    op.add_column(
        "empresas", sa.Column("direccion_codigo_postal", sa.String(16), nullable=True)
    )
    op.add_column("empresas", sa.Column("direccion_ciudad", sa.String(128), nullable=True))
    op.add_column("empresas", sa.Column("direccion_provincia", sa.String(64), nullable=True))
    op.add_column(
        "empresas",
        sa.Column(
            "direccion_pais",
            sa.String(64),
            nullable=True,
            server_default="ES",
        ),
    )
    op.add_column(
        "empresas", sa.Column("representante_nombre", sa.String(255), nullable=True)
    )
    op.add_column("empresas", sa.Column("representante_nif", sa.String(16), nullable=True))
    op.add_column(
        "empresas", sa.Column("representante_cargo", sa.String(128), nullable=True)
    )
    op.add_column("empresas", sa.Column("telefono", sa.String(32), nullable=True))
    op.add_column("empresas", sa.Column("iae", sa.String(16), nullable=True))
    op.add_column("empresas", sa.Column("cnae", sa.String(16), nullable=True))
    op.add_column("empresas", sa.Column("tamano_pyme", sa.String(16), nullable=True))
    op.add_column(
        "empresas", sa.Column("volumen_negocio_n", sa.Numeric(14, 2), nullable=True)
    )
    op.add_column(
        "empresas", sa.Column("volumen_negocio_n1", sa.Numeric(14, 2), nullable=True)
    )
    op.add_column(
        "empresas", sa.Column("volumen_negocio_n2", sa.Numeric(14, 2), nullable=True)
    )
    op.add_column("empresas", sa.Column("plantilla_media", sa.SmallInteger, nullable=True))

    # ── Documentos administrativos con caducidad ────────────────────────
    op.create_table(
        "documentos_empresa",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tipo", sa.String(32), nullable=False),
        sa.Column("titulo", sa.String(255), nullable=True),
        sa.Column("pdf_url", sa.String(1024), nullable=True),
        sa.Column("fecha_emision", sa.Date, nullable=True),
        sa.Column("fecha_caducidad", sa.Date, nullable=True),
        sa.Column("notas", sa.Text, nullable=True),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_documentos_empresa_empresa_id", "documentos_empresa", ["empresa_id"]
    )
    op.create_index(
        "ix_documentos_empresa_fecha_caducidad",
        "documentos_empresa",
        ["fecha_caducidad"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_documentos_empresa_fecha_caducidad", "documentos_empresa")
    op.drop_index("ix_documentos_empresa_empresa_id", "documentos_empresa")
    op.drop_table("documentos_empresa")
    for col in (
        "plantilla_media",
        "volumen_negocio_n2",
        "volumen_negocio_n1",
        "volumen_negocio_n",
        "tamano_pyme",
        "cnae",
        "iae",
        "telefono",
        "representante_cargo",
        "representante_nif",
        "representante_nombre",
        "direccion_pais",
        "direccion_provincia",
        "direccion_ciudad",
        "direccion_codigo_postal",
        "direccion_calle",
    ):
        op.drop_column("empresas", col)
