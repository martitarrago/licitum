"""Worker de ingestión del feed ATOM de la PLACSP.

Flujo:
  1. Descarga el feed ATOM de la PLACSP (licitaciones recientes).
  2. Parsea cada <entry> extrayendo expediente, título, organismo, importe,
     fechas, CPV, tipo de contrato y URL de detalle.
  3. Upsert en la tabla `licitaciones` (ON CONFLICT expediente DO UPDATE).
  4. Calcula semáforo básico: verde = obras dentro del rango de solvencia M3,
     amarillo = obras fuera de rango, rojo = no es obra, gris = sin datos.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from xml.etree import ElementTree as ET  # stdlib, no deps extra

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.models.licitacion import TIPO_CONTRATO_MAP, Licitacion

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

# URLs a probar en orden — la PLACSP ha cambiado de dominio varias veces
PLACSP_FEED_URLS = [
    "https://contrataciondelestado.es/sindicacion/sindicacion_1044/licitacionesRecientesPerfilesContratanteIntegracionOC.atom",
    "https://www.contrataciondelestado.es/sindicacion/sindicacion_1044/licitacionesRecientesPerfilesContratanteIntegracionOC.atom",
    "https://contrataciondelestado.es/sindicacion/sindicacion_1044/licitacionesPerfilesContratantePerfilesContratante.atom",
]
FEED_TIMEOUT_SECONDS = 60
EMPRESA_DEMO_ID = "00000000-0000-0000-0000-000000000001"

# Namespaces del feed ATOM de la PLACSP (UBL DGPE)
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "cbc": "urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2",
    # Algunos feeds usan el namespace UBL estándar
    "cbc2": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    "cac2": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
}


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------


@celery_app.task(name="workers.ingesta_placsp.ingestar_feed", bind=True)
def ingestar_feed(self) -> dict[str, int]:
    return asyncio.run(_ejecutar_ingesta())


# ---------------------------------------------------------------------------
# Orquestación async
# ---------------------------------------------------------------------------


async def _ejecutar_ingesta() -> dict[str, int]:
    logger.info("Ingestión PLACSP: iniciando descarga de feed")

    try:
        xml_bytes, feed_url = _descargar_feed()
        logger.info("Ingestión PLACSP: feed descargado desde %s (%d bytes)", feed_url, len(xml_bytes))
    except Exception as exc:
        logger.error("No se pudo descargar el feed PLACSP: %s", exc)
        raise

    entries = _parsear_feed(xml_bytes)
    logger.info("Ingestión PLACSP: %d entradas parseadas", len(entries))

    if not entries:
        return {"total": 0, "insertadas": 0, "actualizadas": 0}

    # Solvencia máxima de la empresa demo (para semáforo v1)
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)

    try:
        async with session_factory() as db:
            max_solvencia = await _obtener_max_solvencia(db)
            stats = await _upsert_licitaciones(db, entries, max_solvencia)
    finally:
        await engine.dispose()

    logger.info(
        "Ingestión PLACSP completada: %d insertadas, %d actualizadas de %d",
        stats["insertadas"],
        stats["actualizadas"],
        stats["total"],
    )
    return stats


# ---------------------------------------------------------------------------
# Descarga del feed
# ---------------------------------------------------------------------------


def _descargar_feed() -> tuple[bytes, str]:
    """Intenta cada URL de la lista hasta obtener una respuesta XML válida."""
    last_error: Exception | None = None
    with httpx.Client(timeout=FEED_TIMEOUT_SECONDS, follow_redirects=True) as client:
        for url in PLACSP_FEED_URLS:
            try:
                resp = client.get(
                    url,
                    headers={"Accept": "application/atom+xml, application/xml, */*"},
                )
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "")
                snippet = resp.content[:300].decode("utf-8", errors="replace")
                logger.info(
                    "Feed %s → status=%s content-type=%s primeros_bytes=%r",
                    url,
                    resp.status_code,
                    content_type,
                    snippet,
                )
                # Rechazar respuestas HTML (página de error o redirect a portal web)
                if "<!DOCTYPE" in snippet or "<html" in snippet.lower():
                    logger.warning("URL %s devolvió HTML, no XML — saltando", url)
                    continue
                # Eliminar BOM UTF-8 si está presente
                content = resp.content
                if content.startswith(b"\xef\xbb\xbf"):
                    content = content[3:]
                return content, url
            except httpx.HTTPStatusError as exc:
                logger.warning("URL %s → HTTP %s", url, exc.response.status_code)
                last_error = exc
            except Exception as exc:
                logger.warning("URL %s → error: %s", url, exc)
                last_error = exc

    raise RuntimeError(
        f"Ninguna URL del feed PLACSP devolvió XML válido. Último error: {last_error}"
    )


# ---------------------------------------------------------------------------
# Parsing del ATOM feed
# ---------------------------------------------------------------------------


def _txt(el: ET.Element | None, *paths: str, ns: dict = NS) -> str | None:
    """findtext con soporte de múltiples rutas alternativas."""
    if el is None:
        return None
    for path in paths:
        val = el.findtext(path, namespaces=ns)
        if val and val.strip():
            return val.strip()
    return None


def _parsear_feed(xml_bytes: bytes) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        snippet = xml_bytes[:500].decode("utf-8", errors="replace")
        logger.error("Error parseando XML del feed: %s — primeros 500 bytes: %r", exc, snippet)
        return []

    # Detectar namespace del feed raíz (ATOM estándar o sin namespace)
    tag = root.tag
    atom_ns = ""
    if tag.startswith("{"):
        atom_ns = tag[1 : tag.index("}")]

    ns = dict(NS)
    if atom_ns:
        ns["atom"] = atom_ns

    entries = root.findall("atom:entry", ns) or root.findall("entry")
    results = []
    for entry in entries:
        parsed = _parsear_entry(entry, ns)
        if parsed:
            results.append(parsed)
    return results


def _parsear_entry(entry: ET.Element, ns: dict) -> dict[str, Any] | None:
    # Expediente — campo obligatorio
    expediente = (
        _txt(entry, "cbc:ContractFolderID", ns=ns)
        or _txt(entry, "cbc2:ContractFolderID", ns=ns)
    )
    if not expediente:
        # Fallback: extraer del <id> de Atom
        id_text = _txt(entry, "atom:id", "id", ns=ns)
        if id_text and "idLicitacion=" in id_text:
            expediente = id_text.split("idLicitacion=")[-1].split("&")[0]
        elif id_text:
            expediente = id_text
        else:
            return None

    # Título
    titulo = (
        _txt(entry, "atom:title", "title", ns=ns)
        or _txt(entry, "cac:ProcurementProjectLot/cac:ProcurementProject/cbc:Name", ns=ns)
        or _txt(entry, "cac2:ProcurementProjectLot/cac2:ProcurementProject/cbc2:Name", ns=ns)
    )

    # URL PLACSP
    link_el = entry.find("atom:link", ns) or entry.find("link")
    url_placsp = link_el.get("href") if link_el is not None else None

    # Fecha publicación
    fecha_pub_str = _txt(entry, "atom:updated", "atom:published", "updated", "published", ns=ns)
    fecha_publicacion = _parse_datetime(fecha_pub_str)

    # Organismo
    organismo = (
        _txt(
            entry,
            "cac:LocatedContractingParty/cac:Party/cac:PartyName/cbc:Name",
            ns=ns,
        )
        or _txt(
            entry,
            "cac2:LocatedContractingParty/cac2:Party/cac2:PartyName/cbc2:Name",
            ns=ns,
        )
    )
    organismo_id = (
        _txt(
            entry,
            "cac:LocatedContractingParty/cac:Party/cac:PartyIdentification/cbc:ID",
            ns=ns,
        )
        or _txt(
            entry,
            "cac2:LocatedContractingParty/cac2:Party/cac2:PartyIdentification/cbc2:ID",
            ns=ns,
        )
    )

    # Importe (sin IVA preferido)
    lot = (
        entry.find("cac:ProcurementProjectLot", ns)
        or entry.find("cac2:ProcurementProjectLot", ns)
    )
    proyecto = None
    if lot is not None:
        proyecto = (
            lot.find("cac:ProcurementProject", ns)
            or lot.find("cac2:ProcurementProject", ns)
        )

    importe_sin_iva = _parse_decimal(
        _txt(proyecto, "cbc:BudgetAmount/cbc:TaxExclusiveAmount", ns=ns)
        or _txt(proyecto, "cbc2:BudgetAmount/cbc2:TaxExclusiveAmount", ns=ns)
    )
    importe_total = _parse_decimal(
        _txt(proyecto, "cbc:BudgetAmount/cbc:TotalAmount", ns=ns)
        or _txt(proyecto, "cbc2:BudgetAmount/cbc2:TotalAmount", ns=ns)
    )

    # Tipo de contrato
    tipo_code = (
        _txt(proyecto, "cbc:TypeCode", ns=ns)
        or _txt(proyecto, "cbc2:TypeCode", ns=ns)
    )
    tipo_contrato = TIPO_CONTRATO_MAP.get(tipo_code or "", None)

    # CPV
    cpv_el = (
        proyecto.find("cac:MainCommodityClassification", ns) if proyecto is not None else None
    ) or (
        proyecto.find("cac2:MainCommodityClassification", ns) if proyecto is not None else None
    )
    cpv_code = (
        _txt(cpv_el, "cbc:ItemClassificationCode", ns=ns)
        or _txt(cpv_el, "cbc2:ItemClassificationCode", ns=ns)
    )
    cpv_codes = [cpv_code] if cpv_code else []

    # Fecha límite
    proceso = (
        entry.find("cac:TenderingProcess", ns)
        or entry.find("cac2:TenderingProcess", ns)
    )
    deadline_date = _txt(
        proceso,
        "cac:TenderSubmissionDeadlinePeriod/cbc:EndDate",
        ns=ns,
    ) or _txt(
        proceso,
        "cac2:TenderSubmissionDeadlinePeriod/cbc2:EndDate",
        ns=ns,
    )
    deadline_time = _txt(
        proceso,
        "cac:TenderSubmissionDeadlinePeriod/cbc:EndTime",
        ns=ns,
    ) or _txt(
        proceso,
        "cac2:TenderSubmissionDeadlinePeriod/cbc2:EndTime",
        ns=ns,
    )
    fecha_limite = _parse_fecha_limite(deadline_date, deadline_time)

    return {
        "expediente": expediente[:512],
        "titulo": titulo[:2048] if titulo else None,
        "organismo": organismo[:512] if organismo else None,
        "organismo_id": organismo_id[:256] if organismo_id else None,
        "importe_licitacion": importe_sin_iva,
        "importe_presupuesto_base": importe_total,
        "fecha_publicacion": fecha_publicacion,
        "fecha_limite": fecha_limite,
        "cpv_codes": cpv_codes,
        "tipo_contrato": tipo_contrato,
        "url_placsp": url_placsp[:1024] if url_placsp else None,
        "raw_data": {
            "tipo_code": tipo_code,
            "cpv_raw": cpv_code,
            "importe_total_raw": str(importe_total) if importe_total else None,
        },
    }


# ---------------------------------------------------------------------------
# Upsert + semáforo
# ---------------------------------------------------------------------------


async def _obtener_max_solvencia(db: AsyncSession) -> Decimal | None:
    """Importe máximo de los certificados válidos de la empresa demo (para semáforo)."""
    from app.models.certificado_obra import CertificadoObra
    from app.core.enums import EstadoCertificado
    from sqlalchemy import func as sqlfunc
    import uuid

    empresa_id = uuid.UUID(EMPRESA_DEMO_ID)
    result = await db.execute(
        select(sqlfunc.max(CertificadoObra.importe_adjudicacion)).where(
            CertificadoObra.empresa_id == empresa_id,
            CertificadoObra.es_valido_solvencia.is_(True),
            CertificadoObra.deleted_at.is_(None),
        )
    )
    return result.scalar_one_or_none()


def _calcular_semaforo(
    tipo_contrato: str | None,
    importe: Decimal | None,
    max_solvencia: Decimal | None,
) -> tuple[str, str]:
    """Semáforo v1 — lógica simple basada en tipo y solvencia."""
    if tipo_contrato is None:
        return "gris", "Tipo de contrato desconocido"

    if tipo_contrato not in ("obras", "concesion_obras"):
        return "rojo", f"Tipo '{tipo_contrato}' fuera del alcance de obras"

    if importe is None:
        return "amarillo", "Obras sin importe publicado — verificar manualmente"

    if max_solvencia is None:
        return "amarillo", "Sin certificados de solvencia validados en M3"

    if importe <= max_solvencia:
        return "verde", f"Importe {importe:,.0f} € dentro del rango de solvencia ({max_solvencia:,.0f} €)"

    return "amarillo", (
        f"Importe {importe:,.0f} € supera la solvencia acreditada ({max_solvencia:,.0f} €)"
    )


async def _upsert_licitaciones(
    db: AsyncSession,
    entries: list[dict[str, Any]],
    max_solvencia: Decimal | None,
) -> dict[str, int]:
    now = datetime.now(tz=timezone.utc)
    insertadas = 0
    actualizadas = 0

    # Fetch expedientes ya existentes en un solo query
    expedientes = [e["expediente"] for e in entries]
    existing = set(
        (await db.execute(
            select(Licitacion.expediente).where(Licitacion.expediente.in_(expedientes))
        )).scalars().all()
    )

    for entry in entries:
        semaforo, razon = _calcular_semaforo(
            entry.get("tipo_contrato"),
            entry.get("importe_licitacion"),
            max_solvencia,
        )
        entry["semaforo"] = semaforo
        entry["semaforo_razon"] = razon
        entry["ingestado_at"] = now

        stmt = (
            pg_insert(Licitacion)
            .values(**entry)
            .on_conflict_do_update(
                index_elements=["expediente"],
                set_={
                    "titulo": entry["titulo"],
                    "organismo": entry["organismo"],
                    "organismo_id": entry["organismo_id"],
                    "importe_licitacion": entry["importe_licitacion"],
                    "importe_presupuesto_base": entry["importe_presupuesto_base"],
                    "fecha_publicacion": entry["fecha_publicacion"],
                    "fecha_limite": entry["fecha_limite"],
                    "cpv_codes": entry["cpv_codes"],
                    "tipo_contrato": entry["tipo_contrato"],
                    "url_placsp": entry["url_placsp"],
                    "semaforo": semaforo,
                    "semaforo_razon": razon,
                    "raw_data": entry["raw_data"],
                    "ingestado_at": now,
                },
            )
        )
        await db.execute(stmt)

        if entry["expediente"] in existing:
            actualizadas += 1
        else:
            insertadas += 1

    await db.commit()
    return {"total": len(entries), "insertadas": insertadas, "actualizadas": actualizadas}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(value.strip(), fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def _parse_fecha_limite(date_str: str | None, time_str: str | None) -> datetime | None:
    if not date_str:
        return None
    combined = f"{date_str.strip()}T{time_str.strip()}" if time_str else date_str.strip()
    return _parse_datetime(combined)


def _parse_decimal(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        return Decimal(value.strip().replace(",", "."))
    except InvalidOperation:
        return None
