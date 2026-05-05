from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class OfertaEconomicaGeneracion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Versión guardada del cálculo de oferta económica (M6 Calculadora).

    El usuario juega con sliders de % baja y la mesa de la calculadora le
    devuelve resultados en vivo (sin persistir). Cuando pulsa "guardar
    versión", se crea una fila aquí con el cálculo congelado + HTML
    renderizado del documento de proposición económica. Sirve como
    auditoría y como base para descargar el .docx editable.

    Mismo patrón que sobre_a_generaciones: una empresa puede generar
    varias versiones para una misma licitación (ajustes, recalcular tras
    cambiar la baja); cada versión = fila nueva, no se pisa.
    """

    __tablename__ = "oferta_economica_generaciones"

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
    presupuesto_base: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False
    )
    baja_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    importe_ofertado: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False
    )
    temeraria_threshold_pct: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    entra_en_temeraria: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    datos_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    html: Mapped[str] = mapped_column(Text, nullable=False)
