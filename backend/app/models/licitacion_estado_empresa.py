from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class LicitacionEstadoEmpresa(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Estado de una licitación en el pipeline de una empresa (M6 Tracker).

    Solo se crea fila cuando el usuario interactúa con la licitación. La
    licitación está SIEMPRE en M1 (Radar), pero solo aparece en el
    Tracker si tiene una fila aquí. Sin fila = estado implícito "ninguno".

    `estado` se valida con un Literal en el schema Pydantic (no PGEnum)
    para poder añadir estados sin migración. `deadline_actual` permite
    recordar el próximo reloj legal (subsanación 3d, documentación previa
    10d) — auto-rellenado al transicionar a estados con plazo.
    """

    __tablename__ = "licitacion_estado_empresa"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "licitacion_id",
            name="uq_licitacion_estado_empresa_pareja",
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
    estado: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    deadline_actual: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    nota: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado_actualizado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
