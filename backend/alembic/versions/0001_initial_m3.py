"""m3: empresas, certificados_obra, clasificaciones_rolece

Revision ID: 0001_initial_m3
Revises:
Create Date: 2026-04-17

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial_m3"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    estado_certificado = postgresql.ENUM(
        "pendiente_revision",
        "validado",
        "rechazado",
        name="estado_certificado",
        create_type=False,
    )
    estado_certificado.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "empresas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("nombre", sa.String(255), nullable=False),
        sa.Column("cif", sa.String(16), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("cif", name="uq_empresas_cif"),
        sa.UniqueConstraint("email", name="uq_empresas_email"),
    )
    op.create_index("ix_empresas_cif", "empresas", ["cif"])
    op.create_index("ix_empresas_email", "empresas", ["email"])

    op.create_table(
        "certificados_obra",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "empresa_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("empresas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("titulo", sa.String(512), nullable=False),
        sa.Column("organismo", sa.String(255), nullable=False),
        sa.Column("importe_adjudicacion", sa.Numeric(14, 2), nullable=False),
        sa.Column("fecha_inicio", sa.Date(), nullable=False),
        sa.Column("fecha_fin", sa.Date(), nullable=False),
        sa.Column(
            "cpv_codes",
            postgresql.ARRAY(sa.String(16)),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("clasificacion_grupo", sa.String(8), nullable=True),
        sa.Column("clasificacion_subgrupo", sa.String(8), nullable=True),
        sa.Column("numero_expediente", sa.String(128), nullable=False),
        sa.Column(
            "estado",
            postgresql.ENUM(
                "pendiente_revision",
                "validado",
                "rechazado",
                name="estado_certificado",
                create_type=False,
            ),
            nullable=False,
            server_default="pendiente_revision",
        ),
        sa.Column("pdf_url", sa.String(1024), nullable=False),
        sa.Column(
            "extracted_data",
            postgresql.JSONB(),
            nullable=False,
            server_default="{}",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "numero_expediente", name="uq_certificados_obra_numero_expediente"
        ),
    )
    op.create_index(
        "ix_certificados_obra_empresa_id", "certificados_obra", ["empresa_id"]
    )
    op.create_index(
        "ix_certificados_obra_numero_expediente",
        "certificados_obra",
        ["numero_expediente"],
    )

    op.create_table(
        "clasificaciones_rolece",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "empresa_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("empresas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("grupo", sa.String(8), nullable=False),
        sa.Column("subgrupo", sa.String(8), nullable=False),
        sa.Column("categoria", sa.String(4), nullable=False),
        sa.Column("fecha_obtencion", sa.Date(), nullable=False),
        sa.Column("fecha_caducidad", sa.Date(), nullable=False),
        sa.Column(
            "activa",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "empresa_id",
            "grupo",
            "subgrupo",
            "categoria",
            name="uq_clasificacion_empresa_grupo_subgrupo_categoria",
        ),
    )
    op.create_index(
        "ix_clasificaciones_rolece_empresa_id",
        "clasificaciones_rolece",
        ["empresa_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_clasificaciones_rolece_empresa_id", table_name="clasificaciones_rolece"
    )
    op.drop_table("clasificaciones_rolece")
    op.drop_index(
        "ix_certificados_obra_numero_expediente", table_name="certificados_obra"
    )
    op.drop_index("ix_certificados_obra_empresa_id", table_name="certificados_obra")
    op.drop_table("certificados_obra")
    op.drop_index("ix_empresas_email", table_name="empresas")
    op.drop_index("ix_empresas_cif", table_name="empresas")
    op.drop_table("empresas")
    sa.Enum(name="estado_certificado").drop(op.get_bind(), checkfirst=True)
