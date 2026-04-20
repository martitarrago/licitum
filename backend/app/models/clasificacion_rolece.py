from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.empresa import Empresa


class ClasificacionRolece(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "clasificaciones_rolece"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "grupo",
            "subgrupo",
            "categoria",
            name="uq_clasificacion_empresa_grupo_subgrupo_categoria",
        ),
    )

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    grupo: Mapped[str] = mapped_column(String(8), nullable=False)
    subgrupo: Mapped[str] = mapped_column(String(8), nullable=False)
    categoria: Mapped[str] = mapped_column(String(4), nullable=False)
    fecha_obtencion: Mapped[date] = mapped_column(Date, nullable=False)
    fecha_caducidad: Mapped[date] = mapped_column(Date, nullable=False)
    activa: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )

    empresa: Mapped[Empresa] = relationship(back_populates="clasificaciones")
