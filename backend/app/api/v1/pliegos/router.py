from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EstadoAnalisisPliego
from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA
from app.models.licitacion_score_empresa import LicitacionScoreEmpresa
from app.schemas.licitacion_analisis_ia import (
    LicitacionAnalisisIARead,
    PliegoListItem,
    RecomendacionRead,
)
from app.services.recomendacion_evaluator import calcular_recomendacion
from app.services.storage import R2Storage, get_storage
from workers.extraccion_pliego import extraer_pliego, extraer_pliego_desde_pscp

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PDF_SIZE = 50 * 1024 * 1024  # 50 MB — los PCAPs pueden ser grandes


_VALID_VEREDICTOS = {"ir", "ir_con_riesgo", "no_ir", "incompleto"}


@router.get(
    "",
    response_model=list[PliegoListItem],
    summary="Lista todos los pliegos analizados (cache global de extracción, veredicto empresa-específico)",
)
async def listar_pliegos(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID | None = None,
) -> list[PliegoListItem]:
    """Listing del cache global de análisis IA.

    El análisis del pliego (extracción de campos) es GLOBAL por licitación.
    El veredicto ir/no_ir es empresa-específico: se lee de licitacion_score_empresa
    (breakdown_json, señal pliego_check) cuando se pasa empresa_id. Sin empresa_id
    el veredicto queda null.
    """
    stmt = (
        select(
            LicitacionAnalisisIA,
            Licitacion,
            LicitacionScoreEmpresa.breakdown_json.label("lse_breakdown"),
        )
        .join(Licitacion, Licitacion.id == LicitacionAnalisisIA.licitacion_id)
        .outerjoin(
            LicitacionScoreEmpresa,
            (LicitacionScoreEmpresa.licitacion_id == LicitacionAnalisisIA.licitacion_id)
            & (LicitacionScoreEmpresa.empresa_id == empresa_id),
        )
        .order_by(LicitacionAnalisisIA.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    items: list[PliegoListItem] = []
    for analisis, lic, lse_breakdown in rows:
        banderas: int | None = None
        if analisis.estado == EstadoAnalisisPliego.completado and analisis.extracted_data:
            br = analisis.extracted_data.get("banderas_rojas") or []
            if isinstance(br, list):
                banderas = len(br)

        # Veredicto empresa-específico desde el scoring engine (misma fuente que el Radar)
        veredicto: str | None = None
        if lse_breakdown:
            for sig in lse_breakdown:
                if sig.get("name") == "pliego_check":
                    v = (sig.get("data") or {}).get("veredicto")
                    veredicto = v if v in _VALID_VEREDICTOS else None
                    break

        items.append(
            PliegoListItem(
                licitacion_id=analisis.licitacion_id,
                expediente=lic.expediente,
                titulo=lic.titulo,
                organismo=lic.organismo,
                importe_licitacion=lic.importe_licitacion,
                fecha_limite=lic.fecha_limite,
                estado=analisis.estado.value
                if hasattr(analisis.estado, "value")
                else str(analisis.estado),
                idioma_detectado=analisis.idioma_detectado,
                confianza_global=analisis.confianza_global,
                procesado_at=analisis.procesado_at,
                created_at=analisis.created_at,
                veredicto_recomendado=veredicto,
                banderas_rojas_count=banderas,
            )
        )
    return items


async def _get_licitacion_or_404(
    db: AsyncSession, expediente: str
) -> Licitacion:
    obj = (
        await db.execute(
            select(Licitacion).where(Licitacion.expediente == expediente)
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Licitación con expediente {expediente!r} no encontrada",
        )
    return obj


async def _get_analisis_or_404(
    db: AsyncSession, licitacion_id: UUID
) -> LicitacionAnalisisIA:
    obj = (
        await db.execute(
            select(LicitacionAnalisisIA).where(
                LicitacionAnalisisIA.licitacion_id == licitacion_id
            )
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Esta licitación aún no tiene un análisis IA del pliego",
        )
    return obj


@router.post(
    "/{expediente:path}/upload",
    response_model=LicitacionAnalisisIARead,
    status_code=status.HTTP_201_CREATED,
    summary="Sube el PCAP a R2 y encola la extracción IA (cache global por licitación)",
)
async def subir_pcap(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
    pdf: Annotated[UploadFile, File(description="Pliego de Cláusulas Administrativas Particulares (PDF)")],
) -> LicitacionAnalisisIA:
    if pdf.content_type != "application/pdf":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"El archivo debe ser application/pdf (recibido: {pdf.content_type})",
        )
    body = await pdf.read()
    if len(body) > MAX_PDF_SIZE:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"PDF excede el tamaño máximo ({MAX_PDF_SIZE // 1024 // 1024} MB)",
        )
    if len(body) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El PDF está vacío")

    lic = await _get_licitacion_or_404(db, expediente)

    # Sube a R2 antes de tocar la BBDD: si falla R2, no dejamos fila huérfana.
    key = f"pliegos/{lic.id}/{uuid4()}.pdf"
    pdf_url = await storage.upload(key, body, content_type="application/pdf")

    # Upsert: si ya hay análisis previo, sustituimos PDF y reseteamos estado.
    analisis = (
        await db.execute(
            select(LicitacionAnalisisIA).where(
                LicitacionAnalisisIA.licitacion_id == lic.id
            )
        )
    ).scalar_one_or_none()

    pdf_url_anterior: str | None = None
    if analisis is None:
        analisis = LicitacionAnalisisIA(
            licitacion_id=lic.id,
            pdf_url=pdf_url,
            estado=EstadoAnalisisPliego.pendiente,
            extracted_data={},
        )
        db.add(analisis)
    else:
        pdf_url_anterior = analisis.pdf_url
        analisis.pdf_url = pdf_url
        analisis.estado = EstadoAnalisisPliego.pendiente
        analisis.extracted_data = {}
        analisis.idioma_detectado = None
        analisis.confianza_global = None
        analisis.error_mensaje = None
        analisis.procesado_at = None

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await storage.delete(key)
        raise

    # Si había PDF anterior, lo borramos de R2 ahora que el nuevo está commiteado.
    if pdf_url_anterior:
        try:
            await storage.delete(storage.key_from_url(pdf_url_anterior))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "No se pudo borrar PDF anterior de R2 (%s): %s", pdf_url_anterior, exc
            )

    await db.refresh(analisis)

    # Encolar extracción. Si falla el broker, no rompemos el upload.
    try:
        extraer_pliego.delay(str(lic.id))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "No se pudo encolar extracción del pliego para %s: %s", lic.id, exc
        )

    return analisis


@router.get(
    "/{expediente:path}/recomendacion",
    response_model=RecomendacionRead,
    summary="Calcula la recomendación ir/no ir cruzando análisis IA con datos M2",
)
async def obtener_recomendacion(
    expediente: str,
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecomendacionRead:
    lic = await _get_licitacion_or_404(db, expediente)
    analisis = await _get_analisis_or_404(db, lic.id)
    if analisis.estado != EstadoAnalisisPliego.completado:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"El análisis está en estado {analisis.estado.value}; "
            "espera a que se complete antes de pedir recomendación.",
        )
    return await calcular_recomendacion(db, analisis.extracted_data, empresa_id)


@router.get(
    "/{expediente:path}/pdf",
    summary="Stream del PCAP almacenado (proxy R2)",
)
async def proxy_pdf(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
) -> StreamingResponse:
    lic = await _get_licitacion_or_404(db, expediente)
    analisis = await _get_analisis_or_404(db, lic.id)
    if not analisis.pdf_url:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Este análisis no tiene PDF asociado"
        )
    key = storage.key_from_url(analisis.pdf_url)
    body = await storage.get_bytes(key)
    return StreamingResponse(
        iter([body]),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )


@router.post(
    "/{expediente:path}/analizar",
    response_model=LicitacionAnalisisIARead,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Descarga el PCAP desde PSCP automáticamente y encola la extracción IA",
)
async def analizar_desde_pscp(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicitacionAnalisisIA:
    """Auto-descarga el pliego desde contractaciopublica.cat y lanza la extracción.

    Si ya hay un análisis en curso (pendiente/procesando), devuelve el estado actual
    sin re-encolar. Si ya está completado, también lo devuelve sin rehacer nada.
    """
    lic = await _get_licitacion_or_404(db, expediente)

    analisis = (
        await db.execute(
            select(LicitacionAnalisisIA).where(
                LicitacionAnalisisIA.licitacion_id == lic.id
            )
        )
    ).scalar_one_or_none()

    # Si ya hay un análisis activo o completado, no re-encolamos.
    if analisis is not None and analisis.estado in (
        EstadoAnalisisPliego.pendiente,
        EstadoAnalisisPliego.procesando,
        EstadoAnalisisPliego.completado,
    ):
        return analisis

    # Crear fila pendiente (o resetear si estaba fallido).
    if analisis is None:
        analisis = LicitacionAnalisisIA(
            licitacion_id=lic.id,
            estado=EstadoAnalisisPliego.pendiente,
            extracted_data={},
        )
        db.add(analisis)
    else:
        analisis.estado = EstadoAnalisisPliego.pendiente
        analisis.error_mensaje = None
        analisis.extracted_data = {}
        analisis.procesado_at = None

    await db.commit()
    await db.refresh(analisis)

    try:
        extraer_pliego_desde_pscp.delay(str(lic.id))
    except Exception as exc:
        logger.warning(
            "No se pudo encolar extracción PSCP para %s: %s", lic.id, exc
        )

    return analisis


@router.post(
    "/{expediente:path}/reextraer",
    response_model=LicitacionAnalisisIARead,
    summary="Re-encola la extracción IA sin volver a subir el PDF",
)
async def reextraer(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicitacionAnalisisIA:
    lic = await _get_licitacion_or_404(db, expediente)
    analisis = await _get_analisis_or_404(db, lic.id)
    if not analisis.pdf_url:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Sube primero el PCAP — no hay PDF para re-extraer.",
        )
    analisis.estado = EstadoAnalisisPliego.pendiente
    analisis.error_mensaje = None
    await db.commit()
    await db.refresh(analisis)
    try:
        extraer_pliego.delay(str(lic.id))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "No se pudo encolar re-extracción del pliego para %s: %s", lic.id, exc
        )
    return analisis


@router.get(
    "/{expediente:path}",
    response_model=LicitacionAnalisisIARead,
    summary="Devuelve el análisis IA del pliego (404 si no se ha subido aún)",
)
async def obtener(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LicitacionAnalisisIARead:
    lic = await _get_licitacion_or_404(db, expediente)
    analisis = await _get_analisis_or_404(db, lic.id)
    result = LicitacionAnalisisIARead.model_validate(analisis)
    result.url_placsp = lic.url_placsp
    return result


@router.delete(
    "/{expediente:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Borra el análisis IA y su PDF asociado en R2",
)
async def eliminar(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
) -> None:
    lic = await _get_licitacion_or_404(db, expediente)
    analisis = await _get_analisis_or_404(db, lic.id)
    pdf_url = analisis.pdf_url
    await db.delete(analisis)
    await db.commit()
    if pdf_url:
        try:
            await storage.delete(storage.key_from_url(pdf_url))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "No se pudo borrar PDF tras eliminar análisis %s: %s", lic.id, exc
            )
