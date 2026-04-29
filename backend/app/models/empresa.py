from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from datetime import date

from sqlalchemy import Date, Numeric, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin

if TYPE_CHECKING:
    from app.models.certificado_obra import CertificadoObra
    from app.models.clasificacion_rolece import ClasificacionRolece
    from app.models.documento_empresa import DocumentoEmpresa
    from app.models.empresa_preferencias import EmpresaPreferencias
    from app.models.empresa_relic import EmpresaRelic
    from app.models.maquinaria_empresa import MaquinariaEmpresa
    from app.models.personal_empresa import PersonalEmpresa
    from app.models.sistema_gestion_empresa import SistemaGestionEmpresa


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
    # Código INE 2 dígitos — fuente canónica para el motor de scoring.
    # `direccion_provincia` (texto libre) se mantiene como label para el DEUC.
    direccion_provincia_codigo: Mapped[str | None] = mapped_column(
        String(2), nullable=True
    )
    direccion_pais: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default="ES", server_default="ES"
    )

    # Representante legal con poder
    representante_nombre: Mapped[str | None] = mapped_column(String(255), nullable=True)
    representante_nif: Mapped[str | None] = mapped_column(String(16), nullable=True)
    representante_cargo: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Datos del poder notarial — necesarios para que el DEUC del Sobre A
    # quede limpio (Parte II.B). Sin esto, el DEUC sale incompleto.
    poder_notario: Mapped[str | None] = mapped_column(String(255), nullable=True)
    poder_fecha_escritura: Mapped[date | None] = mapped_column(Date, nullable=True)
    poder_protocolo: Mapped[str | None] = mapped_column(String(64), nullable=True)
    poder_registro_mercantil: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Código de cuenta de cotización principal (SS) — algunos pliegos lo piden
    ccc_seguridad_social: Mapped[str | None] = mapped_column(String(32), nullable=True)

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
    personal: Mapped[list[PersonalEmpresa]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
    maquinaria: Mapped[list[MaquinariaEmpresa]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
    sistemas_gestion: Mapped[list[SistemaGestionEmpresa]] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
    )
    preferencias: Mapped[EmpresaPreferencias | None] = relationship(
        back_populates="empresa",
        cascade="all, delete-orphan",
        uselist=False,
    )
