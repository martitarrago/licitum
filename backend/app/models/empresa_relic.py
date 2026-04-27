from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.clasificacion_relic import ClasificacionRelic
    from app.models.empresa import Empresa


class EmpresaRelic(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Datos RELIC (Catalunya) de una empresa. 1:1 con `empresas`.

    Origen: dataset Socrata `t3wj-j4pu` en `analisi.transparenciacatalunya.cat`.
    El `n_registral` es la clave de sincronización con Socrata (el dataset NO
    expone CIF/NIF — el cliente lo introduce manualmente desde su tarjeta de
    inscripción RELIC).
    """

    __tablename__ = "empresas_relic"
    __table_args__ = (
        UniqueConstraint("empresa_id", name="uq_empresas_relic_empresa_id"),
        UniqueConstraint("n_registral", name="uq_empresas_relic_n_registral"),
    )

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
    )
    n_registral: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    nom_empresa: Mapped[str | None] = mapped_column(String(512), nullable=True)
    prohibicio: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    prohibicio_data: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    data_actualitzacio: Mapped[date | None] = mapped_column(Date, nullable=True)
    ultima_sincronizacion: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    empresa: Mapped[Empresa] = relationship(back_populates="relic")
    clasificaciones_relic: Mapped[list[ClasificacionRelic]] = relationship(
        back_populates="empresa_relic",
        cascade="all, delete-orphan",
    )
