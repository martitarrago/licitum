from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SobreAPresentacion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Archivo del Sobre A firmado y presentado al portal.

    Una sola fila por (empresa, licitación): refleja "el PDF que subí al
    portal de contratación". Si el usuario re-sube, sustituye al anterior
    y el R2 viejo se borra. No se modela un histórico de presentaciones
    porque el caso real es uno solo (subsanación = nuevo Sobre A entero,
    flujo distinto que vendrá si lo necesitamos).
    """

    __tablename__ = "sobre_a_presentaciones"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "licitacion_id",
            name="uq_sobre_a_presentaciones_pareja",
        ),
    )

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    licitacion_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("licitaciones.id", ondelete="CASCADE"),
        nullable=False,
    )
    archivo_url: Mapped[str] = mapped_column(Text, nullable=False)
    archivo_filename: Mapped[str] = mapped_column(String(512), nullable=False)
    subido_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
