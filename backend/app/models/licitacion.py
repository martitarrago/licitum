from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

TIPO_CONTRATO_MAP: dict[str, str] = {
    "1": "obras",
    "2": "concesion_obras",
    "3": "gestion_servicios",
    "4": "suministros",
    "5": "servicios",
    "6": "concesion_servicios",
    "7": "administrativo_especial",
    "21": "colaboracion_publico_privada",
    "31": "acuerdo_marco",
    "32": "sda",
}


class Licitacion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "licitaciones"

    expediente: Mapped[str] = mapped_column(String(512), nullable=False, unique=True, index=True)
    titulo: Mapped[str | None] = mapped_column(Text, nullable=True)

    organismo: Mapped[str | None] = mapped_column(String(512), nullable=True)
    organismo_id: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)

    importe_licitacion: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)
    importe_presupuesto_base: Mapped[Decimal | None] = mapped_column(Numeric(16, 2), nullable=True)

    fecha_publicacion: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fecha_limite: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    cpv_codes: Mapped[list[str]] = mapped_column(
        ARRAY(String(16)), nullable=False, default=list, server_default="{}"
    )
    tipo_contrato: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tipo_procedimiento: Mapped[str | None] = mapped_column(String(64), nullable=True)
    clasificacion_requerida: Mapped[str | None] = mapped_column(String(256), nullable=True)

    # Filtros M2 derivados (poblados por el worker desde raw_data y organismo).
    # Mantener en sync con `_extraer_provincias` y `_extraer_tipo_organismo`
    # del worker y con el backfill SQL de la migración 0008.
    provincias: Mapped[list[str]] = mapped_column(
        ARRAY(String(32)), nullable=False, default=list, server_default="{}"
    )
    tipo_organismo: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Afinidad histórica calculada por `calcular_afinidad` cruzando con M3.
    # Rango 0.00–1.00. NULL si no se ha calculado todavía.
    score_afinidad: Mapped[Decimal | None] = mapped_column(Numeric(3, 2), nullable=True)

    url_placsp: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # gris=sin calcular, verde=apto, amarillo=marginal, rojo=fuera de alcance
    semaforo: Mapped[str] = mapped_column(
        String(16), nullable=False, default="gris", server_default="gris"
    )
    semaforo_razon: Mapped[str | None] = mapped_column(Text, nullable=True)

    raw_data: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    ingestado_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
