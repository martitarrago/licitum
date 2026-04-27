from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

# Tipos de documento administrativo aceptados. Mantener sincronizado con el
# selector del frontend (`components/empresa/DocumentosUploadModal.tsx`).
TipoDocumento = Literal[
    "hacienda_corriente",
    "ss_corriente",
    "poliza_rc",
    "poliza_todo_riesgo",
    "iso_9001",
    "iso_14001",
    "iso_45001",
    "rea_construccion",
    "plantilla_tc2",
    "otros",
]

EstadoDocumento = Literal["vigente", "a_caducar", "caducado"]

# Días antes de la caducidad en los que un documento pasa a estado
# "a_caducar". Coincide con el plazo típico que da un órgano para
# documentación previa a adjudicación (LCSP: 10 días hábiles, ~2 semanas
# naturales). 30 días da margen para renovar.
DIAS_PRE_CADUCIDAD = 30


class DocumentoEmpresaCreate(BaseModel):
    """Body para crear un documento sin PDF (entrada manual)."""

    empresa_id: uuid.UUID
    tipo: TipoDocumento
    titulo: str | None = Field(default=None, max_length=255)
    fecha_emision: date | None = None
    fecha_caducidad: date | None = None
    notas: str | None = None


class DocumentoEmpresaUpdate(BaseModel):
    tipo: TipoDocumento | None = None
    titulo: str | None = Field(default=None, max_length=255)
    fecha_emision: date | None = None
    fecha_caducidad: date | None = None
    notas: str | None = None


class DocumentoEmpresaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    empresa_id: uuid.UUID
    tipo: str
    titulo: str | None
    pdf_url: str | None
    fecha_emision: date | None
    fecha_caducidad: date | None
    notas: str | None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado(self) -> EstadoDocumento:
        """Vigente / a punto de caducar / caducado.

        Sin fecha_caducidad → "vigente" (asumimos sin caducidad explícita,
        p.ej. ISO sin renovación cercana).
        """
        if self.fecha_caducidad is None:
            return "vigente"
        today = date.today()
        if self.fecha_caducidad < today:
            return "caducado"
        if (self.fecha_caducidad - today).days <= DIAS_PRE_CADUCIDAD:
            return "a_caducar"
        return "vigente"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def dias_a_caducidad(self) -> int | None:
        """Días positivos hasta la caducidad; negativos si ya caducó.

        None si no hay fecha_caducidad.
        """
        if self.fecha_caducidad is None:
            return None
        return (self.fecha_caducidad - date.today()).days


class ResumenSaludDocumental(BaseModel):
    """Resumen para el KPI de salud documental en /empresa/documentos."""

    total: int
    vigentes: int
    a_caducar: int
    caducados: int
    proximos_a_caducar: list[DocumentoEmpresaRead]
