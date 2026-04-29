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
# Cota de tamaño para PDFs complementarios (PPT). Pliegos técnicos en obras
# grandes son proyectos completos con planos/mediciones — pueden superar
# 30MB y disparar el coste de Claude por encima de $1.50 con poca señal
# adicional para el motor (los planos y mediciones no aportan al scoring).
# El PCAP NO tiene este guard: es siempre core, raramente >5MB.
MAX_PPT_BYTES = 8 * 1024 * 1024  # 8 MB

# Documentos que el motor PUEDE consumir, en dos categorías:
#
# CORE (siempre) — el PCAP. Contiene clasificación, solvencia, baja temeraria,
# criterios y garantías. Sin PCAP no hay análisis útil del expediente.
#
# COMPLEMENTARY (si existe, concatenar) — el PPT. En obras públicas el PPT
# frecuentemente es el "Projecte d'Obres" e incluye memoria descriptiva,
# criterios técnicos puntuables (memoria, equipo adscrito, mejoras) y a
# veces solvencia técnica detallada que el PCAP referencia. Aporta señal
# útil al motor por +$0.15-0.35 de coste Claude marginal.
#
# OUT OF SCOPE para B1.1 (reservado a M5 Sobre B):
# - memoriaJustificativaContracte (justifica necesidad del órgano)
# - documentsAprovacio (acto administrativo interno)
# - altresDocuments (anexos, planos en CAD/BC3, actas de replanteo)
PLIEGO_CORE_FIELD = "plecsDeClausulesAdministratives"
PLIEGO_COMPLEMENTARY_FIELDS = ["plecsDePrescripcionsTecniques"]


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


def _primer_doc_de_seccion(seccion: dict[str, Any], campo: str) -> dict[str, Any] | None:
    """Devuelve el primer doc descargable de una sección (catalán preferido)."""
    if not seccion:
        return None
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
                    "campo_origen": campo,
                }
    return None


def _extraer_docs_para_motor(json_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Lista de documentos a consumir por el motor: PCAP siempre + PPT si existe.

    Orden: PCAP primero (es la fuente principal de señales), PPT después
    (complementario). El worker concatena el texto extraído en este orden
    antes de pasarlo a Claude para mantener trazabilidad de qué afirmación
    viene de qué documento.
    """
    dades = json_data.get("publicacio", {}).get("dadesPublicacio", {})
    docs: list[dict[str, Any]] = []

    pcap = _primer_doc_de_seccion(dades.get(PLIEGO_CORE_FIELD), PLIEGO_CORE_FIELD)
    if pcap is not None:
        docs.append(pcap)

    for campo in PLIEGO_COMPLEMENTARY_FIELDS:
        ppt = _primer_doc_de_seccion(dades.get(campo), campo)
        if ppt is None:
            continue
        # Guard de tamaño — PPT en obras grandes son proyectos técnicos
        # con planos que disparan coste sin aportar al motor.
        mida = ppt.get("mida")
        if mida and mida > MAX_PPT_BYTES:
            logger.info(
                "PPT skipped por tamaño: %s (%s bytes > %s)",
                ppt.get("titol"), mida, MAX_PPT_BYTES,
            )
            continue
        docs.append(ppt)

    return docs


def construir_url_descarga(doc_id: int | str, doc_hash: str) -> str:
    """Construye la URL pública de descarga directa del PDF."""
    return f"{PORTAL_API}/descarrega-document/{doc_id}/{doc_hash}"


async def descubrir_documentos_pliego(
    db: AsyncSession,
    licitacion_id: UUID,
) -> list[dict[str, Any]]:
    """Resuelve la lista de documentos del pliego para análisis: PCAP + (PPT si existe).

    Returns:
        Lista de dicts con keys: `url`, `titol`, `mida`, `idioma`, `campo_origen`.
        El primer elemento siempre es el PCAP. El PPT (si existe) viene segundo.

    Raises:
        PscpDocumentNotFoundError: si la licitación no tiene url_placsp,
            si el JSON del expediente no tiene PCAP accesible, o si la URL
            PSCP no encaja con el patrón esperado. La ausencia de PPT NO
            es error — se devuelve solo el PCAP.
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

    docs = _extraer_docs_para_motor(data)
    if not docs:
        raise PscpDocumentNotFoundError(
            f"Expediente PSCP num={num} no expone PCAP descargable"
        )

    out = []
    for doc in docs:
        url = construir_url_descarga(doc["id"], doc["hash"])
        out.append({
            "url": url,
            "titol": doc["titol"],
            "mida": doc.get("mida"),
            "idioma": doc.get("idioma"),
            "campo_origen": doc["campo_origen"],
        })
        logger.info(
            "PSCP discover licitacion=%s num=%s doc=%s mida=%s campo=%s",
            licitacion_id, num, doc["titol"], doc.get("mida"), doc["campo_origen"],
        )
    return out


# Wrapper backward-compat — devuelve solo el primero (PCAP). Lo mantengo
# por si algún caller externo aún lo usa, pero internamente ya no se llama.
async def descubrir_pdf_pliego_url(
    db: AsyncSession,
    licitacion_id: UUID,
) -> dict[str, Any]:
    docs = await descubrir_documentos_pliego(db, licitacion_id)
    return docs[0]
