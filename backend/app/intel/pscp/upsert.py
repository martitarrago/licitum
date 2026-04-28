"""Upsert idempotente con detección de cambio real.

Spec: docs/data-science/architecture.md sección 5.3 (lógica de upsert).

Por cada registro de Socrata:
  1. Calcular content_hash sobre KEY_FIELDS_FOR_HASH.
  2. SELECT existing por socrata_row_id.
  3. Si no existe → INSERT, updated_at = NOW().
  4. Si existe y hash igual → UPDATE solo last_seen_at.
  5. Si existe y hash distinto → UPDATE TODO + updated_at = NOW().
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.intel.pscp.hashing import compute_content_hash
from app.intel.pscp.normalize import explode_ute, normalize_cif
from app.intel.pscp.parsers import (
    parse_bool_si_no,
    parse_datetime,
    parse_decimal,
    parse_first_amount,
    parse_int,
)
from app.models.pscp import PscpAdjudicacion, PscpAdjudicacionEmpresa, PscpEmpresa

logger = logging.getLogger(__name__)


@dataclass
class UpsertStats:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    empresas_inserted: int = 0


def _record_to_columns(rec: dict[str, Any], content_hash: str) -> dict[str, Any]:
    """Mapea un registro PSCP crudo a columnas de pscp_adjudicacion.

    NO incluye id (lo asigna el server_default) ni los GENERATED columns.
    """
    return {
        "socrata_row_id": rec.get(":id") or rec.get("socrata_row_id") or "",
        "codi_expedient": rec.get("codi_expedient") or "",
        "numero_lot": rec.get("numero_lot"),
        "codi_ambit": rec.get("codi_ambit"),
        "nom_ambit": rec.get("nom_ambit"),
        "codi_departament_ens": rec.get("codi_departament_ens"),
        "nom_departament_ens": rec.get("nom_departament_ens"),
        "codi_organ": rec.get("codi_organ") or "",
        "nom_organ": rec.get("nom_organ") or "",
        "codi_unitat": rec.get("codi_unitat"),
        "nom_unitat": rec.get("nom_unitat"),
        "codi_dir3": rec.get("codi_dir3"),
        "codi_ine10": rec.get("codi_ine10"),
        "tipus_contracte": rec.get("tipus_contracte"),
        "procediment": rec.get("procediment"),
        "tipus_tramitacio": rec.get("tipus_tramitacio"),
        "fase_publicacio": rec.get("fase_publicacio"),
        "resultat": rec.get("resultat"),
        "es_agregada": parse_bool_si_no(rec.get("es_agregada")),
        "racionalitzacio_contractacio": rec.get("racionalitzacio_contractacio"),
        "tipus_financament": rec.get("tipus_financament"),
        "denominacio": rec.get("denominacio"),
        "objecte_contracte": rec.get("objecte_contracte"),
        "descripcio_lot": rec.get("descripcio_lot"),
        "codi_cpv": rec.get("codi_cpv"),
        "lloc_execucio": rec.get("lloc_execucio"),
        "codi_nuts": rec.get("codi_nuts"),
        "valor_estimat_contracte": parse_decimal(rec.get("valor_estimat_contracte")),
        "valor_estimat_expedient": parse_decimal(rec.get("valor_estimat_expedient")),
        "pressupost_licitacio_sense": parse_decimal(rec.get("pressupost_licitacio_sense")),
        "pressupost_licitacio_sense_1": parse_decimal(rec.get("pressupost_licitacio_sense_1")),
        "pressupost_licitacio_amb": parse_decimal(rec.get("pressupost_licitacio_amb")),
        "pressupost_licitacio_amb_1": parse_decimal(rec.get("pressupost_licitacio_amb_1")),
        "import_adjudicacio_sense_raw": rec.get("import_adjudicacio_sense"),
        "import_adjudicacio_amb_iva_raw": rec.get("import_adjudicacio_amb_iva"),
        "import_adjudicacio_sense": parse_first_amount(rec.get("import_adjudicacio_sense")),
        "import_adjudicacio_amb_iva": parse_first_amount(rec.get("import_adjudicacio_amb_iva")),
        "ofertes_rebudes": parse_int(rec.get("ofertes_rebudes")),
        "termini_presentacio_ofertes": parse_datetime(rec.get("termini_presentacio_ofertes")),
        "data_publicacio_futura": parse_datetime(rec.get("data_publicacio_futura")),
        "data_publicacio_previ": parse_datetime(rec.get("data_publicacio_previ")),
        "data_publicacio_anunci": parse_datetime(rec.get("data_publicacio_anunci")),
        "data_publicacio_adjudicacio": parse_datetime(rec.get("data_publicacio_adjudicacio")),
        "data_publicacio_formalitzacio": parse_datetime(rec.get("data_publicacio_formalitzacio")),
        "data_publicacio_anul": parse_datetime(rec.get("data_publicacio_anul")),
        "data_publicacio_consulta": parse_datetime(rec.get("data_publicacio_consulta")),
        "data_adjudicacio_contracte": parse_datetime(rec.get("data_adjudicacio_contracte")),
        "data_formalitzacio_contracte": parse_datetime(rec.get("data_formalitzacio_contracte")),
        "durada_contracte": rec.get("durada_contracte"),
        "enllac_publicacio": _extract_url(rec.get("enllac_publicacio")),
        "raw_record": rec,
        "content_hash": content_hash,
    }


def _extract_url(raw: Any) -> str | None:
    """Socrata devuelve URLs como dict {url, description}."""
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw.get("url")
    return str(raw)


async def _upsert_empresas(session: AsyncSession, raw_cif: str | None, raw_denom: str | None) -> list[tuple[str, int, str | None]]:
    """Asegura que cada empresa de la UTE existe en pscp_empresa.

    Devuelve [(cif_normalizado, posicio_ute, denominacio_raw)] para insertar
    en la tabla M:N.
    """
    explosions = explode_ute(raw_cif, raw_denom)
    if not explosions:
        return []

    rows: list[tuple[str, int, str | None]] = []
    for posicio, (norm, denom) in enumerate(explosions):
        # UPSERT empresa (idempotente)
        stmt = pg_insert(PscpEmpresa).values(
            cif=norm.cif,
            cif_raw_seen=[norm.raw_seen],
            denominacio_canonica=denom,
            nif_type=norm.nif_type,
            is_persona_fisica=norm.is_persona_fisica,
            is_anonimizada=norm.is_anonimizada,
            is_extranjera=norm.is_extranjera,
            checksum_valid=norm.checksum_valid,
        )
        # Si ya existe, actualizar last_seen_at + denominacio_canonica si es nueva
        stmt = stmt.on_conflict_do_update(
            index_elements=["cif"],
            set_={
                "last_seen_at": func.now(),
                "denominacio_canonica": stmt.excluded.denominacio_canonica,
            },
        )
        await session.execute(stmt)
        rows.append((norm.cif, posicio, denom))

    return rows


async def upsert_record(session: AsyncSession, rec: dict[str, Any]) -> str:
    """Upsert un registro PSCP. Devuelve uno de: 'inserted', 'updated', 'unchanged'."""
    socrata_id = rec.get(":id") or ""
    if not socrata_id:
        logger.warning("registro sin :id, skipping: %s", rec.get("codi_expedient"))
        return "unchanged"

    new_hash = compute_content_hash(rec)
    cols = _record_to_columns(rec, new_hash)

    # Buscar existente
    existing = await session.execute(
        select(
            PscpAdjudicacion.id,
            PscpAdjudicacion.content_hash,
        ).where(PscpAdjudicacion.socrata_row_id == socrata_id)
    )
    existing_row = existing.first()

    if existing_row is None:
        # INSERT nuevo
        stmt = pg_insert(PscpAdjudicacion).values(**cols)
        result = await session.execute(stmt.returning(PscpAdjudicacion.id))
        new_id = result.scalar_one()
        # Empresas + M:N
        empresa_rows = await _upsert_empresas(
            session,
            rec.get("identificacio_adjudicatari"),
            rec.get("denominacio_adjudicatari"),
        )
        for cif, posicio, denom in empresa_rows:
            await session.execute(
                pg_insert(PscpAdjudicacionEmpresa)
                .values(
                    adjudicacion_id=new_id,
                    cif=cif,
                    posicio_ute=posicio,
                    denominacio_raw=denom,
                )
                .on_conflict_do_nothing()
            )
        return "inserted"

    existing_id, existing_hash = existing_row
    if existing_hash == new_hash:
        # No real change — solo last_seen_at
        await session.execute(
            update(PscpAdjudicacion)
            .where(PscpAdjudicacion.id == existing_id)
            .values(last_seen_at=func.now(), raw_record=rec)
        )
        return "unchanged"

    # Cambio real — UPDATE TODO + updated_at
    cols_for_update = {k: v for k, v in cols.items() if k != "socrata_row_id"}
    cols_for_update["updated_at"] = func.now()
    cols_for_update["last_seen_at"] = func.now()
    await session.execute(
        update(PscpAdjudicacion)
        .where(PscpAdjudicacion.id == existing_id)
        .values(**cols_for_update)
    )

    # Re-sincronizar empresas (puede haber cambiado UTE)
    await session.execute(
        PscpAdjudicacionEmpresa.__table__.delete().where(
            PscpAdjudicacionEmpresa.adjudicacion_id == existing_id
        )
    )
    empresa_rows = await _upsert_empresas(
        session,
        rec.get("identificacio_adjudicatari"),
        rec.get("denominacio_adjudicatari"),
    )
    for cif, posicio, denom in empresa_rows:
        await session.execute(
            pg_insert(PscpAdjudicacionEmpresa)
            .values(
                adjudicacion_id=existing_id,
                cif=cif,
                posicio_ute=posicio,
                denominacio_raw=denom,
            )
            .on_conflict_do_nothing()
        )

    return "updated"


async def upsert_batch(session: AsyncSession, records: list[dict[str, Any]]) -> UpsertStats:
    """Upsert un batch. Commit es responsabilidad del caller."""
    stats = UpsertStats()
    for rec in records:
        result = await upsert_record(session, rec)
        if result == "inserted":
            stats.inserted += 1
        elif result == "updated":
            stats.updated += 1
        else:
            stats.unchanged += 1
    return stats
