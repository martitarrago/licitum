from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.certificado_obra import CertificadoObra
    from app.models.clasificacion_rolece import ClasificacionRolece


class Empresa(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "empresas"

    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    cif: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)

    certificados: Mapped[list[CertificadoObra]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
    clasificaciones: Mapped[list[ClasificacionRolece]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
