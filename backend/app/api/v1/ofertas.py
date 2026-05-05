"""Endpoint agregado para `Preparación de ofertas`.

Una "oferta" en la app es una licitación en la que el usuario está
trabajando. Materializa la unión de:
  - LicitacionEstadoEmpresa (tracker / pipeline)
  - SobreAGeneracion        (¿hay declaración responsable generada?)
  - OfertaEconomicaGeneracion (¿hay oferta económica calculada?)
  - SobreAPresentacion      (¿se subió el PDF firmado?)

Devuelve una fila por licitación con flags de progreso para que el
listado /ofertas pueda mostrar "Declaración ✓ · Económica ✓ · …".
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Sequence
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA
from app.models.licitacion_estado_empresa import LicitacionEstadoEmpresa
from app.models.oferta_economica import OfertaEconomicaGeneracion
from app.models.sobre_a_generacion import SobreAGeneracion
from app.models.sobre_a_presentacion import SobreAPresentacion

router = APIRouter()

# Estados terminales que cuentan como "rechazadas" — el toggle del UI
# las puede ocultar.
ESTADOS_RECHAZADAS = {"perdida", "excluida"}


class OfertaItem(BaseModel):
    """Una fila del listado /ofertas."""

    licitacion_id: UUID
    expediente: str
    titulo: str | None
    organismo: str | None
    importe_licitacion: Decimal | None
    fecha_limite: datetime | None
    fecha_publicacion: datetime | None
    # Estado en el pipeline (en_preparacion, presentada…). None si la
    # licitación tiene declaración o económica pero todavía no se movió
    # a pipeline (caso raro pero posible).
    estado: str | None
    estado_actualizado_at: datetime | None
    # Progreso por componente
    declaracion_generada: bool
    declaracion_versiones: int
    economica_generada: bool
    economica_versiones: int
    presentado: bool
    presentado_at: datetime | None
    # Datos del pliego para decidir qué pestañas mostrar
    presupuesto_base: Decimal | None
    pct_criterios_subjetivos: Decimal | None
    pliego_analizado: bool
    # Marcador de favorito de la empresa (para que el usuario marque
    # ofertas que quiere priorizar dentro de su bandeja de trabajo).
    # Por ahora reutilizamos el de Radar — coherente con resto de la app.
    favorito: bool = False


@router.get(
    "",
    response_model=list[OfertaItem],
    summary="Listado agregado de ofertas en preparación + presentadas + cerradas",
)
async def listar_ofertas(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID,
    ocultar_rechazadas: bool = Query(
        False,
        description="Si true, oculta las licitaciones perdidas o excluidas.",
    ),
) -> Sequence[OfertaItem]:
    # Subqueries de conteo por componente — devuelve cero si no hay filas.
    sub_decl = (
        select(
            SobreAGeneracion.licitacion_id.label("lic_id"),
            func.count().label("cnt"),
        )
        .where(SobreAGeneracion.empresa_id == empresa_id)
        .group_by(SobreAGeneracion.licitacion_id)
        .subquery()
    )
    sub_econ = (
        select(
            OfertaEconomicaGeneracion.licitacion_id.label("lic_id"),
            func.count().label("cnt"),
        )
        .where(OfertaEconomicaGeneracion.empresa_id == empresa_id)
        .group_by(OfertaEconomicaGeneracion.licitacion_id)
        .subquery()
    )

    stmt = (
        select(
            Licitacion.id.label("licitacion_id"),
            Licitacion.expediente,
            Licitacion.titulo,
            Licitacion.organismo,
            Licitacion.importe_licitacion,
            Licitacion.fecha_limite,
            Licitacion.fecha_publicacion,
            LicitacionEstadoEmpresa.estado.label("estado"),
            LicitacionEstadoEmpresa.estado_actualizado_at.label(
                "estado_actualizado_at"
            ),
            func.coalesce(sub_decl.c.cnt, 0).label("declaracion_versiones"),
            func.coalesce(sub_econ.c.cnt, 0).label("economica_versiones"),
            SobreAPresentacion.id.label("presentacion_id"),
            SobreAPresentacion.subido_at.label("presentado_at"),
            LicitacionAnalisisIA.extracted_data.label("ai_extracted"),
            LicitacionAnalisisIA.estado.label("ai_estado"),
        )
        .outerjoin(
            LicitacionEstadoEmpresa,
            (LicitacionEstadoEmpresa.licitacion_id == Licitacion.id)
            & (LicitacionEstadoEmpresa.empresa_id == empresa_id),
        )
        .outerjoin(sub_decl, sub_decl.c.lic_id == Licitacion.id)
        .outerjoin(sub_econ, sub_econ.c.lic_id == Licitacion.id)
        .outerjoin(
            SobreAPresentacion,
            (SobreAPresentacion.licitacion_id == Licitacion.id)
            & (SobreAPresentacion.empresa_id == empresa_id),
        )
        .outerjoin(
            LicitacionAnalisisIA,
            LicitacionAnalisisIA.licitacion_id == Licitacion.id,
        )
        .where(
            # Una licitación entra al listado si la empresa ha tocado algo:
            # estado en pipeline O declaración generada O económica generada
            # O ya subió presentación.
            (LicitacionEstadoEmpresa.id.is_not(None))
            | (sub_decl.c.cnt.is_not(None))
            | (sub_econ.c.cnt.is_not(None))
            | (SobreAPresentacion.id.is_not(None))
        )
        .order_by(
            # Activas (en preparación / presentada / en proceso) arriba,
            # con plazo más cercano primero. Cerradas al final.
            case(
                (
                    LicitacionEstadoEmpresa.estado.in_(
                        [
                            "en_preparacion",
                            "en_subsanacion",
                            "documentacion_previa",
                        ]
                    ),
                    0,
                ),
                (
                    LicitacionEstadoEmpresa.estado.in_(
                        ["presentada", "en_resolucion"]
                    ),
                    1,
                ),
                (LicitacionEstadoEmpresa.estado == "ganada", 2),
                (
                    LicitacionEstadoEmpresa.estado.in_(["perdida", "excluida"]),
                    4,
                ),
                else_=3,
            ),
            Licitacion.fecha_limite.asc().nulls_last(),
        )
    )

    if ocultar_rechazadas:
        stmt = stmt.where(
            (LicitacionEstadoEmpresa.estado.is_(None))
            | (LicitacionEstadoEmpresa.estado.notin_(ESTADOS_RECHAZADAS))
        )

    rows = (await db.execute(stmt)).all()

    items: list[OfertaItem] = []
    for r in rows:
        m = r._mapping
        ai_data = m["ai_extracted"] if m["ai_extracted"] else {}
        presupuesto = ai_data.get("presupuesto_base_sin_iva") if ai_data else None
        pct_subj = ai_data.get("pct_criterios_subjetivos") if ai_data else None
        ai_estado = m["ai_estado"]
        pliego_analizado = bool(
            ai_estado is not None
            and (
                ai_estado.value == "completado"
                if hasattr(ai_estado, "value")
                else str(ai_estado) == "completado"
            )
        )
        items.append(
            OfertaItem(
                licitacion_id=m["licitacion_id"],
                expediente=m["expediente"],
                titulo=m["titulo"],
                organismo=m["organismo"],
                importe_licitacion=m["importe_licitacion"],
                fecha_limite=m["fecha_limite"],
                fecha_publicacion=m["fecha_publicacion"],
                estado=m["estado"],
                estado_actualizado_at=m["estado_actualizado_at"],
                declaracion_generada=m["declaracion_versiones"] > 0,
                declaracion_versiones=int(m["declaracion_versiones"]),
                economica_generada=m["economica_versiones"] > 0,
                economica_versiones=int(m["economica_versiones"]),
                presentado=m["presentacion_id"] is not None,
                presentado_at=m["presentado_at"],
                presupuesto_base=Decimal(str(presupuesto))
                if presupuesto is not None
                else None,
                pct_criterios_subjetivos=Decimal(str(pct_subj))
                if pct_subj is not None
                else None,
                pliego_analizado=pliego_analizado,
            )
        )
    return items
