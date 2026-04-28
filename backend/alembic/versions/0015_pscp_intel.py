"""pscp_intel — Phase 1 motor de ganabilidad sobre PSCP

Crea las tablas core del data layer:
  - pscp_adjudicacion: fact table de adjudicaciones PSCP (1 fila por lote)
  - pscp_empresa: adjudicatarios normalizados (CIF agresivo)
  - pscp_adjudicacion_empresa: M:N para UTEs
  - pscp_pliego_doc: documentos extraídos (Phase 1.5, schema preparado)
  - pscp_sync_log: observabilidad del pipeline

Las materialized views agregadas se crean en 0016_pscp_intel_mviews.py
TRAS el primer backfill (de lo contrario refrescar vistas vacías es ruido).

Spec completa: docs/data-science/architecture.md

Revision ID: 0015_pscp_intel
Revises: 0014_sobre_a
Create Date: 2026-04-28

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_pscp_intel"
down_revision: Union[str, None] = "0014_sobre_a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # pscp_adjudicacion — fact table principal
    # ------------------------------------------------------------------
    op.create_table(
        "pscp_adjudicacion",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),

        # Identidad de origen
        sa.Column("socrata_row_id", sa.Text, nullable=False),
        sa.Column("codi_expedient", sa.Text, nullable=False),
        sa.Column("numero_lot", sa.Text, nullable=True),

        # Órgano (jerarquía completa de PSCP)
        sa.Column("codi_ambit", sa.Text, nullable=True),
        sa.Column("nom_ambit", sa.Text, nullable=True),
        sa.Column("codi_departament_ens", sa.Text, nullable=True),
        sa.Column("nom_departament_ens", sa.Text, nullable=True),
        sa.Column("codi_organ", sa.Text, nullable=False),
        sa.Column("nom_organ", sa.Text, nullable=False),
        sa.Column("codi_unitat", sa.Text, nullable=True),
        sa.Column("nom_unitat", sa.Text, nullable=True),
        sa.Column("codi_dir3", sa.Text, nullable=True),
        sa.Column("codi_ine10", sa.Text, nullable=True),

        # Tipo de contrato y procedimiento
        sa.Column("tipus_contracte", sa.Text, nullable=True),
        sa.Column("procediment", sa.Text, nullable=True),
        sa.Column("tipus_tramitacio", sa.Text, nullable=True),
        sa.Column("fase_publicacio", sa.Text, nullable=True),
        sa.Column("resultat", sa.Text, nullable=True),
        sa.Column("es_agregada", sa.Boolean, nullable=True),
        sa.Column("racionalitzacio_contractacio", sa.Text, nullable=True),
        sa.Column("tipus_financament", sa.Text, nullable=True),

        # Descripción
        sa.Column("denominacio", sa.Text, nullable=True),
        sa.Column("objecte_contracte", sa.Text, nullable=True),
        sa.Column("descripcio_lot", sa.Text, nullable=True),
        sa.Column("codi_cpv", sa.Text, nullable=True),

        # Geografía
        sa.Column("lloc_execucio", sa.Text, nullable=True),
        sa.Column("codi_nuts", sa.Text, nullable=True),

        # Importes
        sa.Column("valor_estimat_contracte", sa.Numeric(15, 2), nullable=True),
        sa.Column("valor_estimat_expedient", sa.Numeric(15, 2), nullable=True),
        sa.Column("pressupost_licitacio_sense", sa.Numeric(15, 2), nullable=True),
        sa.Column("pressupost_licitacio_sense_1", sa.Numeric(15, 2), nullable=True),
        sa.Column("pressupost_licitacio_amb", sa.Numeric(15, 2), nullable=True),
        sa.Column("pressupost_licitacio_amb_1", sa.Numeric(15, 2), nullable=True),
        sa.Column("import_adjudicacio_sense_raw", sa.Text, nullable=True),
        sa.Column("import_adjudicacio_amb_iva_raw", sa.Text, nullable=True),
        sa.Column("import_adjudicacio_sense", sa.Numeric(15, 2), nullable=True),
        sa.Column("import_adjudicacio_amb_iva", sa.Numeric(15, 2), nullable=True),

        # Competencia
        sa.Column("ofertes_rebudes", sa.Integer, nullable=True),

        # Fechas
        sa.Column("termini_presentacio_ofertes", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_publicacio_futura", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_publicacio_previ", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_publicacio_anunci", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_publicacio_adjudicacio", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_publicacio_formalitzacio", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_publicacio_anul", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_publicacio_consulta", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_adjudicacio_contracte", sa.DateTime(timezone=True), nullable=True),
        sa.Column("data_formalitzacio_contracte", sa.DateTime(timezone=True), nullable=True),

        # Otros
        sa.Column("durada_contracte", sa.Text, nullable=True),
        sa.Column("enllac_publicacio", sa.Text, nullable=True),

        # Auditoría / change detection
        sa.Column("raw_record", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("content_hash", sa.Text, nullable=False),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
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
        sa.UniqueConstraint("socrata_row_id", name="uq_pscp_adj_socrata_row_id"),
    )

    # GENERATED columns (no soportadas por SA Column directo, op.execute)
    op.execute(
        """
        ALTER TABLE pscp_adjudicacion
        ADD COLUMN expedient_lot_key TEXT
            GENERATED ALWAYS AS (
                codi_expedient || '::' || COALESCE(numero_lot, '__SINGLE__')
            ) STORED,
        ADD COLUMN codi_cpv_2 TEXT
            GENERATED ALWAYS AS (LEFT(codi_cpv, 2)) STORED,
        ADD COLUMN codi_cpv_4 TEXT
            GENERATED ALWAYS AS (LEFT(codi_cpv, 4)) STORED,
        ADD COLUMN baja_pct NUMERIC(7,3)
            GENERATED ALWAYS AS (
                CASE
                    WHEN pressupost_licitacio_sense > 0
                         AND import_adjudicacio_sense IS NOT NULL
                    THEN ROUND(
                        (1 - import_adjudicacio_sense / pressupost_licitacio_sense) * 100,
                        3
                    )
                    ELSE NULL
                END
            ) STORED;
        """
    )

    op.create_index(
        "uq_pscp_adj_expedient_lot",
        "pscp_adjudicacion",
        ["expedient_lot_key"],
        unique=True,
    )
    op.create_index(
        "ix_pscp_adj_organ_cpv4",
        "pscp_adjudicacion",
        ["codi_organ", "codi_cpv_4"],
    )
    op.create_index(
        "ix_pscp_adj_data_adj",
        "pscp_adjudicacion",
        [sa.text("data_adjudicacio_contracte DESC")],
    )
    op.create_index("ix_pscp_adj_tipus", "pscp_adjudicacion", ["tipus_contracte"])
    op.create_index("ix_pscp_adj_fase", "pscp_adjudicacion", ["fase_publicacio"])
    op.create_index("ix_pscp_adj_expedient", "pscp_adjudicacion", ["codi_expedient"])
    op.create_index(
        "ix_pscp_adj_updated",
        "pscp_adjudicacion",
        [sa.text("updated_at DESC")],
    )

    # ------------------------------------------------------------------
    # pscp_empresa — adjudicatarios normalizados
    # ------------------------------------------------------------------
    op.create_table(
        "pscp_empresa",
        sa.Column("cif", sa.Text, nullable=False),
        sa.Column(
            "cif_raw_seen",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
        sa.Column("denominacio_canonica", sa.Text, nullable=True),
        sa.Column("nif_type", sa.CHAR(1), nullable=True),
        sa.Column("is_persona_fisica", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_anonimizada", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_extranjera", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("checksum_valid", sa.Boolean, nullable=True),
        sa.Column("n_registral_relic", sa.Text, nullable=True),
        sa.Column(
            "has_relic_classification",
            sa.Boolean,
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "first_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("cif"),
    )
    op.create_index(
        "ix_pscp_empresa_relic",
        "pscp_empresa",
        ["n_registral_relic"],
        postgresql_where=sa.text("n_registral_relic IS NOT NULL"),
    )

    # ------------------------------------------------------------------
    # pscp_adjudicacion_empresa — M:N para UTEs
    # ------------------------------------------------------------------
    op.create_table(
        "pscp_adjudicacion_empresa",
        sa.Column("adjudicacion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cif", sa.Text, nullable=False),
        sa.Column("posicio_ute", sa.Integer, nullable=False, server_default="0"),
        sa.Column("denominacio_raw", sa.Text, nullable=True),
        sa.PrimaryKeyConstraint("adjudicacion_id", "cif"),
        sa.ForeignKeyConstraint(
            ["adjudicacion_id"], ["pscp_adjudicacion.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["cif"], ["pscp_empresa.cif"], ondelete="RESTRICT"),
    )
    op.create_index("ix_pscp_adj_emp_cif", "pscp_adjudicacion_empresa", ["cif"])

    # ------------------------------------------------------------------
    # pscp_pliego_doc — Phase 1.5 (schema preparado, sin uso todavía)
    # ------------------------------------------------------------------
    op.create_table(
        "pscp_pliego_doc",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("adjudicacion_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("doc_type", sa.Text, nullable=False),
        sa.Column("source_url", sa.Text, nullable=True),
        sa.Column("storage_url", sa.Text, nullable=True),
        sa.Column("sha256", sa.Text, nullable=True),
        sa.Column("bytes_size", sa.Integer, nullable=True),
        sa.Column("pages_count", sa.Integer, nullable=True),
        sa.Column("is_scanned", sa.Boolean, nullable=True),
        sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("extraction_model", sa.Text, nullable=True),
        sa.Column("extraction_cost_usd", sa.Numeric(8, 4), nullable=True),
        sa.Column("extracted_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["adjudicacion_id"], ["pscp_adjudicacion.id"], ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            "doc_type IN ('pcap', 'ppt', 'memoria_adj', 'informe_mesa', 'resolucion_adj')",
            name="ck_pscp_pliego_doc_type",
        ),
    )
    op.create_index("ix_pscp_pliego_adj", "pscp_pliego_doc", ["adjudicacion_id"])
    op.create_index("ix_pscp_pliego_type", "pscp_pliego_doc", ["doc_type"])

    # ------------------------------------------------------------------
    # pscp_sync_log — observabilidad
    # ------------------------------------------------------------------
    op.create_table(
        "pscp_sync_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("sync_type", sa.Text, nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("records_fetched", sa.Integer, nullable=True),
        sa.Column("records_inserted", sa.Integer, nullable=True),
        sa.Column("records_updated", sa.Integer, nullable=True),
        sa.Column("records_unchanged", sa.Integer, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column(
            "metadata_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default="{}",
        ),
        sa.CheckConstraint(
            "sync_type IN ('backfill', 'incremental', 'mview_refresh', 'renormalize', 'pliego_extract')",
            name="ck_pscp_sync_log_type",
        ),
    )
    op.create_index(
        "ix_pscp_sync_log_started",
        "pscp_sync_log",
        [sa.text("started_at DESC")],
    )
    op.create_index(
        "ix_pscp_sync_log_type_finished",
        "pscp_sync_log",
        ["sync_type", sa.text("finished_at DESC")],
    )


def downgrade() -> None:
    op.drop_table("pscp_sync_log")
    op.drop_table("pscp_pliego_doc")
    op.drop_table("pscp_adjudicacion_empresa")
    op.drop_table("pscp_empresa")
    op.drop_table("pscp_adjudicacion")
