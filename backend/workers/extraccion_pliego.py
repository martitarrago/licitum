"""Worker M3 — extracción IA del PCAP de una licitación.

Reusa los 5 fixes críticos del worker M2 (NullPool, httpx síncrono para
descarga, AsyncAnthropic como context manager, --pool=solo, TypeDecorator
para el enum estado).

Flujo:
  1. pendiente → procesando.
  2. Descarga PDF de R2 (URL pública) → texto vía pdfplumber (fallback OCR).
  3. Llama a Claude con tool_use y schema PLIEGO_EXTRACTION_TOOL.
  4. Persiste extracted_data + idioma_detectado + confianza_global.
  5. procesando → completado (o fallido si excepción).

Cache global por licitación: una fila por `licitacion_id`. La recomendación
ir/no ir se calcula on-the-fly cruzando con M2; no se persiste.
"""
from __future__ import annotations

import asyncio
import io
import logging
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

import httpx
import pdfplumber
from anthropic import AsyncAnthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.core.enums import EstadoAnalisisPliego
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA
from app.models.licitacion_score_empresa import LicitacionScoreEmpresa

logger = logging.getLogger(__name__)

NATIVE_TEXT_MIN_CHARS = 200
CLAUDE_MODEL = "claude-sonnet-4-6"
CLAUDE_MAX_TOKENS = 4096
PDF_DOWNLOAD_TIMEOUT_SECONDS = 90  # PCAPs pueden ser grandes (>10 MB)

# Cota de texto enviado a Claude. Los PCAPs pueden tener 80+ páginas; con
# ~3K caracteres por página, 200K caracteres son ~65-70 páginas, suficientes
# para los apartados clave (importes, plazos, criterios). Si el PDF es más
# largo se trunca y se anota en el log — para pliegos extraordinariamente
# largos se podría hacer chunking, pero está fuera del MVP.
MAX_TEXT_CHARS = 200_000


PLIEGO_EXTRACTION_TOOL: dict = {
    "name": "guardar_pliego_extraido",
    "description": (
        "Guarda los datos estructurados extraídos del Pliego de Cláusulas "
        "Administrativas Particulares (PCAP) de una licitación pública española. "
        "Si un campo no aparece, devuelve null. NUNCA inventes datos."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            # ── Económico ──────────────────────────────────────────────────
            "presupuesto_base_sin_iva": {
                "type": ["number", "null"],
                "description": "Presupuesto base de licitación SIN IVA en euros.",
            },
            "iva_porcentaje": {
                "type": ["number", "null"],
                "description": "Tipo de IVA aplicable (típico 21 para obras).",
            },
            "valor_estimado_contrato": {
                "type": ["number", "null"],
                "description": "Valor estimado total del contrato (incluye prórrogas si las hay), en euros sin IVA.",
            },
            # ── Plazo ──────────────────────────────────────────────────────
            "plazo_ejecucion_meses": {
                "type": ["integer", "null"],
                "description": "Plazo total de ejecución en MESES. Convierte: '1 año' → 12, '120 días' → 4, '6 mesos' → 6.",
            },
            "fecha_limite_presentacion": {
                "type": ["string", "null"],
                "description": "Fecha límite para presentar ofertas, formato ISO YYYY-MM-DD.",
            },
            "fecha_apertura_sobres": {
                "type": ["string", "null"],
                "description": "Fecha de apertura de sobres por la mesa de contratación, formato ISO YYYY-MM-DD.",
            },
            "fecha_visita_obra": {
                "type": ["string", "null"],
                "description": "Fecha de visita obligatoria a obra, formato ISO. Null si no aplica.",
            },
            # ── Solvencia exigida ──────────────────────────────────────────
            "clasificacion_grupo": {
                "type": ["string", "null"],
                "description": "Letra del grupo ROLECE exigido (A-K). Null si no exige clasificación.",
            },
            "clasificacion_subgrupo": {
                "type": ["string", "null"],
                "description": "Subgrupo numérico (ej: '4'). Null si exige solo a nivel grupo o no exige clasificación.",
            },
            "clasificacion_categoria": {
                "type": ["integer", "null"],
                "description": "Categoría 1-6 según importe. Null si no exige clasificación.",
            },
            "solvencia_economica_volumen_anual": {
                "type": ["number", "null"],
                "description": "Volumen anual de negocio mínimo exigido en euros (alternativa o adicional a la clasificación).",
            },
            "solvencia_tecnica_obras_similares_importe": {
                "type": ["number", "null"],
                "description": "Importe mínimo de obras similares ejecutadas en años anteriores, en euros.",
            },
            "solvencia_tecnica_anos_referencia": {
                "type": ["integer", "null"],
                "description": "Años de referencia para acreditar obras similares (típico 5).",
            },
            "solvencia_tecnica_numero_obras": {
                "type": ["integer", "null"],
                "description": "Número mínimo de obras similares exigidas. Null si no se especifica.",
            },
            # ── Valoración ─────────────────────────────────────────────────
            "formula_economica_extracto": {
                "type": ["string", "null"],
                "description": (
                    "Extracto LITERAL de la cláusula que define la fórmula de valoración "
                    "de la oferta económica. NUNCA parafrasees. Copia la cláusula exacta "
                    "(puede tener varios párrafos). Idioma original (es/ca)."
                ),
            },
            "formula_tipo": {
                "type": "string",
                "enum": [
                    "lineal",
                    "proporcional_inversa",
                    "lineal_con_saciedad",
                    "cuadratica",
                    "otra",
                    "no_detectado",
                ],
                "description": (
                    "Patrón identificado: 'lineal' = puntos = (oferta_min/oferta_propia)*max; "
                    "'proporcional_inversa' = ajustada por baja media; 'lineal_con_saciedad' = "
                    "lineal hasta umbral después constante; 'cuadratica'; 'otra' si no encaja; "
                    "'no_detectado' si la fórmula no se identifica con claridad."
                ),
            },
            "pct_criterios_subjetivos": {
                "type": ["integer", "null"],
                "description": "% de puntos asignados a criterios subjetivos (juicio de valor) sobre 100.",
            },
            "pct_criterios_objetivos": {
                "type": ["integer", "null"],
                "description": "% de puntos asignados a criterios objetivos (fórmula automática) sobre 100.",
            },
            "baja_temeraria_extracto": {
                "type": ["string", "null"],
                "description": (
                    "Extracto LITERAL de la cláusula que define el umbral de baja temeraria "
                    "(ofertas anormalmente bajas o desproporcionadas). NUNCA parafrasees."
                ),
            },
            "umbral_saciedad_pct": {
                "type": ["number", "null"],
                "description": "% de baja a partir del cual la puntuación económica deja de aumentar. Null si no hay.",
            },
            "mejoras_descripcion": {
                "type": ["string", "null"],
                "description": "Resumen breve (1-3 frases) de las mejoras valorables que el licitador puede ofrecer.",
            },
            # ── Garantías ──────────────────────────────────────────────────
            "garantia_provisional_pct": {
                "type": ["number", "null"],
                "description": "% de garantía provisional sobre presupuesto base. Null si no exige.",
            },
            "garantia_definitiva_pct": {
                "type": ["number", "null"],
                "description": "% de garantía definitiva sobre el importe de adjudicación. Típico 5.",
            },
            # ── Sobre A (documentación administrativa) ────────────────────
            "docs_extra_sobre_a": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Lista de documentos NO ESTÁNDAR exigidos en el Sobre A "
                    "(declaración LISMI, código ético del organismo, compromiso de "
                    "adscripción de medios, memoria de criterios sociales/ambientales, etc.). "
                    "Array vacío si solo pide DEUC + declaración responsable estándar."
                ),
            },
            # ── Banderas rojas ─────────────────────────────────────────────
            "banderas_rojas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "tipo": {
                            "type": "string",
                            "enum": [
                                "plazo_corto",
                                "presupuesto_bajo",
                                "criterios_ambiguos",
                                "mejoras_dirigidas",
                                "solvencia_alta",
                                "visita_urgente",
                                "otra",
                            ],
                        },
                        "descripcion": {
                            "type": "string",
                            "description": "Descripción concreta en castellano (1 frase), independientemente del idioma del PCAP.",
                        },
                    },
                    "required": ["tipo", "descripcion"],
                },
                "description": (
                    "Detecta señales de riesgo: plazo de presentación <15 días naturales; "
                    "presupuesto bajo respecto al alcance descrito (juicio profesional); "
                    "criterios subjetivos redactados de forma vaga; mejoras tan específicas que "
                    "sugieren contrato dirigido; solvencia desproporcionada al importe; visita "
                    "obligatoria con plazo escaso (<5 días). Array vacío si todo limpio."
                ),
            },
            # ── Resumen ────────────────────────────────────────────────────
            "resumen_ejecutivo": {
                "type": "string",
                "description": (
                    "Un párrafo (3-5 frases) en el idioma del PCAP con contexto, lo más "
                    "relevante y los riesgos. Tono editorial, directo. NO mencionar campos "
                    "ausentes."
                ),
            },
            "idioma_detectado": {
                "type": "string",
                "enum": ["es", "ca"],
                "description": "'es' si el PCAP está en castellano, 'ca' si en catalán.",
            },
            "confianza_global": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": (
                    "Tu propia estimación de la fiabilidad de la extracción global. 0.9+ si "
                    "todos los campos clave aparecen claros; 0.7-0.9 si algunos inferidos; "
                    "0.4-0.7 si OCR ruidoso o faltan secciones; <0.4 si ilegible."
                ),
            },
        },
        "required": [
            "formula_tipo",
            "docs_extra_sobre_a",
            "banderas_rojas",
            "resumen_ejecutivo",
            "idioma_detectado",
            "confianza_global",
        ],
    },
}


SYSTEM_PROMPT = """Eres un experto extractor de datos de Pliegos de Cláusulas Administrativas Particulares (PCAP) de licitaciones públicas españolas, especialmente catalanas. Procesas documentos en castellano y en catalán indistintamente.

Tu única tarea es llamar a la herramienta guardar_pliego_extraido con los datos del documento.

## Reglas críticas

1. **Extractos LITERALES** para `formula_economica_extracto` y `baja_temeraria_extracto`. NUNCA parafrasees: copia y pega la cláusula tal como aparece. El cliente necesita el texto original para verificar y, si fuera el caso, disputar la valoración.
2. Si un campo no aparece en el documento, devuelve null. No inventes ni rellenes con valores típicos.
3. `formula_tipo`: lee el extracto literal y clasifica el patrón. Si no logras identificarlo claramente, usa "no_detectado". No fuerces.
4. `banderas_rojas`: aplica criterios objetivos:
   - `plazo_corto`: <15 días naturales entre publicación y fecha límite de presentación
   - `presupuesto_bajo`: el presupuesto parece bajo en relación al alcance descrito en el PPT/objeto (juicio profesional)
   - `criterios_ambiguos`: criterios subjetivos sin baremo claro o redactados vagamente
   - `mejoras_dirigidas`: mejoras tan específicas que apuntan a una empresa concreta
   - `solvencia_alta`: clasificación o volumen exigidos desproporcionados al importe del contrato
   - `visita_urgente`: visita a obra obligatoria con margen <5 días respecto a la fecha límite
5. `resumen_ejecutivo`: SIEMPRE en castellano, independientemente del idioma del PCAP. 3-4 frases máximo. Describe el objeto del contrato, el alcance real del trabajo y cualquier condición inusual o exigencia especial que defina esta licitación. NO repitas datos numéricos ya capturados en otros campos (importes, fechas, clasificaciones). NO menciones campos faltantes. Tono editorial, directo.
6. `idioma_detectado`: 'es' o 'ca'. Si dudas, mira el encabezado oficial.
7. Para fechas, usa formato ISO YYYY-MM-DD. Si solo aparece la fecha sin hora, usa solo la fecha.
8. Para importes, número decimal sin separadores de miles: '1.234.567,89' → 1234567.89.

## Glosario rápido catalán → castellano

- "termini d'execució" = plazo de ejecución
- "pressupost de licitació" / "pressupost base" = presupuesto base de licitación
- "valor estimat del contracte" = valor estimado del contrato
- "data límit de presentació d'ofertes" = fecha límite de presentación de ofertas
- "obertura de pliques" / "obertura de sobres" = apertura de sobres
- "ofertes anormalment baixes" / "ofertes desproporcionades" / "baixa temerària" = baja temeraria
- "garantia provisional/definitiva" = garantía provisional/definitiva
- "criteris subjectius/objectius" / "criteris de judici de valor" = criterios subjetivos/objetivos
- "millores" = mejoras
- "classificació empresarial" = clasificación empresarial
- "solvència econòmica/tècnica" = solvencia económica/técnica
- "volum anual de negoci" = volumen anual de negocio
"""


@celery_app.task(name="workers.extraccion_pliego.extraer_pliego", bind=True)
def extraer_pliego(self, licitacion_id: str) -> None:
    """Extrae datos del PCAP cargado para una licitación.

    Igual que el worker M2: estado pendiente → procesando → completado/fallido,
    error_mensaje persistido para mostrar al usuario.
    """
    asyncio.run(_ejecutar(UUID(licitacion_id)))


@celery_app.task(name="workers.extraccion_pliego.extraer_pliego_desde_pscp", bind=True)
def extraer_pliego_desde_pscp(self, licitacion_id: str) -> None:
    """Phase 2 B1 — descubre el PCAP/PPT en PSCP y dispara la extracción.

    Crea o resetea `licitacion_analisis_ia` con `pdf_url` apuntando a la URL
    pública de descarga directa (`/portal-api/descarrega-document/{id}/{hash}`).
    Reutiliza todo el pipeline existente — el worker `extraer_pliego` ya sabe
    descargar de cualquier URL HTTPS pública.

    Estados resultantes:
      - documento_no_disponible: el expediente PSCP no expone PCAP/PPT
        accesible (falta url_placsp, num inválido, JSON sin pliegos).
      - completado / fallido: igual que upload manual.
    """
    asyncio.run(_ejecutar_desde_pscp(UUID(licitacion_id)))


async def _ejecutar_desde_pscp(licitacion_id: UUID) -> None:
    """Descubre PCAP (+ PPT si existe) en PSCP y ejecuta extracción concatenada.

    Phase 2 B1.1: PCAP siempre + PPT (Plec Tècnic) opcional concatenado en una
    sola llamada Claude. El PPT en obras públicas suele incluir criterios
    técnicos puntuables y solvencia técnica detallada que el PCAP referencia.

    Cierra el bucle del Phase 2 B1: cuando termina, el cron de scoring (B2)
    re-scoreará automáticamente al detectar la fila completada.
    """
    from app.services.pscp_attachment_downloader import (
        PscpDocumentNotFoundError,
        descubrir_documentos_pliego,
    )

    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    docs_info: list[dict] = []
    try:
        async with session_factory() as session:
            # Upsert análisis pendiente
            analisis = await session.scalar(
                select(LicitacionAnalisisIA).where(
                    LicitacionAnalisisIA.licitacion_id == licitacion_id
                )
            )
            if analisis is None:
                analisis = LicitacionAnalisisIA(
                    licitacion_id=licitacion_id,
                    estado=EstadoAnalisisPliego.pendiente,
                    extracted_data={},
                )
                session.add(analisis)
                await session.commit()
                await session.refresh(analisis)

            # Descubrir docs PSCP (PCAP + PPT si existe)
            try:
                docs_info = await descubrir_documentos_pliego(session, licitacion_id)
            except PscpDocumentNotFoundError as e:
                # Estado fallido con prefijo DOCUMENTO_NO_DISPONIBLE: que el
                # frontend distingue del fallido genérico (mvp sin migrar enum).
                analisis.estado = EstadoAnalisisPliego.fallido
                analisis.error_mensaje = f"DOCUMENTO_NO_DISPONIBLE: {e}"
                await session.commit()
                logger.info(
                    "Pliego %s: documento no disponible en PSCP — %s",
                    licitacion_id, e,
                )
                return

            # `pdf_url` apunta al PCAP — la UI lo usa para enlazar al PDF
            # original. Los PDFs adicionales (PPT) se descargan en runtime.
            analisis.pdf_url = docs_info[0]["url"]
            analisis.estado = EstadoAnalisisPliego.pendiente
            analisis.error_mensaje = None
            await session.commit()

    finally:
        await engine.dispose()

    # Ejecutar extracción con todas las URLs descubiertas (concatena texto)
    urls_extra = [d["url"] for d in docs_info[1:]]  # PPT y siguientes
    titulos = [d["titol"] for d in docs_info]
    await _ejecutar(licitacion_id, urls_extra=urls_extra, titulos_concatenados=titulos)


async def _ejecutar(
    licitacion_id: UUID,
    urls_extra: list[str] | None = None,
    titulos_concatenados: list[str] | None = None,
) -> None:
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    try:
        async with session_factory() as session:
            analisis = await session.scalar(
                select(LicitacionAnalisisIA).where(
                    LicitacionAnalisisIA.licitacion_id == licitacion_id
                )
            )
            if analisis is None:
                logger.warning(
                    "Pliego analisis %s no encontrado; aborto", licitacion_id
                )
                return
            if not analisis.pdf_url:
                analisis.estado = EstadoAnalisisPliego.fallido
                analisis.error_mensaje = "No hay PDF asociado al análisis"
                await session.commit()
                return

            analisis.estado = EstadoAnalisisPliego.procesando
            analisis.error_mensaje = None
            await session.commit()

            error_msg: str | None = None
            try:
                # B1.1: si hay urls_extra (PPT u otros), descargar todos y
                # concatenar texto en orden con marcadores de sección.
                # El PCAP es siempre primero (analisis.pdf_url).
                urls_to_fetch: list[str] = [analisis.pdf_url]
                if urls_extra:
                    urls_to_fetch.extend(urls_extra)
                titulos = titulos_concatenados or []

                fragments: list[str] = []
                for idx, url in enumerate(urls_to_fetch):
                    pdf_bytes = _descargar_pdf(url)
                    text_doc = _extraer_texto(pdf_bytes)
                    titulo = (
                        titulos[idx] if idx < len(titulos)
                        else f"DOCUMENTO {idx + 1}"
                    )
                    marker = (
                        "=== INICIO PCAP (Plec Cláusulas Administratives) ==="
                        if idx == 0
                        else f"=== INICIO {titulo} ==="
                    )
                    fragments.append(f"{marker}\n{text_doc}\n=== FIN {titulo} ===")

                texto = "\n\n".join(fragments)
                if len(texto) > MAX_TEXT_CHARS:
                    logger.warning(
                        "Pliego %s: texto truncado de %d a %d chars (%d docs)",
                        licitacion_id, len(texto), MAX_TEXT_CHARS, len(urls_to_fetch),
                    )
                    texto = texto[:MAX_TEXT_CHARS]
                datos = await _extraer_con_claude(texto)
                if not datos:
                    error_msg = "Claude no devolvió datos estructurados"
                else:
                    analisis.extracted_data = datos
                    analisis.idioma_detectado = datos.get("idioma_detectado")
                    confianza = datos.get("confianza_global")
                    if confianza is not None:
                        try:
                            analisis.confianza_global = Decimal(str(confianza))
                        except (ValueError, ArithmeticError):
                            analisis.confianza_global = None
                    analisis.procesado_at = datetime.now(tz=timezone.utc)
                    logger.info(
                        "Pliego %s: extracción OK (idioma=%s, confianza=%s, banderas=%d)",
                        licitacion_id,
                        datos.get("idioma_detectado"),
                        confianza,
                        len(datos.get("banderas_rojas", []) or []),
                    )
            except Exception as exc:  # noqa: BLE001
                error_msg = f"{type(exc).__name__}: {exc}"
                logger.exception(
                    "Pliego %s: fallo de extracción — %s", licitacion_id, error_msg
                )
            finally:
                analisis.estado = (
                    EstadoAnalisisPliego.completado
                    if error_msg is None
                    else EstadoAnalisisPliego.fallido
                )
                analisis.error_mensaje = error_msg
                await session.commit()

                # Si la extracción fue OK, recalcular scores de las empresas
                # que ya tenían score para esta licitación — el pliego puede
                # cambiar el veredicto (hard_filter_pliego) de forma inmediata.
                if error_msg is None:
                    rows = (await session.execute(
                        select(LicitacionScoreEmpresa.empresa_id).where(
                            LicitacionScoreEmpresa.licitacion_id == licitacion_id
                        )
                    )).scalars().all()
                    for empresa_id in rows:
                        celery_app.send_task(
                            "workers.intel_scores.calcular_para_empresa",
                            args=[str(empresa_id)],
                            kwargs={"force": True},
                        )
                    if rows:
                        logger.info(
                            "Pliego %s completado — encolado recálculo scores para %d empresa(s)",
                            licitacion_id, len(rows),
                        )
    finally:
        await engine.dispose()


def _descargar_pdf(url: str) -> bytes:
    with httpx.Client(timeout=PDF_DOWNLOAD_TIMEOUT_SECONDS) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.content


def _extraer_texto(pdf_bytes: bytes) -> str:
    nativo = _extraer_texto_nativo(pdf_bytes)
    if len(nativo) >= NATIVE_TEXT_MIN_CHARS:
        return nativo
    logger.info("Texto nativo insuficiente (%d chars); cayendo a OCR", len(nativo))
    try:
        return _extraer_texto_ocr(pdf_bytes)
    except Exception as e:
        # OCR puede fallar por poppler/tesseract no instalados (típico
        # en local sin setup completo) o por PDFs corruptos. Si hay algo
        # de texto nativo, usarlo aunque sea corto — Claude verá poco
        # contexto y devolverá confianza_global baja, mejor que fallido
        # duro. Si nativo=0, propagar para que el caller marque fallido
        # con mensaje claro al usuario.
        logger.warning("OCR no disponible (%s)", e)
        if nativo:
            logger.info("Devolviendo texto nativo de %d chars sin OCR", len(nativo))
            return nativo
        raise RuntimeError(
            "PDF escaneado sin texto nativo y OCR no disponible "
            "(poppler/tesseract). En local Windows instalar poppler-windows "
            "y añadir bin/ al PATH; Railway lo tiene preinstalado."
        ) from e


def _extraer_texto_nativo(pdf_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        paginas = [page.extract_text() or "" for page in pdf.pages]
    return "\n\n".join(paginas).strip()


def _extraer_texto_ocr(pdf_bytes: bytes) -> str:
    import sys

    import pytesseract
    from pdf2image import convert_from_bytes

    if sys.platform == "win32":
        pytesseract.pytesseract.tesseract_cmd = (
            r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        )

    imagenes = convert_from_bytes(pdf_bytes, dpi=200)
    # Para pliegos catalanes preferimos español + catalán a la vez
    textos = [pytesseract.image_to_string(img, lang="spa+cat") for img in imagenes]
    return "\n\n".join(textos).strip()


async def _extraer_con_claude(texto: str) -> dict:
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY no está configurada en el entorno")
    if not texto.strip():
        raise RuntimeError(
            "No se pudo extraer texto del PDF (ni nativo ni OCR). "
            "Verifica que el PDF contenga texto legible."
        )

    async with AsyncAnthropic(api_key=settings.anthropic_api_key) as client:
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
            tools=[{**PLIEGO_EXTRACTION_TOOL, "cache_control": {"type": "ephemeral"}}],
            tool_choice={"type": "tool", "name": "guardar_pliego_extraido"},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "A continuación el texto extraído del Pliego de Cláusulas "
                        "Administrativas Particulares. Extrae los datos llamando a la "
                        "herramienta.\n\n---INICIO DEL DOCUMENTO---\n"
                        f"{texto}\n"
                        "---FIN DEL DOCUMENTO---"
                    ),
                }
            ],
        )

    for block in respuesta.content:
        if getattr(block, "type", None) == "tool_use" and block.name == PLIEGO_EXTRACTION_TOOL["name"]:
            return dict(block.input)
    return {}
