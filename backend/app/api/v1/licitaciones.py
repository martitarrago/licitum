from __future__ import annotations

import re
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA
from app.models.licitacion_score_empresa import LicitacionScoreEmpresa
from app.schemas.licitacion import (
    IngestaTriggerResponse,
    LicitacionDetail,
    LicitacionListResponse,
    LicitacionRead,
)

router = APIRouter()

# Whitelists para evitar valores arbitrarios en filtros que se traducen a SQL.
PROVINCIAS_VALIDAS = {"barcelona", "girona", "lleida", "tarragona"}
TIPOS_ORGANISMO_VALIDOS = {
    "ayuntamiento",
    "diputacio",
    "consell_comarcal",
    "universidad",
    "generalitat",
    "otros",
}
ORDER_BY_VALIDOS = {
    "score",                 # default: score DESC, NULLS LAST, fecha_publicacion DESC
    "score_asc",             # peores primero (debug / "necesita más solvencia")
    "fecha_limite_asc",      # plazo más cercano primero
    "fecha_limite_desc",     # plazo más lejano primero
    "importe_desc",          # mayor importe primero
    "importe_asc",           # menor importe primero
    "publicacion_desc",      # publicación más reciente primero
    "publicacion_asc",       # publicación más antigua primero
}
CPV_PREFIX_RE = re.compile(r"^[0-9-]{1,16}$")
ZONA_HORARIA_ES = ZoneInfo("Europe/Madrid")
EMPRESA_DEMO_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


@router.get("", response_model=LicitacionListResponse)
async def list_licitaciones(
    semaforo: str | None = Query(None, description="verde, amarillo, rojo, gris"),
    tipo_contrato: str | None = Query(None, description="obras, servicios, suministros…"),
    provincia: list[str] | None = Query(
        None,
        description="Provincias a incluir (multi). Valores: barcelona, girona, lleida, tarragona",
    ),
    tipo_organismo: list[str] | None = Query(
        None,
        description="Tipos de organismo (multi). Valores: ayuntamiento, diputacio, "
        "consell_comarcal, universidad, generalitat, otros",
    ),
    importe_min: Decimal | None = Query(None, ge=0, description="Importe mínimo en €"),
    importe_max: Decimal | None = Query(None, ge=0, description="Importe máximo en €"),
    plazo_min_dias: int | None = Query(
        None, ge=0, description="Días mínimos hasta cierre (desde hoy en hora Madrid)"
    ),
    plazo_max_dias: int | None = Query(
        None, ge=0, description="Días máximos hasta cierre (desde hoy en hora Madrid)"
    ),
    cpv_prefix: str | None = Query(
        None, description="Prefijo CPV: solo dígitos y guion, hasta 16 chars"
    ),
    q: str | None = Query(None, description="Búsqueda en título y organismo"),
    order_by: str = Query(
        "score",
        description="Criterio de orden. Valores: "
        "score (default, score del motor PSCP+M2 desc), "
        "score_asc, fecha_limite_asc, fecha_limite_desc, "
        "importe_desc, importe_asc, publicacion_desc",
    ),
    empresa_id: uuid.UUID | None = Query(
        None,
        description="Empresa para resolver el score. Si no se pasa, usa la demo.",
    ),
    incluye_descartadas: bool = Query(
        False,
        description="Si false (default), las licitaciones descartadas por el "
        "motor (hard filters: clasificación insuficiente, presupuesto fuera de "
        "rango, etc.) se excluyen del listado principal. La sección colapsada "
        "del frontend las muestra aparte vía /api/v1/intel/feed.",
    ),
    min_score: int | None = Query(
        None,
        ge=0,
        le=100,
        description="Filtra por puntuación mínima del motor. Útil para los "
        "tiers de la card: 70 (azul/excelente), 50 (verde+/buena), 40 "
        "(amarillo+/aprobada raso).",
    ),
    max_score: int | None = Query(
        None,
        ge=0,
        le=100,
        description="Filtra por puntuación máxima del motor. Combinado con "
        "min_score sirve para aislar un tier exacto (p.ej. 50-69 = buena).",
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> LicitacionListResponse:
    # ── Validación cruzada ───────────────────────────────────────────────
    if importe_min is not None and importe_max is not None and importe_min > importe_max:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "importe_min no puede ser mayor que importe_max"
        )
    if (
        plazo_min_dias is not None
        and plazo_max_dias is not None
        and plazo_min_dias > plazo_max_dias
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "plazo_min_dias no puede ser mayor que plazo_max_dias",
        )
    if cpv_prefix is not None and not CPV_PREFIX_RE.match(cpv_prefix):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "cpv_prefix solo admite dígitos y guion"
        )
    if order_by not in ORDER_BY_VALIDOS:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"order_by no válido. Valores: {sorted(ORDER_BY_VALIDOS)}",
        )

    provincia_norm: list[str] | None = None
    if provincia:
        provincia_norm = [p for p in (s.strip().lower() for s in provincia) if p in PROVINCIAS_VALIDAS]
        if not provincia_norm:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "provincia no contiene valores válidos"
            )

    tipo_org_norm: list[str] | None = None
    if tipo_organismo:
        tipo_org_norm = [
            t for t in (s.strip().lower() for s in tipo_organismo) if t in TIPOS_ORGANISMO_VALIDOS
        ]
        if not tipo_org_norm:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "tipo_organismo no contiene valores válidos"
            )

    # ── Construcción del statement ───────────────────────────────────────
    # SIEMPRE join al cache del motor — la card pinta su tier por score, y
    # los filtros (min_score, incluye_descartadas) actúan sobre la misma
    # tabla. Sin esto la primera pintada llega sin score y la card se ve
    # vacía hasta el siguiente render.
    empresa_filtro = empresa_id or EMPRESA_DEMO_ID
    stmt = select(
        Licitacion,
        LicitacionScoreEmpresa.score.label("lse_score"),
        LicitacionScoreEmpresa.descartada.label("lse_descartada"),
        LicitacionScoreEmpresa.breakdown_json.label("lse_breakdown"),
        LicitacionAnalisisIA.estado.label("ai_estado"),
        LicitacionAnalisisIA.error_mensaje.label("ai_error"),
    ).outerjoin(
        LicitacionScoreEmpresa,
        (LicitacionScoreEmpresa.licitacion_id == Licitacion.id)
        & (LicitacionScoreEmpresa.empresa_id == empresa_filtro),
    ).outerjoin(
        LicitacionAnalisisIA,
        LicitacionAnalisisIA.licitacion_id == Licitacion.id,
    )

    if not incluye_descartadas:
        # Filtra las descartadas pero deja pasar las que aún no tienen score
        # calculado (NULL → la empresa es nueva, primer cron pendiente).
        stmt = stmt.where(
            (LicitacionScoreEmpresa.descartada.is_(None))
            | (LicitacionScoreEmpresa.descartada.is_(False))
        )
    if min_score is not None:
        stmt = stmt.where(LicitacionScoreEmpresa.score >= min_score)
    if max_score is not None:
        stmt = stmt.where(LicitacionScoreEmpresa.score <= max_score)

    if semaforo:
        stmt = stmt.where(Licitacion.semaforo == semaforo)
    if tipo_contrato:
        stmt = stmt.where(Licitacion.tipo_contrato == tipo_contrato)
    if provincia_norm:
        # Operador && de PG: intersección no vacía. Captura tanto provincia única
        # como ámbitos multi-provincia y "Cataluña entera" (las 4).
        stmt = stmt.where(Licitacion.provincias.overlap(provincia_norm))
    if tipo_org_norm:
        stmt = stmt.where(Licitacion.tipo_organismo.in_(tipo_org_norm))
    if importe_min is not None:
        stmt = stmt.where(
            Licitacion.importe_licitacion.is_not(None),
            Licitacion.importe_licitacion >= importe_min,
        )
    if importe_max is not None:
        stmt = stmt.where(
            Licitacion.importe_licitacion.is_not(None),
            Licitacion.importe_licitacion <= importe_max,
        )

    # Plazo: corte calculado desde hoy 00:00 hora Madrid (CET/CEST). PostgreSQL
    # convierte automáticamente al comparar con `fecha_limite` (timestamptz).
    if plazo_min_dias is not None or plazo_max_dias is not None:
        hoy_madrid = datetime.now(tz=ZONA_HORARIA_ES).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        if plazo_min_dias is not None:
            cutoff_min = hoy_madrid + timedelta(days=plazo_min_dias)
            stmt = stmt.where(
                Licitacion.fecha_limite.is_not(None),
                Licitacion.fecha_limite >= cutoff_min,
            )
        if plazo_max_dias is not None:
            # +1 día para incluir el final del día N (deadline cae hasta 23:59:59
            # del día plazo_max_dias contado desde hoy).
            cutoff_max = hoy_madrid + timedelta(days=plazo_max_dias + 1)
            stmt = stmt.where(
                Licitacion.fecha_limite.is_not(None),
                Licitacion.fecha_limite < cutoff_max,
            )

    if cpv_prefix:
        # Match por prefijo en cualquier elemento del array. El bindparam evita
        # injection — `cpv_prefix` ya está validado por regex.
        stmt = stmt.where(
            text("EXISTS (SELECT 1 FROM unnest(cpv_codes) c WHERE c LIKE :cpv_pref)").bindparams(
                cpv_pref=f"{cpv_prefix}%"
            )
        )
    if q:
        pattern = f"%{q}%"
        stmt = stmt.where(
            Licitacion.titulo.ilike(pattern) | Licitacion.organismo.ilike(pattern)
        )

    # Orden — el JOIN al cache de score ya está hecho arriba (siempre).
    if order_by == "score":
        stmt = stmt.order_by(
            LicitacionScoreEmpresa.score.desc().nulls_last(),
            Licitacion.fecha_publicacion.desc().nulls_last(),
        )
    elif order_by == "score_asc":
        stmt = stmt.order_by(
            LicitacionScoreEmpresa.score.asc().nulls_last(),
            Licitacion.fecha_publicacion.desc().nulls_last(),
        )
    elif order_by == "fecha_limite_asc":
        stmt = stmt.order_by(
            Licitacion.fecha_limite.asc().nulls_last(),
            Licitacion.fecha_publicacion.desc().nulls_last(),
        )
    elif order_by == "fecha_limite_desc":
        stmt = stmt.order_by(
            Licitacion.fecha_limite.desc().nulls_last(),
            Licitacion.fecha_publicacion.desc().nulls_last(),
        )
    elif order_by == "importe_desc":
        stmt = stmt.order_by(
            Licitacion.importe_licitacion.desc().nulls_last(),
            Licitacion.fecha_publicacion.desc().nulls_last(),
        )
    elif order_by == "importe_asc":
        stmt = stmt.order_by(
            Licitacion.importe_licitacion.asc().nulls_last(),
            Licitacion.fecha_publicacion.desc().nulls_last(),
        )
    elif order_by == "publicacion_asc":
        stmt = stmt.order_by(
            Licitacion.fecha_publicacion.asc().nulls_last(),
        )
    else:  # publicacion_desc
        stmt = stmt.order_by(
            Licitacion.fecha_publicacion.desc().nulls_last(),
        )

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total: int = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(stmt)).all()

    items: list[LicitacionRead] = []
    for lic, lse_score, lse_descartada, lse_breakdown, ai_estado, ai_error in rows:
        item = LicitacionRead.model_validate(lic)
        item.score = lse_score
        item.descartada = lse_descartada

        # B4 — estado del análisis del pliego
        if ai_estado is None:
            item.pliego_estado = None
        else:
            estado_str = ai_estado.value if hasattr(ai_estado, "value") else str(ai_estado)
            # DOCUMENTO_NO_DISPONIBLE va como fallido con prefijo en el error
            if estado_str == "fallido" and ai_error and ai_error.startswith("DOCUMENTO_NO_DISPONIBLE:"):
                item.pliego_estado = "documento_no_disponible"
            else:
                item.pliego_estado = estado_str

        # Veredicto: leer del breakdown_json del score (entrada pliego_check.data_points.veredicto)
        if lse_breakdown:
            for sig in lse_breakdown:
                if sig.get("name") == "pliego_check":
                    item.pliego_veredicto = (sig.get("data") or {}).get("veredicto")
                    break

        items.append(item)

    return LicitacionListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{expediente:path}", response_model=LicitacionDetail)
async def get_licitacion(
    expediente: str,
    db: AsyncSession = Depends(get_db),
) -> LicitacionDetail:
    row = (
        await db.execute(select(Licitacion).where(Licitacion.expediente == expediente))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Licitación '{expediente}' no encontrada")
    return LicitacionDetail.model_validate(row)


@router.post("/ingestar", response_model=IngestaTriggerResponse)
async def trigger_ingesta() -> IngestaTriggerResponse:
    """Lanza la tarea de ingestión del dataset PSCP (Catalunya) en el worker Celery."""
    from workers.ingesta_pscp import ingestar_feed

    task = ingestar_feed.delay()
    return IngestaTriggerResponse(
        task_id=task.id,
        message="Tarea de ingestión lanzada. Puede tardar 1-2 minutos.",
    )


@router.post("/recalcular-semaforo", response_model=IngestaTriggerResponse)
async def trigger_recalcular_semaforo() -> IngestaTriggerResponse:
    """Lanza la tarea de recálculo del semáforo de todas las licitaciones.

    Útil tras cambios en M3 (nuevos certificados validados, nuevas
    clasificaciones ROLECE) para reflejarlos en el Radar sin esperar a la
    próxima ingesta. Idempotente: solo escribe filas donde el resultado
    cambia respecto al actual.
    """
    from workers.recalcular_semaforos import recalcular_todas

    task = recalcular_todas.delay()
    return IngestaTriggerResponse(
        task_id=task.id,
        message="Recálculo de semáforos lanzado. Suele tardar pocos segundos.",
    )
