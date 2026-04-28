"""Modelo SQLAlchemy para `licitacion_score_empresa` (cache del scoring engine).

Migración: 0020_score_empresa
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin


class LicitacionScoreEmpresa(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "licitacion_score_empresa"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id", "licitacion_id", name="uq_score_empresa_licitacion"
        ),
        CheckConstraint("score >= 0 AND score <= 100", name="ck_score_range"),
        CheckConstraint(
            "data_completeness_pct >= 0 AND data_completeness_pct <= 100",
            name="ck_completeness_range",
        ),
        CheckConstraint(
            "confidence IN ('alta', 'media', 'baja', 'n/a')",
            name="ck_confidence_enum",
        ),
    )

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
    )
    licitacion_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("licitaciones.id", ondelete="CASCADE"),
        nullable=False,
    )

    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    confidence: Mapped[str] = mapped_column(String(8), nullable=False)
    descartada: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    reason_descarte: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_completeness_pct: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    breakdown_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    hard_filters_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )

    empresa_context_hash: Mapped[str] = mapped_column(Text, nullable=False)

    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
