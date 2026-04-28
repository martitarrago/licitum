"""SQLAlchemy models para el data layer PSCP (Phase 1 motor de ganabilidad).

Spec: docs/data-science/architecture.md secciones 3.1-3.5
Migración: 0015_pscp_intel
"""
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CHAR,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PscpAdjudicacion(Base):
    """Fact table de adjudicaciones PSCP. 1 fila por (expediente, lote)."""

    __tablename__ = "pscp_adjudicacion"
    __table_args__ = (
        UniqueConstraint("socrata_row_id", name="uq_pscp_adj_socrata_row_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Identidad
    socrata_row_id: Mapped[str] = mapped_column(Text, nullable=False)
    codi_expedient: Mapped[str] = mapped_column(Text, nullable=False)
    numero_lot: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Generated en BBDD: codi_expedient || '::' || COALESCE(numero_lot, '__SINGLE__')
    expedient_lot_key: Mapped[str] = mapped_column(Text, nullable=False)

    # Órgano
    codi_ambit: Mapped[str | None] = mapped_column(Text, nullable=True)
    nom_ambit: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_departament_ens: Mapped[str | None] = mapped_column(Text, nullable=True)
    nom_departament_ens: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_organ: Mapped[str] = mapped_column(Text, nullable=False)
    nom_organ: Mapped[str] = mapped_column(Text, nullable=False)
    codi_unitat: Mapped[str | None] = mapped_column(Text, nullable=True)
    nom_unitat: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_dir3: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_ine10: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Tipo
    tipus_contracte: Mapped[str | None] = mapped_column(Text, nullable=True)
    procediment: Mapped[str | None] = mapped_column(Text, nullable=True)
    tipus_tramitacio: Mapped[str | None] = mapped_column(Text, nullable=True)
    fase_publicacio: Mapped[str | None] = mapped_column(Text, nullable=True)
    resultat: Mapped[str | None] = mapped_column(Text, nullable=True)
    es_agregada: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    racionalitzacio_contractacio: Mapped[str | None] = mapped_column(Text, nullable=True)
    tipus_financament: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Descripción
    denominacio: Mapped[str | None] = mapped_column(Text, nullable=True)
    objecte_contracte: Mapped[str | None] = mapped_column(Text, nullable=True)
    descripcio_lot: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_cpv: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_cpv_2: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_cpv_4: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Geografía
    lloc_execucio: Mapped[str | None] = mapped_column(Text, nullable=True)
    codi_nuts: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Importes
    valor_estimat_contracte: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    valor_estimat_expedient: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    pressupost_licitacio_sense: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    pressupost_licitacio_sense_1: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    pressupost_licitacio_amb: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    pressupost_licitacio_amb_1: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    import_adjudicacio_sense_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    import_adjudicacio_amb_iva_raw: Mapped[str | None] = mapped_column(Text, nullable=True)
    import_adjudicacio_sense: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    import_adjudicacio_amb_iva: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    baja_pct: Mapped[Decimal | None] = mapped_column(Numeric(7, 3), nullable=True)

    # Competencia
    ofertes_rebudes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Fechas
    termini_presentacio_ofertes: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_publicacio_futura: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_publicacio_previ: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_publicacio_anunci: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_publicacio_adjudicacio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_publicacio_formalitzacio: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_publicacio_anul: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_publicacio_consulta: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_adjudicacio_contracte: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    data_formalitzacio_contracte: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Otros
    durada_contracte: Mapped[str | None] = mapped_column(Text, nullable=True)
    enllac_publicacio: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Auditoría / change detection
    raw_record: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    empresas: Mapped[list["PscpAdjudicacionEmpresa"]] = relationship(
        back_populates="adjudicacion",
        cascade="all, delete-orphan",
    )


class PscpEmpresa(Base):
    """Adjudicatarios normalizados (CIF agresivo + cruce RELIC)."""

    __tablename__ = "pscp_empresa"

    cif: Mapped[str] = mapped_column(Text, primary_key=True)
    cif_raw_seen: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    denominacio_canonica: Mapped[str | None] = mapped_column(Text, nullable=True)
    nif_type: Mapped[str | None] = mapped_column(CHAR(1), nullable=True)
    is_persona_fisica: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_anonimizada: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_extranjera: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    checksum_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    n_registral_relic: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_relic_classification: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    adjudicaciones: Mapped[list["PscpAdjudicacionEmpresa"]] = relationship(
        back_populates="empresa"
    )


class PscpAdjudicacionEmpresa(Base):
    """M:N entre adjudicación y empresa (handles UTEs)."""

    __tablename__ = "pscp_adjudicacion_empresa"
    __table_args__ = (
        PrimaryKeyConstraint("adjudicacion_id", "cif"),
    )

    adjudicacion_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pscp_adjudicacion.id", ondelete="CASCADE"),
        nullable=False,
    )
    cif: Mapped[str] = mapped_column(
        Text,
        ForeignKey("pscp_empresa.cif", ondelete="RESTRICT"),
        nullable=False,
    )
    posicio_ute: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    denominacio_raw: Mapped[str | None] = mapped_column(Text, nullable=True)

    adjudicacion: Mapped[PscpAdjudicacion] = relationship(back_populates="empresas")
    empresa: Mapped[PscpEmpresa] = relationship(back_populates="adjudicaciones")


class PscpPliegoDoc(Base):
    """Documentos extraídos de PSCP (Phase 1.5 — schema preparado)."""

    __tablename__ = "pscp_pliego_doc"
    __table_args__ = (
        CheckConstraint(
            "doc_type IN ('pcap', 'ppt', 'memoria_adj', 'informe_mesa', 'resolucion_adj')",
            name="ck_pscp_pliego_doc_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    adjudicacion_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("pscp_adjudicacion.id", ondelete="CASCADE"),
        nullable=False,
    )
    doc_type: Mapped[str] = mapped_column(Text, nullable=False)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sha256: Mapped[str | None] = mapped_column(Text, nullable=True)
    bytes_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pages_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_scanned: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    extracted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    extraction_model: Mapped[str | None] = mapped_column(Text, nullable=True)
    extraction_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(8, 4), nullable=True)
    extracted_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PscpSyncLog(Base):
    """Observabilidad del pipeline (1 fila por ejecución de tarea)."""

    __tablename__ = "pscp_sync_log"
    __table_args__ = (
        CheckConstraint(
            "sync_type IN ('backfill', 'incremental', 'mview_refresh', 'renormalize', 'pliego_extract')",
            name="ck_pscp_sync_log_type",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sync_type: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    records_fetched: Mapped[int | None] = mapped_column(Integer, nullable=True)
    records_inserted: Mapped[int | None] = mapped_column(Integer, nullable=True)
    records_updated: Mapped[int | None] = mapped_column(Integer, nullable=True)
    records_unchanged: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
