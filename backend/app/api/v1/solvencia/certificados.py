from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated, Sequence
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EstadoCertificado
from app.db.session import get_db
from app.models.certificado_obra import CertificadoObra
from app.schemas.certificado_obra import (
    CertificadoObraListItem,
    CertificadoObraRead,
    CertificadoObraUpdate,
)
from app.services.storage import R2Storage, get_storage
from workers.extraccion_pdf import extraer_certificado

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PDF_SIZE = 25 * 1024 * 1024  # 25 MB


async def _get_certificado_or_404(
    db: AsyncSession, certificado_id: UUID
) -> CertificadoObra:
    stmt = select(CertificadoObra).where(
        CertificadoObra.id == certificado_id,
        CertificadoObra.deleted_at.is_(None),
    )
    result = await db.execute(stmt)
    cert = result.scalar_one_or_none()
    if cert is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Certificado {certificado_id} no encontrado",
        )
    return cert


def _parse_cpv_codes(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [c.strip() for c in raw.split(",") if c.strip()]


@router.post(
    "",
    response_model=CertificadoObraRead,
    status_code=status.HTTP_201_CREATED,
    summary="Sube PDF a R2 y crea certificado en estado pendiente_revision",
)
async def crear_certificado(
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
    pdf: Annotated[UploadFile, File(description="Certificado/acta de recepción en PDF")],
    empresa_id: Annotated[UUID, Form()],
    titulo: Annotated[str | None, Form(max_length=512)] = None,
    organismo: Annotated[str | None, Form(max_length=255)] = None,
    importe_adjudicacion: Annotated[Decimal | None, Form(ge=0)] = None,
    fecha_inicio: Annotated[date | None, Form()] = None,
    fecha_fin: Annotated[date | None, Form()] = None,
    numero_expediente: Annotated[str | None, Form(max_length=128)] = None,
    cpv_codes: Annotated[
        str | None,
        Form(description="Códigos CPV separados por coma (ej: 45233000,45262210)"),
    ] = None,
    clasificacion_grupo: Annotated[str | None, Form(max_length=8)] = None,
    clasificacion_subgrupo: Annotated[str | None, Form(max_length=8)] = None,
) -> CertificadoObra:
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

    key = f"certificados/{empresa_id}/{uuid4()}.pdf"
    pdf_url = await storage.upload(key, body, content_type="application/pdf")

    certificado = CertificadoObra(
        empresa_id=empresa_id,
        titulo=titulo or None,
        organismo=organismo or None,
        importe_adjudicacion=importe_adjudicacion,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        cpv_codes=_parse_cpv_codes(cpv_codes),
        clasificacion_grupo=clasificacion_grupo,
        clasificacion_subgrupo=clasificacion_subgrupo,
        numero_expediente=numero_expediente or None,
        pdf_url=pdf_url,
        estado=EstadoCertificado.pendiente_revision,
        extracted_data={},
    )
    db.add(certificado)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        await storage.delete(key)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Violación de integridad (posible número de expediente duplicado "
            "o empresa_id inexistente)",
        ) from exc
    except Exception:
        await db.rollback()
        await storage.delete(key)
        raise

    await db.refresh(certificado)

    try:
        extraer_certificado.delay(str(certificado.id))
    except Exception as exc:  # noqa: BLE001
        # Broker caído o no configurado: no rompemos el POST — el registro
        # existe y el usuario podrá re-disparar la extracción más tarde.
        logger.warning(
            "No se pudo encolar extracción para %s: %s", certificado.id, exc
        )

    return certificado


@router.get(
    "",
    response_model=list[CertificadoObraListItem],
    summary="Lista certificados con filtros",
)
async def listar_certificados(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID | None = None,
    estado: EstadoCertificado | None = None,
    clasificacion_grupo: str | None = None,
    clasificacion_subgrupo: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> Sequence[CertificadoObra]:
    stmt = select(CertificadoObra).where(CertificadoObra.deleted_at.is_(None))
    if empresa_id is not None:
        stmt = stmt.where(CertificadoObra.empresa_id == empresa_id)
    if estado is not None:
        stmt = stmt.where(CertificadoObra.estado == estado)
    if clasificacion_grupo is not None:
        stmt = stmt.where(CertificadoObra.clasificacion_grupo == clasificacion_grupo)
    if clasificacion_subgrupo is not None:
        stmt = stmt.where(
            CertificadoObra.clasificacion_subgrupo == clasificacion_subgrupo
        )
    stmt = stmt.order_by(CertificadoObra.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get(
    "/{certificado_id}",
    response_model=CertificadoObraRead,
    summary="Detalle del certificado (incluye extracted_data)",
)
async def obtener_certificado(
    certificado_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CertificadoObra:
    return await _get_certificado_or_404(db, certificado_id)


@router.patch(
    "/{certificado_id}",
    response_model=CertificadoObraRead,
    summary="Actualiza campos editables (revisión humana)",
)
async def actualizar_certificado(
    certificado_id: UUID,
    data: CertificadoObraUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CertificadoObra:
    cert = await _get_certificado_or_404(db, certificado_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se han enviado campos para actualizar",
        )
    for field, value in updates.items():
        setattr(cert, field, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Violación de integridad (posible número de expediente duplicado)",
        ) from exc
    await db.refresh(cert)
    return cert


@router.delete(
    "/{certificado_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete",
)
async def eliminar_certificado(
    certificado_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    cert = await _get_certificado_or_404(db, certificado_id)
    cert.deleted_at = datetime.now(timezone.utc)
    await db.commit()


async def _transicionar_estado(
    db: AsyncSession,
    certificado_id: UUID,
    nuevo: EstadoCertificado,
) -> CertificadoObra:
    cert = await _get_certificado_or_404(db, certificado_id)
    if cert.estado != EstadoCertificado.pendiente_revision:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Solo se puede transicionar desde 'pendiente_revision' "
            f"(estado actual: '{cert.estado.value}')",
        )
    cert.estado = nuevo
    await db.commit()
    await db.refresh(cert)
    return cert


@router.post(
    "/{certificado_id}/reextraer",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Re-encola la extracción del PDF",
    description=(
        "Solo válido en estado `pendiente_revision`. "
        "Si `extracted_data` ya tiene datos, se requiere `forzar=true` para sobreescribir."
    ),
)
async def reextraer_certificado(
    certificado_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    forzar: bool = Body(False, embed=True),
) -> Response:
    cert = await _get_certificado_or_404(db, certificado_id)

    # Permitimos re-extraer desde pendiente_revision y también desde procesando
    # (por si el worker murió mid-execution sin poder completar el finally).
    if cert.estado not in (
        EstadoCertificado.pendiente_revision,
        EstadoCertificado.procesando,
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Solo se puede re-extraer desde 'pendiente_revision' o 'procesando' "
            f"(estado actual: '{cert.estado.value}')",
        )

    tiene_datos = bool(cert.extracted_data)
    if tiene_datos and not forzar:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "El certificado ya tiene datos extraídos. "
            "Envía `forzar: true` para sobreescribirlos.",
        )

    # Limpia el error previo al re-encolar
    cert.extraction_error = None
    await db.commit()

    try:
        extraer_certificado.delay(str(certificado_id))
    except Exception as exc:
        logger.warning(
            "No se pudo encolar re-extracción para %s: %s", certificado_id, exc
        )
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "No se pudo encolar la tarea. Verifica que el broker esté disponible.",
        ) from exc

    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{certificado_id}/validar",
    response_model=CertificadoObraRead,
    summary="Marca el certificado como validado",
)
async def validar_certificado(
    certificado_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CertificadoObra:
    return await _transicionar_estado(db, certificado_id, EstadoCertificado.validado)


@router.post(
    "/{certificado_id}/rechazar",
    response_model=CertificadoObraRead,
    summary="Marca el certificado como rechazado",
)
async def rechazar_certificado(
    certificado_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CertificadoObra:
    return await _transicionar_estado(db, certificado_id, EstadoCertificado.rechazado)
