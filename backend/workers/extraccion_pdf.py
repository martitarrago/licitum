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
CLAUDE_MAX_TOKENS = 2048
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
            "titulo": {
                "type": ["string", "null"],
                "description": (
                    "Título descriptivo corto de la obra (máx 80 caracteres), "
                    "p.ej. 'Pavimentación carrer Major, Reus' o "
                    "'Construcción piscina municipal Vilafranca'. "
                    "Extrae del objeto del contrato. Null si no aparece."
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

SYSTEM_PROMPT = """Eres un experto extractor de datos de documentos de obra pública española. \
Procesas certificados de obra, actas de recepción, certificados finales de obra, \
actas de comprobación del replanteo y documentos similares del sector de la construcción en España.

Tu única tarea es llamar a la herramienta guardar_datos_certificado con los datos extraídos.

## Guía de extracción por campo

**titulo**: Busca el objeto del contrato o descripción de la obra. Suele aparecer como:
- "Objeto: Construcción de...", "Obras de...", "Proyecto de..."
- En la portada o encabezado del documento
- Ejemplo: "Pavimentació i millora de voreres al carrer Major", "Construcción de piscina municipal"
- Máximo 80 caracteres. Si es demasiado largo, resume manteniendo lo esencial.

**organismo**: El contratante o promotor. Busca:
- Ayuntamientos: "Ajuntament de X", "Ayuntamiento de X"
- Diputaciones: "Diputació de X", "Diputación Provincial de X"
- Generalitat/Junta/Govern: "Generalitat de Catalunya", "Junta de Andalucía"
- Ministerios: "Ministerio de...", "Ministerio de Transportes..."
- Consorcios, mancomunidades, entidades públicas empresariales
- Puede estar en el membrete, pie de página o en la cláusula "El contratante"

**importe_adjudicacion**: El importe del contrato o de la obra ejecutada en euros.
- Busca: "importe de adjudicación", "precio del contrato", "importe de licitación", "importe de la obra"
- Si aparecen varios importes, prefiere "sin IVA" o "base imponible"
- Convierte a número sin puntos de miles: 1.234.567,89 → 1234567.89
- Si solo aparece con IVA y sabes que es 21%, puedes dividir entre 1.21

**fecha_inicio**: Fecha de inicio de la obra o firma del contrato.
- Busca: "fecha de inicio", "inicio de obra", "acta de comprobación del replanteo", "fecha de firma"
- Formato ISO: YYYY-MM-DD

**fecha_fin**: Fecha de finalización o recepción.
- Busca: "fecha de recepción", "acta de recepción", "fecha de terminación", "fecha de fin de obra"
- En actas de recepción, suele ser la fecha del propio documento
- Formato ISO: YYYY-MM-DD

**numero_expediente**: El número de expediente administrativo.
- Busca: "Exp. nº", "Expediente:", "Nº de contrato:", "Referencia:", "Clave:"
- Incluye el código completo tal como aparece

**cpv_codes**: Códigos de clasificación europea del contrato.
- Busca: "CPV", "código CPV", suelen estar en forma 45XXXXXX-X
- Si no aparecen códigos CPV pero sí el tipo de obra, puedes inferir:
  * Edificación general → 45210000
  * Carreteras/pavimentación → 45233000
  * Redes de agua/saneamiento → 45231300
  * Parques/jardines → 45112700
  * Instalaciones eléctricas → 45310000

**clasificacion_grupo y clasificacion_subgrupo**: Clasificación ROLECE/SICE.
- Busca: "clasificación", "grupo", "subgrupo", "categoría" en requisitos de solvencia
- Grupos principales: A (movimiento de tierras), B (puentes), C (edificación), D (ferroviarias),
  E (hidráulicas), F (marítimas), G (viales y pistas), H (transportes), I (instalaciones eléctricas),
  J (instalaciones mecánicas), K (especiales)

## Reglas estrictas
1. No inventes datos. Solo extrae lo que aparece literalmente en el texto.
2. Si un campo no está en el documento, devuelve null (array vacío para cpv_codes).
3. confianza_extraccion: 0.9+ si todo claro, 0.7-0.9 si algún campo inferido, 0.4-0.7 si texto parcial u OCR ruidoso, <0.4 si el documento es ilegible o no es un certificado de obra.
"""


@celery_app.task(
    name="workers.extraccion_pdf.extraer_certificado",
    bind=True,
)
def extraer_certificado(self, certificado_id: str) -> None:
    """Worker de extracción de datos del PDF de un certificado de obra.

    Flujo:
      1. pendiente_revision → procesando.
      2. Descarga el PDF, extrae texto (pdfplumber, con fallback OCR).
      3. Llama a Claude con structured output y escribe extracted_data.
      4. procesando → pendiente_revision (SIEMPRE; el usuario confirma después).

    Los errores se persisten en `extraction_error` para que el frontend pueda
    mostrarlos al usuario (sin retries silenciosos: si falla, falla una vez).
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
        cert.extraction_error = None
        await session.commit()

        error_msg: str | None = None
        try:
            pdf_bytes = await _descargar_pdf(cert.pdf_url)
            texto = _extraer_texto(pdf_bytes)
            datos = await _extraer_con_claude(texto)
            if not datos:
                error_msg = (
                    "Claude no devolvió datos estructurados. "
                    "Puede ser por ANTHROPIC_API_KEY ausente, límite de rate "
                    "o texto del PDF irrecuperable."
                )
            else:
                cert.extracted_data = datos
                # Actualiza campos del modelo con los valores extraídos
                if datos.get("titulo") and not cert.titulo:
                    cert.titulo = datos["titulo"][:512]
                if datos.get("organismo") and not cert.organismo:
                    cert.organismo = datos["organismo"][:255]
                logger.info(
                    "Certificado %s: extracción OK (confianza=%s)",
                    certificado_id,
                    datos.get("confianza_extraccion"),
                )
        except Exception as exc:  # noqa: BLE001
            error_msg = f"{type(exc).__name__}: {exc}"
            logger.exception(
                "Certificado %s: fallo de extracción — %s",
                certificado_id,
                error_msg,
            )
        finally:
            cert.estado = EstadoCertificado.pendiente_revision
            cert.extraction_error = error_msg
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
        raise RuntimeError("ANTHROPIC_API_KEY no está configurada en el entorno")

    if not texto.strip():
        raise RuntimeError(
            "No se pudo extraer texto del PDF (ni nativo ni OCR). "
            "Verifica que el PDF contenga texto legible."
        )

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

    raise RuntimeError(
        "Claude no devolvió un bloque tool_use con los datos estructurados"
    )
