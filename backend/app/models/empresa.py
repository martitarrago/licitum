from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.certificado_obra import CertificadoObra
    from app.models.clasificacion_rolece import ClasificacionRolece
    from app.models.documento_empresa import DocumentoEmpresa
    from app.models.empresa_relic import EmpresaRelic


class Empresa(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "empresas"

    # Identificación
    nombre: Mapped[str] = mapped_column(String(255), nullable=False)
    cif: Mapped[str] = mapped_column(String(16), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    telefono: Mapped[str | None] = mapped_column(String(32), nullable=True)
    iae: Mapped[str | None] = mapped_column(String(16), nullable=True)
    cnae: Mapped[str | None] = mapped_column(String(16), nullable=True)
    tamano_pyme: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Dirección
    direccion_calle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    direccion_codigo_postal: Mapped[str | None] = mapped_column(String(16), nullable=True)
    direccion_ciudad: Mapped[str | None] = mapped_column(String(128), nullable=True)
    direccion_provincia: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direccion_pais: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default="ES", server_default="ES"
    )

    # Representante legal con poder
    representante_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)
    representante_nif: Mapped[str | None] = mapped_column(String(16), nullable=True)
    representante_cargo: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Volumen de negocio (3 últimos ejercicios) y plantilla — para acreditar
    # solvencia económica/técnica en pliegos sin clasificación obligatoria.
    volumen_negocio_n: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    volumen_negocio_n1: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    volumen_negocio_n2: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    plantilla_media: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    # Relaciones
    certificados: Mapped[list[CertificadoObra]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
    clasificaciones: Mapped[list[ClasificacionRolece]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
    relic: Mapped[EmpresaRelic | None] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
        uselist=False,
    )
    documentos: Mapped[list[DocumentoEmpresa]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
