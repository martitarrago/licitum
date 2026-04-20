from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, ForeignKey, Numeric, String, TypeDecorator
from sqlalchemy.dialects.postgresql import ARRAY, ENUM as PGEnum, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import EstadoCertificado
from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class EstadoCertificadoType(TypeDecorator):
    impl = PGEnum(
        EstadoCertificado,
        name="estado_certificado",
        create_type=False,
        values_callable=lambda x: [e.value for e in x],
    )
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, EstadoCertificado):
            return value.value
        return str(value)

    def process_result_value(self, value, dialect):
        if value is not None:
            return EstadoCertificado(value)
        return value

if TYPE_CHECKING:
    from app.models.empresa import Empresa


class CertificadoObra(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "certificados_obra"

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    titulo: Mapped[str] = mapped_column(String(512), nullable=False)
    organismo: Mapped[str] = mapped_column(String(255), nullable=False)
    importe_adjudicacion: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    fecha_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_fin: Mapped[date] = mapped_column(Date, nullable=False)
    cpv_codes: Mapped[list[str]] = mapped_column(
        ARRAY(String(16)), nullable=False, default=list
    )
    clasificacion_grupo: Mapped[str | None] = mapped_column(String(8), nullable=True)
    clasificacion_subgrupo: Mapped[str | None] = mapped_column(String(8), nullable=True)
    numero_expediente: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True, index=True
    )
    estado: Mapped[EstadoCertificado] = mapped_column(
        EstadoCertificadoType,
        nullable=False,
        default=EstadoCertificado.pendiente_revision,
        server_default=EstadoCertificado.pendiente_revision.value,
    )
    pdf_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    extracted_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )

    empresa: Mapped[Empresa] = relationship(back_populates="certificados")
