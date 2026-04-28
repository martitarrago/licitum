"""empresa recursos + preferencias — M2 ampliación para match + Sobre B

Crea las tablas y columnas que cierran el perfil de empresa según el
replanteamiento de M2 (ver docs/modules/M2-empresa.md):

- personal_empresa: técnicos adscribibles a obra (jefe obra, encargado,
  PRL, calidad, ingeniero, arquitecto). Alimenta el Sobre B.
- maquinaria_empresa: inventario operativo. Sobre B + match suave.
- sistemas_gestion_empresa: ISOs y planes propios con alcance descriptivo.
- empresa_preferencias (1:1) + empresa_preferencias_territorio (N) +
  empresa_preferencias_cpv (N): metadata declarativa que rankea el match
  (capacidad simultánea, presupuestos, UTE, comarcas, CPVs).
- empresas: columnas nuevas para datos del poder notarial (DEUC II.B) y
  CCC Seguridad Social.
- certificados_obra: marca destacado_sobre_b + narrativa para reuso en
  memoria técnica.

Revision ID: 0018_empresa_recursos
Revises: 0017_pscp_mviews
Create Date: 2026-04-28

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_empresa_recursos"
down_revision: Union[str, None] = "0017_pscp_mviews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Columnas nuevas en `empresas` ───────────────────────────────────
    op.add_column("empresas", sa.Column("poder_notario", sa.String(255), nullable=True))
    op.add_column("empresas", sa.Column("poder_fecha_escritura", sa.Date, nullable=True))
    op.add_column("empresas", sa.Column("poder_protocolo", sa.String(64), nullable=True))
    op.add_column(
        "empresas", sa.Column("poder_registro_mercantil", sa.String(255), nullable=True)
    )
    op.add_column(
        "empresas", sa.Column("ccc_seguridad_social", sa.String(32), nullable=True)
    )

    # ── Columnas nuevas en `certificados_obra` ──────────────────────────
    op.add_column(
        "certificados_obra",
        sa.Column(
            "destacado_sobre_b",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("certificados_obra", sa.Column("narrativa", sa.Text, nullable=True))

    # ── personal_empresa ────────────────────────────────────────────────
    op.create_table(
        "personal_empresa",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nombre_completo", sa.String(255), nullable=False),
        sa.Column("dni", sa.String(16), nullable=True),
        sa.Column("rol", sa.String(32), nullable=False),
        sa.Column("titulacion", sa.String(255), nullable=True),
        sa.Column("anios_experiencia", sa.SmallInteger, nullable=True),
        sa.Column("cv_pdf_url", sa.String(1024), nullable=True),
        sa.Column(
            "certificados_formacion",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "obras_participadas",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=True,
        ),
        sa.Column(
            "activo", sa.Boolean, nullable=False, server_default=sa.text("true")
        ),
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
        "ix_personal_empresa_empresa_id", "personal_empresa", ["empresa_id"]
    )

    # ── maquinaria_empresa ──────────────────────────────────────────────
    op.create_table(
        "maquinaria_empresa",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tipo", sa.String(64), nullable=False),
        sa.Column("marca", sa.String(128), nullable=True),
        sa.Column("modelo", sa.String(128), nullable=True),
        sa.Column("anio", sa.SmallInteger, nullable=True),
        sa.Column("matricula", sa.String(32), nullable=True),
        sa.Column(
            "propiedad",
            sa.String(32),
            nullable=False,
            server_default="propia",
        ),
        sa.Column("itv_caducidad", sa.Date, nullable=True),
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
        "ix_maquinaria_empresa_empresa_id", "maquinaria_empresa", ["empresa_id"]
    )

    # ── sistemas_gestion_empresa ────────────────────────────────────────
    op.create_table(
        "sistemas_gestion_empresa",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tipo", sa.String(32), nullable=False),
        sa.Column("pdf_url", sa.String(1024), nullable=True),
        sa.Column("fecha_emision", sa.Date, nullable=True),
        sa.Column("fecha_caducidad", sa.Date, nullable=True),
        sa.Column("entidad_certificadora", sa.String(255), nullable=True),
        sa.Column("alcance", sa.Text, nullable=True),
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
        "ix_sistemas_gestion_empresa_empresa_id",
        "sistemas_gestion_empresa",
        ["empresa_id"],
    )

    # ── empresa_preferencias (1:1) ──────────────────────────────────────
    op.create_table(
        "empresa_preferencias",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("empresa_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("obras_simultaneas_max", sa.SmallInteger, nullable=True),
        sa.Column("obras_simultaneas_actual", sa.SmallInteger, nullable=True),
        sa.Column("presupuesto_min_interes", sa.Numeric(14, 2), nullable=True),
        sa.Column("presupuesto_max_interes", sa.Numeric(14, 2), nullable=True),
        sa.Column(
            "apetito_ute",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "estado_aceptacion",
            sa.String(16),
            nullable=False,
            server_default="acepta",
        ),
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
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "empresa_id", name="uq_empresa_preferencias_empresa_id"
        ),
    )

    # ── empresa_preferencias_territorio (N) ─────────────────────────────
    op.create_table(
        "empresa_preferencias_territorio",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("preferencias_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("comarca_codigo", sa.String(16), nullable=True),
        sa.Column("provincia_codigo", sa.String(2), nullable=True),
        sa.Column("prioridad", sa.String(16), nullable=False),
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
            ["preferencias_id"],
            ["empresa_preferencias.id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ix_empresa_pref_territorio_preferencias_id",
        "empresa_preferencias_territorio",
        ["preferencias_id"],
    )

    # ── empresa_preferencias_cpv (N) ────────────────────────────────────
    op.create_table(
        "empresa_preferencias_cpv",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("preferencias_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cpv_division", sa.String(2), nullable=False),
        sa.Column("prioridad", sa.String(16), nullable=False),
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
            ["preferencias_id"],
            ["empresa_preferencias.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "preferencias_id",
            "cpv_division",
            name="uq_empresa_pref_cpv_division",
        ),
    )
    op.create_index(
        "ix_empresa_pref_cpv_preferencias_id",
        "empresa_preferencias_cpv",
        ["preferencias_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_empresa_pref_cpv_preferencias_id", "empresa_preferencias_cpv"
    )
    op.drop_table("empresa_preferencias_cpv")
    op.drop_index(
        "ix_empresa_pref_territorio_preferencias_id",
        "empresa_preferencias_territorio",
    )
    op.drop_table("empresa_preferencias_territorio")
    op.drop_table("empresa_preferencias")
    op.drop_index(
        "ix_sistemas_gestion_empresa_empresa_id", "sistemas_gestion_empresa"
    )
    op.drop_table("sistemas_gestion_empresa")
    op.drop_index("ix_maquinaria_empresa_empresa_id", "maquinaria_empresa")
    op.drop_table("maquinaria_empresa")
    op.drop_index("ix_personal_empresa_empresa_id", "personal_empresa")
    op.drop_table("personal_empresa")

    op.drop_column("certificados_obra", "narrativa")
    op.drop_column("certificados_obra", "destacado_sobre_b")

    op.drop_column("empresas", "ccc_seguridad_social")
    op.drop_column("empresas", "poder_registro_mercantil")
    op.drop_column("empresas", "poder_protocolo")
    op.drop_column("empresas", "poder_fecha_escritura")
    op.drop_column("empresas", "poder_notario")
