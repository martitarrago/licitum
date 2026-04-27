"""Servicio de sincronización con RELIC (Catalunya).

Fuente: dataset Socrata `t3wj-j4pu` en `analisi.transparenciacatalunya.cat`.
Ver `relic_socrata_dataset.md` en memoria del proyecto + sección "1. RELIC"
en `docs/modules/M2-empresa.md` para detalles.

Flujo:
  1. Recibe (empresa_id, n_registral)
  2. Consulta Socrata por n_registral → devuelve N filas (1 por clasificación)
  3. Upsert empresa_relic (1:1) + reemplaza todas sus clasificaciones_relic
"""
from __future__ import annotations

import logging
import re
from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clasificacion_relic import ClasificacionRelic
from app.models.empresa_relic import EmpresaRelic

logger = logging.getLogger(__name__)

RELIC_ENDPOINT = "https://analisi.transparenciacatalunya.cat/resource/t3wj-j4pu.json"
RELIC_TIMEOUT_SECONDS = 30
RELIC_MAX_ROWS = 200  # Cota generosa: el récord conocido (TARRACO) tiene ~21 filas

_SIGLES_PATTERN = re.compile(r"^([A-Z])(\d+)?$")
_CATEGORIA_PATTERN = re.compile(r"Categoria\s+(\d)", re.IGNORECASE)


class RelicNotFoundError(Exception):
    """Levantada cuando RELIC no devuelve ninguna fila para el n_registral."""


def parsear_sigles(sigles: str | None) -> tuple[str, str | None]:
    """Convierte 'C4' → ('C', '4'); 'C' → ('C', None).

    Levanta ValueError si el formato no es válido.
    """
    if not sigles:
        raise ValueError("sigles_cl vacío")
    sigles_norm = sigles.strip().upper()
    match = _SIGLES_PATTERN.match(sigles_norm)
    if not match:
        raise ValueError(f"sigles_cl con formato inesperado: {sigles!r}")
    grupo = match.group(1)
    subgrupo = match.group(2)
    return grupo, subgrupo


def parsear_categoria(texto: str | None) -> int | None:
    """Extrae el dígito de 'Categoria 6, si la seva quantia...' → 6.

    Devuelve None si no se encuentra.
    """
    if not texto:
        return None
    match = _CATEGORIA_PATTERN.search(texto)
    if not match:
        return None
    try:
        return int(match.group(1))
    except (ValueError, TypeError):
        return None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    value = value.strip().rstrip("Z")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


async def consultar_relic(n_registral: str) -> list[dict[str, Any]]:
    """Pega al endpoint Socrata y devuelve TODAS las filas de un n_registral.

    Una empresa con N clasificaciones devuelve N filas con el mismo
    n_registral. Empresas sin clasificación pero con prohibición o solo
    inscripción siguen apareciendo (con `classificacio=false`).
    """
    params = {
        "n_registral": n_registral,
        "$limit": str(RELIC_MAX_ROWS),
    }
    async with httpx.AsyncClient(
        timeout=RELIC_TIMEOUT_SECONDS, follow_redirects=True
    ) as client:
        resp = await client.get(
            RELIC_ENDPOINT,
            params=params,
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


async def sincronizar_empresa_relic(
    db: AsyncSession,
    empresa_id: UUID,
    n_registral: str,
) -> EmpresaRelic:
    """Sincroniza una empresa con RELIC.

    - Si la empresa no tiene EmpresaRelic, la crea.
    - Si ya tiene, actualiza el n_registral (por si cambió) y los datos
      generales (prohibición, nombre).
    - Reemplaza todas sus clasificaciones_relic con las que vengan de
      Socrata (delete + insert atómico).

    Lanza RelicNotFoundError si Socrata devuelve 0 filas (n_registral
    inexistente o empresa dada de baja del registro).
    """
    rows = await consultar_relic(n_registral)
    if not rows:
        raise RelicNotFoundError(
            f"RELIC no tiene ninguna empresa con n_registral={n_registral!r}"
        )

    primary = rows[0]
    nom_empresa = primary.get("nom_empresa")

    # Datos generales: aparecen consistentes en todas las filas. Si hay
    # prohibición, esa fila tiene el detalle más completo.
    fila_general: dict[str, Any] = primary
    for r in rows:
        if r.get("prohibicio"):
            fila_general = r
            break

    prohibicio = bool(fila_general.get("prohibicio"))
    prohibicio_data: dict[str, Any] | None = None
    if prohibicio:
        prohibicio_data = {
            k: v
            for k in (
                "ambit_pr",
                "data_res_pr",
                "data_inici_pr",
                "data_fi_pr",
                "causa_legal_pr",
            )
            if (v := fila_general.get(k)) is not None
        } or None

    data_actualitzacio = _parse_date(fila_general.get("data_actualitzacio"))

    # Upsert EmpresaRelic
    stmt = select(EmpresaRelic).where(EmpresaRelic.empresa_id == empresa_id)
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        obj = EmpresaRelic(
            empresa_id=empresa_id,
            n_registral=n_registral,
            nom_empresa=nom_empresa,
            prohibicio=prohibicio,
            prohibicio_data=prohibicio_data,
            data_actualitzacio=data_actualitzacio,
            ultima_sincronizacion=datetime.now(tz=timezone.utc),
        )
        db.add(obj)
    else:
        obj.n_registral = n_registral
        obj.nom_empresa = nom_empresa
        obj.prohibicio = prohibicio
        obj.prohibicio_data = prohibicio_data
        obj.data_actualitzacio = data_actualitzacio
        obj.ultima_sincronizacion = datetime.now(tz=timezone.utc)

    await db.flush()  # asegura obj.id antes del delete-then-insert

    # Reemplaza todas las clasificaciones (delete + insert)
    await db.execute(
        ClasificacionRelic.__table__.delete().where(
            ClasificacionRelic.empresa_relic_id == obj.id
        )
    )

    nuevas: list[ClasificacionRelic] = []
    for row in rows:
        if not row.get("classificacio"):
            continue
        sigles = row.get("sigles_cl")
        try:
            grupo, subgrupo = parsear_sigles(sigles)
        except ValueError:
            logger.warning(
                "RELIC sync %s: sigles_cl inesperado %r — fila ignorada",
                n_registral,
                sigles,
            )
            continue
        categoria = parsear_categoria(row.get("categoria_cl"))
        nuevas.append(
            ClasificacionRelic(
                empresa_relic_id=obj.id,
                tipus_cl=row.get("tipus_cl") or "",
                sigles_cl=sigles,
                grupo=grupo,
                subgrupo=subgrupo,
                categoria=categoria,
                subgrup_cl_text=row.get("subgrup_cl"),
                categoria_cl_text=row.get("categoria_cl"),
                suspensio=bool(row.get("suspensio_cl")),
                data_atorgament=_parse_date(row.get("data_atorgament_cl")),
            )
        )
    if nuevas:
        db.add_all(nuevas)
    await db.commit()
    await db.refresh(obj, attribute_names=["clasificaciones_relic"])

    logger.info(
        "RELIC sync OK empresa=%s n_registral=%s clasificaciones=%d prohibicio=%s",
        empresa_id,
        n_registral,
        len(nuevas),
        prohibicio,
    )
    return obj
