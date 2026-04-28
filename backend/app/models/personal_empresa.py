from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.empresa import Empresa


class PersonalEmpresa(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Persona técnica adscribible a obra para el Sobre B.

    Cubre jefes de obra, encargados, técnicos PRL/calidad/MA, ingenieros y
    arquitectos. Lo que el pliego pide nominalmente en la memoria técnica.
    """

    __tablename__ = "personal_empresa"

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nombre_completo: Mapped[str] = mapped_column(String(255), nullable=False)
    dni: Mapped[str | None] = mapped_column(String(16), nullable=True)
    rol: Mapped[str] = mapped_column(String(32), nullable=False)
    titulacion: Mapped[str | None] = mapped_column(String(255), nullable=True)
    anios_experiencia: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    cv_pdf_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    certificados_formacion: Mapped[list[Any] | None] = mapped_column(JSONB, nullable=True)
    obras_participadas: Mapped[list[uuid.UUID] | None] = mapped_column(
        ARRAY(PGUUID(as_uuid=True)), nullable=True
    )
    activo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    empresa: Mapped[Empresa] = relationship(back_populates="personal")
