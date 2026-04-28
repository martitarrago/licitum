from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.empresa import Empresa


class SistemaGestionEmpresa(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Sistema de gestión certificado o plan propio (calidad, MA, PRL).

    Convive con `documentos_empresa`: aquí se modela el sistema descriptivo
    que el Sobre B necesita citar (entidad certificadora, alcance, ámbito),
    no solo el PDF con caducidad.
    """

    __tablename__ = "sistemas_gestion_empresa"

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(32), nullable=False)
    pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    fecha_emision: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_caducidad: Mapped[date | None] = mapped_column(Date, nullable=True)
    entidad_certificadora: Mapped[str | None] = mapped_column(String(255), nullable=True)
    alcance: Mapped[str | None] = mapped_column(Text, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    empresa: Mapped[Empresa] = relationship(back_populates="sistemas_gestion")
