"""Worker de ingestión de la Plataforma de Serveis de Contractació Pública (PSCP) de Catalunya.

Fuente: API Socrata del portal Open Data de la Generalitat
  https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json

Características del dataset (ybgg-dgi6):
  - ~1.78M registros históricos (cobertura desde 2023)
  - ~2400 licitaciones abiertas en cualquier momento
  - ~300 obras abiertas en cualquier momento (nuestro público objetivo)
  - Actualización diaria, sin autenticación
  - 54 campos estructurados por registro
  - SoQL para filtros: $where, $limit, $offset, $order

Flujo:
  1. Consulta Socrata con $where = fase='Anunci de licitació' AND termini > now.
  2. Pagina hasta agotar resultados (o MAX_PAGES × PAGE_SIZE de seguridad).
  3. Parsea cada fila a formato Licitacion.
  4. Upsert con ON CONFLICT expediente DO UPDATE.
  5. Calcula semáforo cruzando con solvencia M3 de la empresa demo.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.core.enums import EstadoCertificado
from app.models.certificado_obra import CertificadoObra
from app.models.licitacion import Licitacion

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

SOCRATA_ENDPOINT = "https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json"
FEED_TIMEOUT_SECONDS = 60
EMPRESA_DEMO_ID = "00000000-0000-0000-0000-000000000001"
PAGE_SIZE = 1000      # Máximo recomendado por Socrata sin app_token
MAX_PAGES = 20        # Tope de seguridad: 20 × 1000 = 20.000 registros por ingesta

# Mapeo de `tipus_contracte` (catalán) → código interno (consistente con TIPO_CONTRATO_MAP)
TIPO_CONTRATO_MAP_CAT: dict[str, str] = {
    "Obres": "obras",
    "Serveis": "servicios",
    "Subministraments": "suministros",
    "Concessió d'obres": "concesion_obras",
    "Concessió de serveis": "concesion_servicios",
    "Administratiu especial": "administrativo_especial",
    "Privat": "privado",
    "Contracte de serveis especials (annex IV)": "servicios_especiales",
    "Concessió de serveis especials (annex IV)": "concesion_servicios_especiales",
}


# ---------------------------------------------------------------------------
# Celery task
# ---------------------------------------------------------------------------


@celery_app.task(name="workers.ingesta_pscp.ingestar_feed", bind=True)
def ingestar_feed(self) -> dict[str, int]:
    return asyncio.run(_ejecutar_ingesta())


# ---------------------------------------------------------------------------
# Orquestación async
# ---------------------------------------------------------------------------


async def _ejecutar_ingesta() -> dict[str, int]:
    logger.info("Ingestión PSCP: iniciando consulta al dataset Socrata %s", SOCRATA_ENDPOINT)

    ahora_iso = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    where_clause = (
        f"fase_publicacio='Anunci de licitació' "
        f"AND termini_presentacio_ofertes > '{ahora_iso}'"
    )

    try:
        rows = _descargar_todas_las_paginas(where_clause)
    except Exception as exc:
        logger.error("No se pudo descargar el dataset PSCP: %s", exc)
        raise

    logger.info("Ingestión PSCP: %d registros obtenidos del API", len(rows))
    if not rows:
        return {"total": 0, "insertadas": 0, "actualizadas": 0}

    entries = [parsed for r in rows if (parsed := _parsear_row(r)) is not None]
    logger.info("Ingestión PSCP: %d registros parseados correctamente", len(entries))

    # Deduplica por expediente (quedarse con la primera aparición, que es la más reciente
    # gracias a $order=data_publicacio_anunci DESC)
    seen: set[str] = set()
    uniq: list[dict[str, Any]] = []
    for e in entries:
        if e["expediente"] in seen:
            continue
        seen.add(e["expediente"])
        uniq.append(e)
    if len(uniq) < len(entries):
        logger.info("Deduplicación: %d → %d registros únicos por expediente", len(entries), len(uniq))

    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )
    try:
        async with session_factory() as db:
            max_solvencia = await _obtener_max_solvencia(db)
            stats = await _upsert_licitaciones(db, uniq, max_solvencia)
    finally:
        await engine.dispose()

    logger.info(
        "Ingestión PSCP completada: %d insertadas, %d actualizadas de %d",
        stats["insertadas"],
        stats["actualizadas"],
        stats["total"],
    )
    return stats


# ---------------------------------------------------------------------------
# Descarga paginada del API Socrata
# ---------------------------------------------------------------------------


def _descargar_todas_las_paginas(where_clause: str) -> list[dict[str, Any]]:
    all_records: list[dict[str, Any]] = []
    with httpx.Client(timeout=FEED_TIMEOUT_SECONDS, follow_redirects=True) as client:
        for page in range(MAX_PAGES):
            offset = page * PAGE_SIZE
            params = {
                "$where": where_clause,
                "$limit": str(PAGE_SIZE),
                "$offset": str(offset),
                "$order": "data_publicacio_anunci DESC",
            }
            resp = client.get(
                SOCRATA_ENDPOINT,
                params=params,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                logger.info("Página %d vacía — fin de paginación", page)
                break
            all_records.extend(batch)
            logger.info(
                "Página %d: %d registros (acumulado: %d)", page, len(batch), len(all_records)
            )
            if len(batch) < PAGE_SIZE:
                break  # Última página parcial
    return all_records


# ---------------------------------------------------------------------------
# Parsing de fila Socrata → formato Licitacion
# ---------------------------------------------------------------------------


def _parsear_row(row: dict[str, Any]) -> dict[str, Any] | None:
    expediente = row.get("codi_expedient")
    if not expediente:
        return None

    titulo = row.get("denominacio") or row.get("objecte_contracte")
    organismo = row.get("nom_organ") or row.get("nom_departament_ens")
    organismo_id = row.get("codi_dir3") or row.get("codi_organ")

    # Los campos de presupuesto vienen como string, no "_iva" al final (truncados)
    importe_sin_iva = _parse_decimal(
        row.get("pressupost_licitacio_sense") or row.get("pressupost_licitacio_sense_iva")
    )
    importe_con_iva = _parse_decimal(
        row.get("pressupost_licitacio_amb") or row.get("pressupost_licitacio_amb_iva")
    )
    # Fallback: si no hay presupuesto pero sí valor estimado
    if importe_sin_iva is None:
        importe_sin_iva = _parse_decimal(row.get("valor_estimat_contracte"))

    fecha_pub = _parse_datetime(row.get("data_publicacio_anunci"))
    fecha_limite = _parse_datetime(row.get("termini_presentacio_ofertes"))

    tipo_cat = row.get("tipus_contracte")
    tipo_contrato = TIPO_CONTRATO_MAP_CAT.get(tipo_cat or "") if tipo_cat else None

    procediment = row.get("procediment")

    cpv = row.get("codi_cpv")
    cpv_codes = [cpv] if cpv else []

    enllac = row.get("enllac_publicacio")
    url_publicacio = enllac.get("url") if isinstance(enllac, dict) else None

    return {
        "expediente": str(expediente)[:512],
        "titulo": (titulo or "")[:2048] if titulo else None,
        "organismo": (organismo or "")[:512] if organismo else None,
        "organismo_id": (organismo_id or "")[:256] if organismo_id else None,
        "importe_licitacion": importe_sin_iva,
        "importe_presupuesto_base": importe_con_iva,
        "fecha_publicacion": fecha_pub,
        "fecha_limite": fecha_limite,
        "cpv_codes": cpv_codes,
        "tipo_contrato": tipo_contrato,
        "tipo_procedimiento": procediment,
        "url_placsp": url_publicacio[:1024] if url_publicacio else None,
        "raw_data": {
            "fuente": "pscp_cat",
            "tipus_contracte_cat": tipo_cat,
            "nom_ambit": row.get("nom_ambit"),
            "nom_departament_ens": row.get("nom_departament_ens"),
            "lloc_execucio": row.get("lloc_execucio"),
            "codi_nuts": row.get("codi_nuts"),
            "durada_contracte": row.get("durada_contracte"),
            "tipus_tramitacio": row.get("tipus_tramitacio"),
            "valor_estimat_contracte": row.get("valor_estimat_contracte"),
            "numero_lot": row.get("numero_lot"),
            "descripcio_lot": row.get("descripcio_lot"),
        },
    }


# ---------------------------------------------------------------------------
# Semáforo + upsert
# ---------------------------------------------------------------------------


async def _obtener_max_solvencia(db: AsyncSession) -> Decimal | None:
    """Importe máximo de certificados válidos de la empresa demo."""
    empresa_id = uuid.UUID(EMPRESA_DEMO_ID)
    result = await db.execute(
        select(func.max(CertificadoObra.importe_adjudicacion)).where(
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
    if tipo_contrato is None:
        return "gris", "Tipo de contrato no clasificado"
    if tipo_contrato not in ("obras", "concesion_obras"):
        return "rojo", f"Tipo '{tipo_contrato}' fuera del alcance de obras"
    if importe is None:
        return "amarillo", "Obras sin importe publicado — revisar manualmente"
    if max_solvencia is None:
        return "amarillo", "Sin certificados de solvencia validados en M3"
    if importe <= max_solvencia:
        return "verde", (
            f"Importe {importe:,.0f} € dentro del rango de solvencia "
            f"acreditada ({max_solvencia:,.0f} €)"
        )
    return "amarillo", (
        f"Importe {importe:,.0f} € supera la solvencia acreditada ({max_solvencia:,.0f} €)"
    )


async def _upsert_licitaciones(
    db: AsyncSession,
    entries: list[dict[str, Any]],
    max_solvencia: Decimal | None,
) -> dict[str, int]:
    """Upsert en batches de 500 filas — 1 round-trip por batch en vez de N por fila.

    Con 1.3K registros, reduce el tiempo de ~60s a ~1-2s.
    """
    now = datetime.now(tz=timezone.utc)
    expedientes = [e["expediente"] for e in entries]

    existing = set(
        (
            await db.execute(
                select(Licitacion.expediente).where(Licitacion.expediente.in_(expedientes))
            )
        )
        .scalars()
        .all()
    )

    # Calcula semáforo y enriquece cada entry
    for entry in entries:
        semaforo, razon = _calcular_semaforo(
            entry.get("tipo_contrato"),
            entry.get("importe_licitacion"),
            max_solvencia,
        )
        entry["semaforo"] = semaforo
        entry["semaforo_razon"] = razon
        entry["ingestado_at"] = now

    # Upsert bulk por batches
    BATCH = 500
    columns_to_update = [
        "titulo",
        "organismo",
        "organismo_id",
        "importe_licitacion",
        "importe_presupuesto_base",
        "fecha_publicacion",
        "fecha_limite",
        "cpv_codes",
        "tipo_contrato",
        "tipo_procedimiento",
        "url_placsp",
        "semaforo",
        "semaforo_razon",
        "raw_data",
        "ingestado_at",
    ]

    for i in range(0, len(entries), BATCH):
        chunk = entries[i : i + BATCH]
        stmt = pg_insert(Licitacion).values(chunk)
        set_ = {col: getattr(stmt.excluded, col) for col in columns_to_update}
        stmt = stmt.on_conflict_do_update(index_elements=["expediente"], set_=set_)
        await db.execute(stmt)
        logger.info("Upsert batch %d/%d: %d filas", i // BATCH + 1, (len(entries) + BATCH - 1) // BATCH, len(chunk))

    await db.commit()

    insertadas = sum(1 for e in entries if e["expediente"] not in existing)
    actualizadas = len(entries) - insertadas
    return {"total": len(entries), "insertadas": insertadas, "actualizadas": actualizadas}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    # Socrata devuelve calendar_date en formato "2026-04-24T10:00:00.000"
    value = value.strip().rstrip("Z")
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(value, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _parse_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value).strip().replace(",", "."))
    except (InvalidOperation, AttributeError):
        return None
