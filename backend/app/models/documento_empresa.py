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


class DocumentoEmpresa(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Documento administrativo de la empresa con fecha de caducidad.

    Cubre lo que un órgano contratante puede pedir tras adjudicación
    provisional (LCSP, plazo 10 días hábiles): Hacienda al corriente,
    Seguridad Social al corriente, pólizas (RC, todo riesgo construcción),
    certificados ISO, REA construcción, TC2, etc.

    El estado (vigente / a_caducar / caducado) se computa en el schema a
    partir de `fecha_caducidad` y la fecha actual; no se persiste para
    evitar jobs de actualización periódica.
    """

    __tablename__ = "documentos_empresa"

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(32), nullable=False)
    titulo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    fecha_emision: Mapped[date | None] = mapped_column(Date, nullable=True)
    fecha_caducidad: Mapped[date | None] = mapped_column(Date, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    empresa: Mapped[Empresa] = relationship(back_populates="documentos")
