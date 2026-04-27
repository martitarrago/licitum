from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated, Sequence
from uuid import UUID, uuid4

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
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
from app.services.semaforo_trigger import disparar_recalculo_semaforo
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


TIPOS_VALIDOS_SOLVENCIA = {"cert_buena_ejecucion", "acta_recepcion", "cert_rolece"}


class CertificadoManualCreate(BaseModel):
    empresa_id: UUID
    tipo_documento: str
    titulo: str | None = None
    organismo: str | None = None
    importe_adjudicacion: Decimal | None = None
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    numero_expediente: str | None = None
    cpv_codes: list[str] = []
    clasificacion_grupo: str | None = None
    clasificacion_subgrupo: str | None = None
    porcentaje_ute: Decimal | None = None
    contratista_principal: bool = True


@router.post(
    "/manual",
    response_model=CertificadoObraRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea certificado con datos introducidos manualmente (sin PDF)",
)
async def crear_certificado_manual(
    data: CertificadoManualCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CertificadoObra:
    es_valido = data.tipo_documento in TIPOS_VALIDOS_SOLVENCIA
    certificado = CertificadoObra(
        empresa_id=data.empresa_id,
        titulo=data.titulo,
        organismo=data.organismo,
        importe_adjudicacion=data.importe_adjudicacion,
        fecha_inicio=data.fecha_inicio,
        fecha_fin=data.fecha_fin,
        cpv_codes=data.cpv_codes,
        clasificacion_grupo=data.clasificacion_grupo,
        clasificacion_subgrupo=data.clasificacion_subgrupo,
        numero_expediente=data.numero_expediente,
        porcentaje_ute=data.porcentaje_ute,
        contratista_principal=data.contratista_principal,
        pdf_url=None,
        tipo_documento=data.tipo_documento,
        es_valido_solvencia=es_valido,
        razon_invalidez=None if es_valido else "Tipo de documento no válido para acreditar solvencia",
        estado=EstadoCertificado.pendiente_revision,
        extracted_data={},
    )
    db.add(certificado)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Número de expediente duplicado o empresa_id inexistente",
        ) from exc
    await db.refresh(certificado)
    if es_valido:
        disparar_recalculo_semaforo()
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


class ResumenGrupo(BaseModel):
    grupo: str
    importe_total: Decimal
    num_obras: int


class ResumenSolvencia(BaseModel):
    por_grupo: list[ResumenGrupo]
    anualidad_media: Decimal
    anualidad_pico: Decimal
    anio_pico: int | None
    total_obras: int
    periodo_inicio: date
    periodo_fin: date


@router.get(
    "/resumen-solvencia",
    response_model=ResumenSolvencia,
    summary="Resumen de solvencia acreditada — últimos 5 años, solo certificados válidos",
)
async def resumen_solvencia(
    empresa_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ResumenSolvencia:
    periodo_fin = date.today()
    periodo_inicio = periodo_fin - timedelta(days=5 * 365)

    stmt = (
        select(CertificadoObra)
        .where(
            CertificadoObra.empresa_id == empresa_id,
            CertificadoObra.deleted_at.is_(None),
            CertificadoObra.estado == EstadoCertificado.validado,
            CertificadoObra.contratista_principal.is_(True),
            CertificadoObra.fecha_fin >= periodo_inicio,
            CertificadoObra.importe_adjudicacion.isnot(None),
        )
    )
    result = await db.execute(stmt)
    certs = result.scalars().all()

    # Filtra los marcados explícitamente como no válidos; incluye los que aún no tienen clasificación
    certs_validos = [
        c for c in certs if c.es_valido_solvencia is not False
    ]

    por_grupo: dict[str, Decimal] = {}
    conteos: dict[str, int] = {}
    por_anio: dict[int, Decimal] = {}
    total_importe = Decimal(0)

    for c in certs_validos:
        importe_base = c.importe_adjudicacion or Decimal(0)
        if c.porcentaje_ute is not None:
            importe = importe_base * c.porcentaje_ute / 100
        else:
            importe = importe_base
        total_importe += importe
        grupo = c.clasificacion_grupo or "Sin clasificar"
        por_grupo[grupo] = por_grupo.get(grupo, Decimal(0)) + importe
        conteos[grupo] = conteos.get(grupo, 0) + 1
        if c.fecha_fin is not None:
            anio = c.fecha_fin.year
            por_anio[anio] = por_anio.get(anio, Decimal(0)) + importe

    grupos_ordenados = sorted(por_grupo.items(), key=lambda x: x[1], reverse=True)
    num_years = Decimal(5)
    anualidad_media = (total_importe / num_years).quantize(Decimal("0.01")) if total_importe else Decimal(0)

    anio_pico: int | None = None
    anualidad_pico = Decimal(0)
    if por_anio:
        anio_pico = max(por_anio, key=lambda a: por_anio[a])
        anualidad_pico = por_anio[anio_pico].quantize(Decimal("0.01"))

    return ResumenSolvencia(
        por_grupo=[
            ResumenGrupo(grupo=g, importe_total=v.quantize(Decimal("0.01")), num_obras=conteos[g])
            for g, v in grupos_ordenados
        ],
        anualidad_media=anualidad_media,
        anualidad_pico=anualidad_pico,
        anio_pico=anio_pico,
        total_obras=len(certs_validos),
        periodo_inicio=periodo_inicio,
        periodo_fin=periodo_fin,
    )


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
    disparar_recalculo_semaforo()
    return cert


class BatchDeleteBody(BaseModel):
    ids: list[UUID]


@router.delete(
    "/batch",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete de múltiples certificados",
)
async def eliminar_batch(
    body: BatchDeleteBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    now = datetime.now(timezone.utc)
    stmt = (
        select(CertificadoObra)
        .where(
            CertificadoObra.id.in_(body.ids),
            CertificadoObra.deleted_at.is_(None),
        )
    )
    result = await db.execute(stmt)
    certs = result.scalars().all()
    for cert in certs:
        cert.deleted_at = now
    await db.commit()
    if certs:
        disparar_recalculo_semaforo()


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
    disparar_recalculo_semaforo()


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
    # validar / rechazar afectan al canal 2 del semáforo (certificados válidos)
    disparar_recalculo_semaforo()
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
    "/{certificado_id}/revertir",
    response_model=CertificadoObraRead,
    summary="Devuelve el certificado a pendiente_revision para re-edición",
)
async def revertir_certificado(
    certificado_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CertificadoObra:
    cert = await _get_certificado_or_404(db, certificado_id)
    if cert.estado not in (EstadoCertificado.validado, EstadoCertificado.rechazado):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Solo se puede revertir desde 'validado' o 'rechazado' "
            f"(estado actual: '{cert.estado.value}')",
        )
    cert.estado = EstadoCertificado.pendiente_revision
    await db.commit()
    await db.refresh(cert)
    # revertir un validado lo deja de contar en el semáforo
    disparar_recalculo_semaforo()
    return cert


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


@router.get(
    "/{certificado_id}/pdf",
    summary="Proxy del PDF desde R2 — same-origin para el iframe",
)
async def proxy_pdf(
    certificado_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
) -> StreamingResponse:
    cert = await _get_certificado_or_404(db, certificado_id)
    key = storage.key_from_url(cert.pdf_url)
    pdf_bytes = await storage.get_bytes(key)
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline", "Cache-Control": "private, max-age=3600"},
    )
