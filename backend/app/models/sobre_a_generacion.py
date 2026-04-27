from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SobreAGeneracion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Histórico de generaciones de Sobre A.

    Snapshot del HTML + datos de la empresa + licitación al momento de la
    generación. Permite consultar meses después qué firmó exactamente el
    cliente, aunque luego cambien los datos de empresa.

    Una empresa puede generar el Sobre A varias veces para la misma
    licitación (por iteraciones, correcciones); cada generación crea una
    fila nueva, no se sobrescribe.
    """

    __tablename__ = "sobre_a_generaciones"

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
    expediente: Mapped[str] = mapped_column(String(512), nullable=False)
    html: Mapped[str] = mapped_column(Text, nullable=False)
    datos_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    usa_relic: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
