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
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.celery_app import celery_app
from app.models.licitacion import Licitacion
from app.services.solvencia_evaluator import (
    LicitacionInput,
    SolvenciaEmpresa,
    cargar_solvencia_empresa,
    evaluar_semaforo,
)

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

# Mapeo NUTS3 (Cataluña) → provincia interna. ES51 (Cataluña entera) se
# expande a las 4 provincias para que cualquier filtro provincial lo capture.
# Mantener sincronizado con el backfill SQL de la migración 0008.
NUTS_PROVINCIA_MAP: dict[str, str] = {
    "ES511": "barcelona",
    "ES512": "girona",
    "ES513": "lleida",
    "ES514": "tarragona",
}
PROVINCIAS_CATALUNA = ["barcelona", "girona", "lleida", "tarragona"]


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
            solvencia = await cargar_solvencia_empresa(db, uuid.UUID(EMPRESA_DEMO_ID))
            logger.info(
                "Solvencia empresa demo: clasificaciones=%s, certificados=%s",
                solvencia.max_categoria_por_grupo,
                {g: float(v) for g, v in solvencia.max_solvencia_certificada_por_grupo.items()},
            )
            stats = await _upsert_licitaciones(db, uniq, solvencia)
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


def _extraer_provincias(codi_nuts: str | None) -> list[str]:
    """Convierte un valor de `codi_nuts` en un array ordenado de provincias.

    Casos cubiertos:
      - None / vacío → []
      - 'ES51' (Cataluña entera) → las 4 provincias
      - 'ES511' / 'ES512' / 'ES513' / 'ES514' → ['barcelona' | 'girona' | …]
      - Multi separado por '||' (p.ej. 'ES511||ES513') → ['barcelona','lleida']
      - Cualquier otro código (ES, AD, ES523…) → []
    """
    if not codi_nuts:
        return []
    if codi_nuts == "ES51":
        return list(PROVINCIAS_CATALUNA)
    provincias = {
        prov
        for code in codi_nuts.split("||")
        if (prov := NUTS_PROVINCIA_MAP.get(code.strip())) is not None
    }
    return sorted(provincias)


def _extraer_tipo_organismo(organismo: str | None) -> str | None:
    """Clasifica el organismo en una de las 6 categorías por nombre.

    Heurística por prefijo/contenido, primer match gana. Mantener idéntico
    al CASE del backfill SQL en migración 0008.
    """
    if not organismo:
        return None
    n = organismo.strip()
    nl = n.lower()
    if nl.startswith("ajuntament"):
        return "ayuntamiento"
    if "diputació" in nl:
        return "diputacio"
    if "consell comarcal" in nl:
        return "consell_comarcal"
    if "universitat" in nl:
        return "universidad"
    if (
        nl.startswith("generalitat")
        or nl.startswith("departament")
        or nl.startswith("servei català")
        or nl.startswith("institut català")
        or nl.startswith("agència catalana")
        or nl.startswith("ics")
    ):
        return "generalitat"
    return "otros"


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

    organismo_str = (organismo or "")[:512] if organismo else None
    codi_nuts = row.get("codi_nuts")

    return {
        "expediente": str(expediente)[:512],
        "titulo": (titulo or "")[:2048] if titulo else None,
        "organismo": organismo_str,
        "organismo_id": (organismo_id or "")[:256] if organismo_id else None,
        "importe_licitacion": importe_sin_iva,
        "importe_presupuesto_base": importe_con_iva,
        "fecha_publicacion": fecha_pub,
        "fecha_limite": fecha_limite,
        "cpv_codes": cpv_codes,
        "tipo_contrato": tipo_contrato,
        "tipo_procedimiento": procediment,
        "url_placsp": url_publicacio[:1024] if url_publicacio else None,
        "provincias": _extraer_provincias(codi_nuts),
        "tipo_organismo": _extraer_tipo_organismo(organismo_str),
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


async def _upsert_licitaciones(
    db: AsyncSession,
    entries: list[dict[str, Any]],
    solvencia: SolvenciaEmpresa,
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

    # Calcula semáforo (lógica completa CPV ↔ ROLECE) y enriquece cada entry.
    fallbacks_durada = 0
    obras_evaluadas = 0
    distribucion: dict[str, int] = {}
    for entry in entries:
        lic_input = LicitacionInput(
            tipo_contrato=entry.get("tipo_contrato"),
            importe=entry.get("importe_licitacion"),
            cpv_codes=entry.get("cpv_codes") or [],
            durada_text=(entry.get("raw_data") or {}).get("durada_contracte"),
        )
        ev = evaluar_semaforo(lic_input, solvencia)
        entry["semaforo"] = ev.semaforo
        entry["semaforo_razon"] = ev.razon
        entry["ingestado_at"] = now
        distribucion[ev.semaforo] = distribucion.get(ev.semaforo, 0) + 1
        if lic_input.tipo_contrato in ("obras", "concesion_obras"):
            obras_evaluadas += 1
            if ev.fallback_durada:
                fallbacks_durada += 1

    if obras_evaluadas:
        pct = 100 * fallbacks_durada / obras_evaluadas
        logger.info(
            "Semáforo obras: distribución=%s · fallback duración 1y aplicado en "
            "%d/%d obras (%.1f%%)",
            {k: distribucion.get(k, 0) for k in ("verde", "amarillo", "rojo", "gris")},
            fallbacks_durada,
            obras_evaluadas,
            pct,
        )

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
        "provincias",
        "tipo_organismo",
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
