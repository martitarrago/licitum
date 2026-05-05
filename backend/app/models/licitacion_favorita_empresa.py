from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class LicitacionFavoritaEmpresa(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Marcador "favorito" de una licitación para una empresa.

    Concepto independiente del pipeline (LicitacionEstadoEmpresa). Una
    licitación puede ser favorita sin estar todavía en pipeline — es la
    bandeja "interesa, lo miraré" del Radar. Al pulsar "Preparar Sobre A"
    se crea además una fila en LicitacionEstadoEmpresa con estado
    `en_preparacion`, pero esa transición es ortogonal al favorito.

    Sin fila aquí = no es favorita.
    """

    __tablename__ = "licitacion_favorita_empresa"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "licitacion_id",
            name="uq_licitacion_favorita_empresa_pareja",
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
        index=True,
    )
