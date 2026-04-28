from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

EstadoAceptacion = Literal["acepta", "selectivo", "no_acepta"]
PrioridadTerritorio = Literal["preferida", "ok", "evitar"]
PrioridadCpv = Literal["core", "secundario", "no_interesa"]


class PreferenciaTerritorioBase(BaseModel):
    comarca_codigo: str | None = Field(default=None, max_length=16)
    provincia_codigo: str | None = Field(default=None, max_length=2)
    prioridad: PrioridadTerritorio

    @model_validator(mode="after")
    def _xor_codigo(self) -> PreferenciaTerritorioBase:
        if (self.comarca_codigo is None) == (self.provincia_codigo is None):
            raise ValueError(
                "Especifica exactamente uno: comarca_codigo o provincia_codigo"
            )
        return self


class PreferenciaTerritorioRead(PreferenciaTerritorioBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class PreferenciaCpvBase(BaseModel):
    cpv_division: str = Field(min_length=2, max_length=2)
    prioridad: PrioridadCpv


class PreferenciaCpvRead(PreferenciaCpvBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class EmpresaPreferenciasBase(BaseModel):
    obras_simultaneas_max: int | None = Field(default=None, ge=0, le=200)
    obras_simultaneas_actual: int | None = Field(default=None, ge=0, le=200)
    presupuesto_min_interes: Decimal | None = Field(default=None, ge=0)
    presupuesto_max_interes: Decimal | None = Field(default=None, ge=0)
    apetito_ute: bool = False
    estado_aceptacion: EstadoAceptacion = "acepta"
    notas: str | None = None


class EmpresaPreferenciasUpsert(EmpresaPreferenciasBase):
    """Upsert del bloque escalar + reemplazo total de listas anidadas.

    El frontend envía siempre las listas completas; el backend reemplaza
    todo (delete + insert). Es la operación natural de un wizard.
    """

    territorios: list[PreferenciaTerritorioBase] = Field(default_factory=list)
    cpvs: list[PreferenciaCpvBase] = Field(default_factory=list)


class EmpresaPreferenciasRead(EmpresaPreferenciasBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    territorios: list[PreferenciaTerritorioRead] = Field(default_factory=list)
    cpvs: list[PreferenciaCpvRead] = Field(default_factory=list)
