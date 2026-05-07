from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Sequence
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_empresa_id
from app.db.session import get_db
from app.models.licitacion import Licitacion
from app.models.licitacion_estado_empresa import LicitacionEstadoEmpresa
from app.models.sobre_a_generacion import SobreAGeneracion
from app.models.sobre_a_presentacion import SobreAPresentacion
from app.schemas.sobre_a import SobreAGenerar, SobreAListItem, SobreARead
from app.services.deuc_generator import generar_sobre_a
from app.services.sobre_a_docx import generar_docx
from app.services.storage import R2Storage, get_storage

logger = logging.getLogger(__name__)
MAX_PDF_SIZE = 25 * 1024 * 1024  # 25 MB — los Sobres A firmados son pequeños

router = APIRouter()


async def _get_or_404(db: AsyncSession, sobre_id: UUID) -> SobreAGeneracion:
    obj = (
        await db.execute(
            select(SobreAGeneracion).where(SobreAGeneracion.id == sobre_id)
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Sobre A {sobre_id} no encontrado"
        )
    return obj


@router.post(
    "/{expediente:path}/generar",
    response_model=SobreARead,
    status_code=status.HTTP_201_CREATED,
    summary="Genera un Sobre A nuevo y guarda en histórico",
)
async def generar(
    expediente: str,
    data: SobreAGenerar,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> SobreAGeneracion:
    del data  # body se ignora — empresa_id viene del JWT
    licitacion = (
        await db.execute(
            select(Licitacion).where(Licitacion.expediente == expediente)
        )
    ).scalar_one_or_none()
    if licitacion is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Licitación con expediente {expediente!r} no encontrada",
        )

    try:
        result = await generar_sobre_a(db, empresa_id, expediente)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))

    obj = SobreAGeneracion(
        empresa_id=empresa_id,
        licitacion_id=licitacion.id,
        expediente=expediente,
        html=result.html,
        datos_snapshot=result.snapshot,
        usa_relic=result.usa_relic,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.get(
    "",
    response_model=list[SobreAListItem],
    summary="Histórico de Sobres A generados (sin HTML)",
)
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    expediente: Annotated[
        str | None,
        Query(description="Filtra por expediente concreto (workspace por licitación)."),
    ] = None,
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> Sequence[SobreAGeneracion]:
    stmt = (
        select(SobreAGeneracion)
        .where(SobreAGeneracion.empresa_id == empresa_id)
        .order_by(SobreAGeneracion.created_at.desc())
    )
    if expediente is not None:
        stmt = stmt.where(SobreAGeneracion.expediente == expediente)
    return list((await db.execute(stmt)).scalars().all())


@router.get(
    "/{sobre_id}/docx",
    summary="Descarga el Sobre A renderizado como Word (.docx) editable",
)
async def descargar_docx(
    sobre_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Genera el .docx desde el snapshot persistido en BBDD.

    El usuario edita el documento en Word, lo firma fuera de la app
    (con AutoFirma/FNMT) y sube el PDF resultante con
    POST /{expediente}/presentado para tener constancia.
    """
    obj = await _get_or_404(db, sobre_id)
    docx_bytes = generar_docx(obj.datos_snapshot)
    expediente_safe = (obj.expediente or "sobre_a").replace("/", "_")[:120]
    filename = f"SobreA_{expediente_safe}.docx"
    return Response(
        content=docx_bytes,
        media_type=(
            "application/vnd.openxmlformats-officedocument."
            "wordprocessingml.document"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{sobre_id}",
    response_model=SobreARead,
    summary="Detalle de un Sobre A generado (con HTML completo)",
)
async def obtener(
    sobre_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SobreAGeneracion:
    return await _get_or_404(db, sobre_id)


@router.delete(
    "/{sobre_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Borra un Sobre A del histórico",
)
async def eliminar(
    sobre_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    obj = await _get_or_404(db, sobre_id)
    await db.delete(obj)
    await db.commit()


# ─── Presentación final (PDF firmado) ───────────────────────────────────────


class PresentacionRead(BaseModel):
    id: UUID
    empresa_id: UUID
    licitacion_id: UUID
    archivo_filename: str
    subido_at: datetime

    model_config = {"from_attributes": True}


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


@router.post(
    "/{expediente:path}/presentado",
    response_model=PresentacionRead,
    status_code=status.HTTP_201_CREATED,
    summary="Sube el PDF firmado del Sobre A enviado al portal y marca presentada",
)
async def subir_presentado(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
    pdf: Annotated[
        UploadFile, File(description="PDF firmado tal como se subió al portal")
    ],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> SobreAPresentacion:
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

    licitacion = await _get_licitacion_or_404(db, expediente)

    existing = (
        await db.execute(
            select(SobreAPresentacion).where(
                SobreAPresentacion.empresa_id == empresa_id,
                SobreAPresentacion.licitacion_id == licitacion.id,
            )
        )
    ).scalar_one_or_none()

    key = (
        f"sobre-a-firmados/{licitacion.id}/{empresa_id}/{uuid4()}.pdf"
    )
    archivo_url = await storage.upload(key, body, content_type="application/pdf")
    filename = pdf.filename or "sobre_a_firmado.pdf"

    archivo_anterior_url: str | None = None
    now = datetime.now(tz=timezone.utc)
    if existing is None:
        existing = SobreAPresentacion(
            empresa_id=empresa_id,
            licitacion_id=licitacion.id,
            archivo_url=archivo_url,
            archivo_filename=filename,
            subido_at=now,
        )
        db.add(existing)
    else:
        archivo_anterior_url = existing.archivo_url
        existing.archivo_url = archivo_url
        existing.archivo_filename = filename
        existing.subido_at = now

    # Pipeline → "presentada". Solo escalamos desde en_preparacion o sin
    # estado; si la oferta está en estados más adelante (ganada, perdida,
    # excluida, etc.) no pisamos — la subida es meta-trazabilidad.
    estado_obj = (
        await db.execute(
            select(LicitacionEstadoEmpresa).where(
                LicitacionEstadoEmpresa.empresa_id == empresa_id,
                LicitacionEstadoEmpresa.licitacion_id == licitacion.id,
            )
        )
    ).scalar_one_or_none()
    if estado_obj is None:
        db.add(
            LicitacionEstadoEmpresa(
                empresa_id=empresa_id,
                licitacion_id=licitacion.id,
                estado="presentada",
                estado_actualizado_at=now,
            )
        )
    elif estado_obj.estado == "en_preparacion":
        estado_obj.estado = "presentada"
        estado_obj.estado_actualizado_at = now

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        try:
            await storage.delete(key)
        except Exception:  # noqa: BLE001
            pass
        raise

    if archivo_anterior_url:
        try:
            await storage.delete(storage.key_from_url(archivo_anterior_url))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "No se pudo borrar PDF firmado anterior de R2 (%s): %s",
                archivo_anterior_url,
                exc,
            )

    await db.refresh(existing)
    return existing


@router.get(
    "/{expediente:path}/presentado",
    response_model=PresentacionRead | None,
    summary="Metadatos del PDF firmado (null si todavía no se ha subido)",
)
async def obtener_presentado(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> SobreAPresentacion | None:
    licitacion = (
        await db.execute(select(Licitacion).where(Licitacion.expediente == expediente))
    ).scalar_one_or_none()
    if licitacion is None:
        return None
    return (
        await db.execute(
            select(SobreAPresentacion).where(
                SobreAPresentacion.empresa_id == empresa_id,
                SobreAPresentacion.licitacion_id == licitacion.id,
            )
        )
    ).scalar_one_or_none()


@router.delete(
    "/{expediente:path}/presentado",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Borra el PDF firmado y revierte el pipeline a 'en_preparacion'",
)
async def borrar_presentado(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> None:
    licitacion = await _get_licitacion_or_404(db, expediente)
    obj = (
        await db.execute(
            select(SobreAPresentacion).where(
                SobreAPresentacion.empresa_id == empresa_id,
                SobreAPresentacion.licitacion_id == licitacion.id,
            )
        )
    ).scalar_one_or_none()
    if obj is None:
        return
    archivo_url = obj.archivo_url

    estado_obj = (
        await db.execute(
            select(LicitacionEstadoEmpresa).where(
                LicitacionEstadoEmpresa.empresa_id == empresa_id,
                LicitacionEstadoEmpresa.licitacion_id == licitacion.id,
            )
        )
    ).scalar_one_or_none()
    # Solo revertimos si estaba en 'presentada'; estados posteriores
    # son del usuario, no se tocan al borrar el PDF.
    if estado_obj is not None and estado_obj.estado == "presentada":
        estado_obj.estado = "en_preparacion"
        estado_obj.estado_actualizado_at = datetime.now(tz=timezone.utc)

    await db.delete(obj)
    await db.commit()

    try:
        await storage.delete(storage.key_from_url(archivo_url))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "No se pudo borrar PDF firmado de R2 (%s): %s", archivo_url, exc
        )


@router.get(
    "/{expediente:path}/presentado/pdf",
    summary="Stream del PDF firmado almacenado en R2",
)
async def proxy_presentado_pdf(
    expediente: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> StreamingResponse:
    licitacion = await _get_licitacion_or_404(db, expediente)
    obj = (
        await db.execute(
            select(SobreAPresentacion).where(
                SobreAPresentacion.empresa_id == empresa_id,
                SobreAPresentacion.licitacion_id == licitacion.id,
            )
        )
    ).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No hay PDF firmado para esta licitación"
        )
    body = await storage.get_bytes(storage.key_from_url(obj.archivo_url))
    return StreamingResponse(
        iter([body]),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )
