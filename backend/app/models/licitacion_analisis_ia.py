from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, TypeDecorator
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import EstadoAnalisisPliego
from app.db.base import Base, TimestampMixin


class EstadoAnalisisPliegoType(TypeDecorator):
    impl = PGEnum(
        EstadoAnalisisPliego,
        name="estado_analisis_pliego",
        create_type=False,
        values_callable=lambda x: [e.value for e in x],
    )
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, EstadoAnalisisPliego):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is not None:
            return EstadoAnalisisPliego(value)
        return value


class LicitacionAnalisisIA(TimestampMixin, Base):
    """Cache GLOBAL del análisis IA del pliego de una licitación.

    Una fila por `licitacion_id` (PK = licitacion_id). El extracted_data
    contiene la estructura completa de PliegoExtraido. La recomendación
    ir/no ir NO se persiste aquí — se calcula on-the-fly cruzando con los
    datos de M2 de la empresa que consulta.
    """

    __tablename__ = "licitacion_analisis_ia"

    licitacion_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("licitaciones.id", ondelete="CASCADE"),
        primary_key=True,
    )
    pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    estado: Mapped[EstadoAnalisisPliego] = mapped_column(
        EstadoAnalisisPliegoType,
        nullable=False,
        default=EstadoAnalisisPliego.pendiente,
        server_default=EstadoAnalisisPliego.pendiente.value,
    )
    extracted_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    idioma_detectado: Mapped[str | None] = mapped_column(String(8), nullable=True)
    confianza_global: Mapped[Decimal | None] = mapped_column(
        Numeric(3, 2), nullable=True
    )
    error_mensaje: Mapped[str | None] = mapped_column(Text, nullable=True)
    procesado_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
