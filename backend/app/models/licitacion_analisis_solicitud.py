from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LicitacionAnalisisSolicitud(Base):
    """Registro de qué empresa ha "pedido" análisis IA de qué licitación.

    El análisis del pliego es global (cache compartido en `licitacion_analisis_ia`),
    pero la UI de "Pliegos analizados" debe filtrar por empresa: cada empresa
    solo ve los pliegos que su contexto ha solicitado, sea por click manual del
    usuario o por encolación automática del cron del dispatcher.

    PK compuesta (empresa_id, licitacion_id) — una empresa solo "solicita" una
    vez la misma licitación. Si vuelve a clicar, es no-op.
    """

    __tablename__ = "licitacion_analisis_solicitud"

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        primary_key=True,
    )
    licitacion_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("licitaciones.id", ondelete="CASCADE"),
        primary_key=True,
    )
    origen: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        comment="'usuario' = botón manual del frontend; 'cron' = dispatcher automático",
    )
    solicitado_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
