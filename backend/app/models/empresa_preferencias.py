from __future__ import annotations

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Numeric, SmallInteger, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.empresa import Empresa


class EmpresaPreferencias(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Preferencias declarativas que alimentan el ranking del motor de match.

    1:1 con empresas. Estos datos NO se derivan de los certificados ni del
    histórico PSCP — son lo que el cliente declara como su apetito real
    (capacidad simultánea, presupuestos, UTE, estado de aceptación).
    """

    __tablename__ = "empresa_preferencias"
    __table_args__ = (
        UniqueConstraint("empresa_id", name="uq_empresa_preferencias_empresa_id"),
    )

    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
    )
    obras_simultaneas_max: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    obras_simultaneas_actual: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    presupuesto_min_interes: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    presupuesto_max_interes: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2), nullable=True
    )
    apetito_ute: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    estado_aceptacion: Mapped[str] = mapped_column(
        String(16), nullable=False, default="acepta", server_default="acepta"
    )
    notas: Mapped[str | None] = mapped_column(Text, nullable=True)

    empresa: Mapped[Empresa] = relationship(back_populates="preferencias")
    territorios: Mapped[list[EmpresaPreferenciaTerritorio]] = relationship(
        back_populates="preferencias",
        cascade="all, delete-orphan",
    )
    cpvs: Mapped[list[EmpresaPreferenciaCpv]] = relationship(
        back_populates="preferencias",
        cascade="all, delete-orphan",
    )


class EmpresaPreferenciaTerritorio(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Una comarca o provincia con prioridad declarada.

    `comarca_codigo` cubre Cataluña (códigos INE de comarca). `provincia_codigo`
    cubre el resto de España (2 dígitos). Solo uno de los dos debe estar
    relleno por fila.
    """

    __tablename__ = "empresa_preferencias_territorio"

    preferencias_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresa_preferencias.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    comarca_codigo: Mapped[str | None] = mapped_column(String(16), nullable=True)
    provincia_codigo: Mapped[str | None] = mapped_column(String(2), nullable=True)
    prioridad: Mapped[str] = mapped_column(String(16), nullable=False)

    preferencias: Mapped[EmpresaPreferencias] = relationship(back_populates="territorios")


class EmpresaPreferenciaCpv(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Una división CPV (2 dígitos) con prioridad declarada.

    `core` = línea principal del negocio. `secundario` = se acepta si encaja.
    `no_interesa` = filtro negativo en el match.
    """

    __tablename__ = "empresa_preferencias_cpv"
    __table_args__ = (
        UniqueConstraint(
            "preferencias_id",
            "cpv_division",
            name="uq_empresa_pref_cpv_division",
        ),
    )

    preferencias_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresa_preferencias.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cpv_division: Mapped[str] = mapped_column(String(2), nullable=False)
    prioridad: Mapped[str] = mapped_column(String(16), nullable=False)

    preferencias: Mapped[EmpresaPreferencias] = relationship(back_populates="cpvs")
