from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, SmallInteger, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.empresa_relic import EmpresaRelic


class ClasificacionRelic(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Una clasificación oficial RELIC. N:1 con EmpresaRelic.

    Una empresa con varias clasificaciones tiene N filas (una por sigles_cl,
    ej. "C4", "B1", "I9"). Se reemplazan en bloque en cada sync (delete +
    insert) para reflejar bajas/cambios sin lógica de diff.
    """

    __tablename__ = "clasificaciones_relic"

    empresa_relic_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas_relic.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tipus_cl: Mapped[str] = mapped_column(String(16), nullable=False)
    sigles_cl: Mapped[str] = mapped_column(String(8), nullable=False)
    grupo: Mapped[str] = mapped_column(String(2), nullable=False)
    subgrupo: Mapped[str | None] = mapped_column(String(2), nullable=True)
    categoria: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    subgrup_cl_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    categoria_cl_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suspensio: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    data_atorgament: Mapped[date | None] = mapped_column(Date, nullable=True)

    empresa_relic: Mapped[EmpresaRelic] = relationship(
        back_populates="clasificaciones_relic"
    )
