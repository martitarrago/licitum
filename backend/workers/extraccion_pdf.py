from __future__ import annotations

import asyncio
import io
import logging
from uuid import UUID

import httpx
import pdfplumber
from anthropic import AsyncAnthropic
from sqlalchemy import select

from app.config import settings
from app.core.celery_app import celery_app
from app.core.enums import EstadoCertificado
from app.db.session import AsyncSessionLocal
from app.models.certificado_obra import CertificadoObra

logger = logging.getLogger(__name__)

NATIVE_TEXT_MIN_CHARS = 100
CLAUDE_MODEL = "claude-sonnet-4-20250514"
CLAUDE_MAX_TOKENS = 1024
PDF_DOWNLOAD_TIMEOUT_SECONDS = 60

EXTRACTION_TOOL: dict = {
    "name": "guardar_datos_certificado",
    "description": (
        "Guarda los datos estructurados extraídos de un certificado o acta de "
        "recepción de obra pública española. Si un campo no aparece en el "
        "documento, devuelve null (cpv_codes: array vacío)."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "importe_adjudicacion": {
                "type": ["number", "null"],
                "description": (
                    "Importe de adjudicación en euros como número (sin separador "
                    "de miles, punto decimal). Prefiere el importe sin IVA si el "
                    "texto lo distingue."
                ),
            },
            "fecha_inicio": {
                "type": ["string", "null"],
                "description": "Fecha de inicio de la obra en formato ISO YYYY-MM-DD.",
            },
            "fecha_fin": {
                "type": ["string", "null"],
                "description": (
                    "Fecha de fin / recepción de la obra en formato ISO YYYY-MM-DD."
                ),
            },
            "organismo": {
                "type": ["string", "null"],
                "description": (
                    "Organismo contratante literal (ayuntamiento, diputación, "
                    "ministerio, etc.)."
                ),
            },
            "cpv_codes": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Códigos CPV como strings (pueden incluir dígito de control, "
                    "ej: '45233000-9'). Array vacío si no aparecen."
                ),
            },
            "clasificacion_grupo": {
                "type": ["string", "null"],
                "description": "Grupo de clasificación ROLECE (ej: 'C', 'G').",
            },
            "clasificacion_subgrupo": {
                "type": ["string", "null"],
                "description": "Subgrupo de clasificación ROLECE (ej: '2', '6').",
            },
            "numero_expediente": {
                "type": ["string", "null"],
                "description": "Número de expediente administrativo literal.",
            },
            "confianza_extraccion": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": (
                    "Estimación propia de la confianza global de la extracción "
                    "(0.0-1.0). Baja si el texto está fragmentado, es OCR ruidoso "
                    "o faltan múltiples campos obvios."
                ),
            },
        },
        "required": ["cpv_codes", "confianza_extraccion"],
    },
}

SYSTEM_PROMPT = (
    "Eres un experto extractor de datos de certificados de obra pública y "
    "actas de recepción del sector de la construcción en España. Tu tarea es "
    "leer el texto de un documento y devolver los datos estructurados llamando "
    "a la herramienta guardar_datos_certificado. "
    "Reglas estrictas: "
    "(1) No inventes datos. Si un campo no aparece literal o inequívocamente "
    "en el texto, devuelve null (o array vacío para cpv_codes). "
    "(2) Fechas siempre en formato ISO YYYY-MM-DD. "
    "(3) El importe en euros como número, sin separador de miles, punto "
    "decimal; si el texto distingue 'sin IVA' e 'IVA incluido', prefiere sin IVA. "
    "(4) La confianza_extraccion debe ser baja (<0.5) cuando el texto esté "
    "fragmentado, sea OCR ruidoso o falten múltiples campos obvios."
)


@celery_app.task(
    name="workers.extraccion_pdf.extraer_certificado",
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    max_retries=3,
)
def extraer_certificado(self, certificado_id: str) -> None:
    """Worker de extracción de datos del PDF de un certificado de obra.

    Flujo:
      1. pendiente_revision → procesando.
      2. Descarga el PDF, extrae texto (pdfplumber, con fallback OCR).
      3. Llama a Claude con structured output y escribe extracted_data.
      4. procesando → pendiente_revision (SIEMPRE; el usuario confirma después).
    """
    asyncio.run(_ejecutar(UUID(certificado_id)))


async def _ejecutar(certificado_id: UUID) -> None:
    async with AsyncSessionLocal() as session:
        cert = await session.scalar(
            select(CertificadoObra).where(CertificadoObra.id == certificado_id)
        )
        if cert is None:
            logger.warning(
                "Certificado %s no encontrado; aborto extracción", certificado_id
            )
            return

        cert.estado = EstadoCertificado.procesando
        await session.commit()

        try:
            pdf_bytes = await _descargar_pdf(cert.pdf_url)
            texto = _extraer_texto(pdf_bytes)
            datos = await _extraer_con_claude(texto)
            cert.extracted_data = datos
            logger.info(
                "Certificado %s: extracción OK (confianza=%s)",
                certificado_id,
                datos.get("confianza_extraccion"),
            )
        finally:
            cert.estado = EstadoCertificado.pendiente_revision
            await session.commit()


async def _descargar_pdf(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=PDF_DOWNLOAD_TIMEOUT_SECONDS) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.content


def _extraer_texto(pdf_bytes: bytes) -> str:
    texto_nativo = _extraer_texto_nativo(pdf_bytes)
    if len(texto_nativo) >= NATIVE_TEXT_MIN_CHARS:
        return texto_nativo
    logger.info(
        "Texto nativo insuficiente (%d chars); cayendo a OCR", len(texto_nativo)
    )
    return _extraer_texto_ocr(pdf_bytes)


def _extraer_texto_nativo(pdf_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        paginas = [page.extract_text() or "" for page in pdf.pages]
    return "\n\n".join(paginas).strip()


def _extraer_texto_ocr(pdf_bytes: bytes) -> str:
    # Imports diferidos: pdf2image requiere Poppler y pytesseract requiere
    # Tesseract como binarios del sistema. Si no están instalados el fallo
    # afecta solo a esta tarea, no al arranque del worker.
    import sys

    import pytesseract
    from pdf2image import convert_from_bytes

    # En Windows, pytesseract no detecta la ruta automáticamente.
    if sys.platform == "win32":
        pytesseract.pytesseract.tesseract_cmd = (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        )

    imagenes = convert_from_bytes(pdf_bytes, dpi=200)
    textos = [pytesseract.image_to_string(img, lang="spa") for img in imagenes]
    return "\n\n".join(textos).strip()


async def _extraer_con_claude(texto: str) -> dict:
    if not settings.anthropic_api_key:
        logger.warning(
            "ANTHROPIC_API_KEY no configurada; extracted_data queda vacío"
        )
        return {}

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    respuesta = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=CLAUDE_MAX_TOKENS,
        temperature=0,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        tools=[{**EXTRACTION_TOOL, "cache_control": {"type": "ephemeral"}}],
        tool_choice={"type": "tool", "name": "guardar_datos_certificado"},
        messages=[
            {
                "role": "user",
                "content": (
                    "A continuación el texto extraído del certificado de obra. "
                    "Extrae los datos estructurados llamando a la herramienta.\n\n"
                    "---INICIO DEL DOCUMENTO---\n"
                    f"{texto}\n"
                    "---FIN DEL DOCUMENTO---"
                ),
            }
        ],
    )

    for block in respuesta.content:
        if block.type == "tool_use" and block.name == "guardar_datos_certificado":
            return dict(block.input)

    logger.warning(
        "Claude no devolvió bloque tool_use; extracted_data queda vacío"
    )
    return {}
