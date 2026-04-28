from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.empresa import Empresa


class MaquinariaEmpresa(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """Equipo / maquinaria adscribible a obra para el Sobre B.

    No requiere PDF: el inventario se mantiene en la contabilidad del cliente.
    Aquí guardamos lo justo para listarlo en una memoria técnica (tipo, marca,
    modelo, año) y para señales de match (presencia de maquinaria especial).
    """

    __tablename__ = "maquinaria_empresa"

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipo: Mapped[str] = mapped_column(String(64), nullable=False)
    marca: Mapped[str | None] = mapped_column(String(128), nullable=True)
    modelo: Mapped[str | None] = mapped_column(String(128), nullable=True)
    anio: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    matricula: Mapped[str | None] = mapped_column(String(32), nullable=True)
    propiedad: Mapped[str] = mapped_column(
        String(32), nullable=False, default="propia", server_default="propia"
    )
    itv_caducidad: Mapped[date | None] = mapped_column(Date, nullable=True)
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    empresa: Mapped[Empresa] = relationship(back_populates="maquinaria")
