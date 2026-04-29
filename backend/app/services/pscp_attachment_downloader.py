"""Servicio para descubrir y resolver URLs de descarga de pliegos PSCP.

Phase 2 — B1. Reverse-engineered del bundle Angular del portal
`contractaciopublica.cat` (chunk-6GJMRZII.js, clase con
`pathDocumentsPublicacio = "documents-publicacio"` y método
`descarregarDocument(t,e)` → `${api}/descarrega-document/${t}/${e}`).

Flujo:
  1. Dado un `licitacion_id`, leer `licitaciones.url_placsp` (URL de
     publicación en PSCP) y extraer el `numero_publicacio` (último
     segmento numérico de la URL).
  2. Llamar al endpoint público
     `https://contractaciopublica.cat/portal-api/documents-publicacio/json/{num}`
     que devuelve metadatos completos del expediente sin auth.
  3. Recoger el primer PCAP (PCA, plec administratiu) o, si no hay,
     el primer PPT (plec tècnic).
  4. Construir la URL de descarga directa del PDF:
     `https://contractaciopublica.cat/portal-api/descarrega-document/{id}/{hash}`
     — pública, sin auth, sin token.

NO descarga el PDF aquí — solo resuelve la URL. La descarga la hace
`workers.extraccion_pliego._descargar_pdf` con la misma lógica que
para uploads manuales (`httpx.get` plano).
"""
from __future__ import annotations

import logging
import re
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.licitacion import Licitacion

logger = logging.getLogger(__name__)

PORTAL_BASE = "https://contractaciopublica.cat"
PORTAL_API = f"{PORTAL_BASE}/portal-api"
PSCP_TIMEOUT = 30
# Patron de URL del expediente: /detall-publicacio/<UUID>/<numero>
_NUM_PUBLICACIO_RE = re.compile(r"/detall-publicacio/[a-f0-9-]+/(\d+)")

# Orden de prioridad de los campos del JSON donde puede aparecer el pliego
# que queremos analizar. PCAP tiene preferencia (cláusulas administrativas
# es la sección que más datos para el motor: clasificación, solvencia,
# baja temeraria, criterios). PPT como fallback.
PLIEGO_FIELDS_PRIORITY = [
    "plecsDeClausulesAdministratives",
    "plecsDePrescripcionsTecniques",
    "memoriaJustificativaContracte",  # último recurso
]


class PscpDocumentNotFoundError(Exception):
    """No se pudo encontrar un PDF de pliego en el expediente PSCP."""


def _extraer_num_publicacio(url_placsp: str | None) -> str | None:
    """Extrae el `numero_publicacio` (último segmento numérico) de la URL PSCP."""
    if not url_placsp:
        return None
    match = _NUM_PUBLICACIO_RE.search(url_placsp)
    return match.group(1) if match else None


async def _fetch_publicacio_json(num_publicacio: str) -> dict[str, Any]:
    """GET al endpoint público de metadatos del expediente."""
    url = f"{PORTAL_API}/documents-publicacio/json/{num_publicacio}"
    async with httpx.AsyncClient(timeout=PSCP_TIMEOUT, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "LicitumBot/1.0"})
        resp.raise_for_status()
        return resp.json()


def _extraer_doc_principal(json_data: dict[str, Any]) -> dict[str, Any] | None:
    """Devuelve el primer documento útil del expediente, en orden de prioridad.

    Cada documento tiene `id`, `hash`, `titol`, `mida` (tamaño en bytes),
    `idioma`. Probamos catalán primero, castellano como fallback dentro
    del mismo campo.
    """
    dades = json_data.get("publicacio", {}).get("dadesPublicacio", {})
    for field in PLIEGO_FIELDS_PRIORITY:
        seccion = dades.get(field) or {}
        # Estructura: { "ca": [...], "es": [...], "en": [...], "oc": [...] }
        for idioma in ("ca", "es", "en", "oc"):
            docs = seccion.get(idioma) or []
            for doc in docs:
                if doc.get("id") and doc.get("hash"):
                    return {
                        "id": doc["id"],
                        "hash": doc["hash"],
                        "titol": doc.get("titol", ""),
                        "mida": doc.get("mida"),
                        "idioma": doc.get("idioma", idioma),
                        "campo_origen": field,
                    }
    return None


def construir_url_descarga(doc_id: int | str, doc_hash: str) -> str:
    """Construye la URL pública de descarga directa del PDF."""
    return f"{PORTAL_API}/descarrega-document/{doc_id}/{doc_hash}"


async def descubrir_pdf_pliego_url(
    db: AsyncSession,
    licitacion_id: UUID,
) -> dict[str, Any]:
    """Resuelve la URL pública directa del PCAP/PPT de una licitación.

    Returns:
        dict con keys: `url`, `titol`, `mida`, `idioma`, `campo_origen`.

    Raises:
        PscpDocumentNotFoundError: si la licitación no tiene url_placsp,
            si el JSON del expediente no tiene pliegos accesibles, o si
            la URL PSCP no encaja con el patrón esperado.
    """
    lic = (
        await db.execute(select(Licitacion).where(Licitacion.id == licitacion_id))
    ).scalar_one_or_none()
    if lic is None:
        raise PscpDocumentNotFoundError(f"Licitación {licitacion_id} no encontrada")

    num = _extraer_num_publicacio(lic.url_placsp)
    if num is None:
        raise PscpDocumentNotFoundError(
            f"Licitación {licitacion_id} sin url_placsp válida "
            f"(valor actual: {lic.url_placsp!r})"
        )

    try:
        data = await _fetch_publicacio_json(num)
    except httpx.HTTPStatusError as e:
        raise PscpDocumentNotFoundError(
            f"PSCP devolvió {e.response.status_code} para num={num}"
        ) from e

    doc = _extraer_doc_principal(data)
    if doc is None:
        raise PscpDocumentNotFoundError(
            f"Expediente PSCP num={num} no expone pliego (PCAP/PPT) descargable"
        )

    url = construir_url_descarga(doc["id"], doc["hash"])
    logger.info(
        "PSCP discover OK licitacion=%s num=%s doc=%s mida=%s campo=%s url=%s",
        licitacion_id,
        num,
        doc["titol"],
        doc.get("mida"),
        doc["campo_origen"],
        url,
    )
    return {
        "url": url,
        "titol": doc["titol"],
        "mida": doc.get("mida"),
        "idioma": doc.get("idioma"),
        "campo_origen": doc["campo_origen"],
    }
