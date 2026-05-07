from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_empresa_id
from app.db.session import get_db
from app.models.documento_empresa import DocumentoEmpresa
from app.schemas.documento_empresa import (
    DIAS_PRE_CADUCIDAD,
    DocumentoEmpresaCreate,
    DocumentoEmpresaRead,
    DocumentoEmpresaUpdate,
    ResumenSaludDocumental,
)
from app.services.scores_trigger import disparar_recalculo_scores
from app.services.storage import R2Storage, get_storage

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PDF_SIZE = 25 * 1024 * 1024  # 25 MB


async def _get_or_404(db: AsyncSession, doc_id: UUID) -> DocumentoEmpresa:
    stmt = select(DocumentoEmpresa).where(
        DocumentoEmpresa.id == doc_id,
        DocumentoEmpresa.deleted_at.is_(None),
    )
    obj = (await db.execute(stmt)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"Documento {doc_id} no encontrado"
        )
    return obj


@router.post(
    "",
    response_model=DocumentoEmpresaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Sube PDF a R2 y crea documento administrativo",
)
async def crear_con_pdf(
    *,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
    pdf: Annotated[UploadFile, File(description="Documento PDF")],
    tipo: Annotated[str, Form(max_length=32)],
    empresa_id: UUID = Depends(get_current_empresa_id),
    titulo: Annotated[str | None, Form(max_length=255)] = None,
    fecha_emision: Annotated[date | None, Form()] = None,
    fecha_caducidad: Annotated[date | None, Form()] = None,
    notas: Annotated[str | None, Form()] = None,
) -> DocumentoEmpresa:
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

    key = f"documentos/{empresa_id}/{uuid4()}.pdf"
    pdf_url = await storage.upload(key, body, content_type="application/pdf")

    obj = DocumentoEmpresa(
        empresa_id=empresa_id,
        tipo=tipo,
        titulo=titulo or None,
        pdf_url=pdf_url,
        fecha_emision=fecha_emision,
        fecha_caducidad=fecha_caducidad,
        notas=notas or None,
    )
    db.add(obj)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        await storage.delete(key)
        raise
    await db.refresh(obj)
    disparar_recalculo_scores(obj.empresa_id)
    return obj


@router.post(
    "/manual",
    response_model=DocumentoEmpresaRead,
    status_code=status.HTTP_201_CREATED,
    summary="Crea documento sin PDF (entrada manual)",
)
async def crear_manual(
    data: DocumentoEmpresaCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> DocumentoEmpresa:
    payload = data.model_dump()
    payload["empresa_id"] = empresa_id
    obj = DocumentoEmpresa(**payload, pdf_url=None)
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    disparar_recalculo_scores(obj.empresa_id)
    return obj


@router.get(
    "",
    response_model=list[DocumentoEmpresaRead],
    summary="Lista documentos de una empresa, opcionalmente filtrados por tipo",
)
async def listar(
    db: Annotated[AsyncSession, Depends(get_db)],
    tipo: str | None = None,
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> list[DocumentoEmpresa]:
    stmt = (
        select(DocumentoEmpresa)
        .where(
            DocumentoEmpresa.empresa_id == empresa_id,
            DocumentoEmpresa.deleted_at.is_(None),
        )
        .order_by(
            DocumentoEmpresa.fecha_caducidad.asc().nulls_last(),
            DocumentoEmpresa.created_at.desc(),
        )
    )
    if tipo is not None:
        stmt = stmt.where(DocumentoEmpresa.tipo == tipo)
    return list((await db.execute(stmt)).scalars().all())


@router.get(
    "/resumen-salud",
    response_model=ResumenSaludDocumental,
    summary="Resumen de salud documental para el KPI de /empresa",
)
async def resumen_salud(
    db: Annotated[AsyncSession, Depends(get_db)],
    empresa_id: UUID = Depends(get_current_empresa_id),
) -> ResumenSaludDocumental:
    docs_orm = list(
        (
            await db.execute(
                select(DocumentoEmpresa).where(
                    DocumentoEmpresa.empresa_id == empresa_id,
                    DocumentoEmpresa.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    docs = [DocumentoEmpresaRead.model_validate(d) for d in docs_orm]
    vigentes = sum(1 for d in docs if d.estado == "vigente")
    a_caducar = sum(1 for d in docs if d.estado == "a_caducar")
    caducados = sum(1 for d in docs if d.estado == "caducado")
    # Próximos a caducar / ya caducados, ordenados por urgencia ASC.
    proximos = sorted(
        (d for d in docs if d.estado in ("a_caducar", "caducado")),
        key=lambda d: d.fecha_caducidad or date.max,
    )[:5]
    return ResumenSaludDocumental(
        total=len(docs),
        vigentes=vigentes,
        a_caducar=a_caducar,
        caducados=caducados,
        proximos_a_caducar=proximos,
    )


@router.get(
    "/{doc_id}/pdf",
    summary="Stream del PDF (proxy desde R2 para servir same-origin al iframe)",
)
async def proxy_pdf(
    doc_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
) -> Response:
    obj = await _get_or_404(db, doc_id)
    if not obj.pdf_url:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Este documento no tiene PDF asociado"
        )
    try:
        key = storage.key_from_url(obj.pdf_url)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)
        ) from exc
    body = await storage.get_bytes(key)
    return StreamingResponse(
        iter([body]),
        media_type="application/pdf",
        headers={"Content-Disposition": "inline"},
    )


@router.patch(
    "/{doc_id}",
    response_model=DocumentoEmpresaRead,
    summary="Actualiza campos del documento",
)
async def actualizar(
    doc_id: UUID,
    data: DocumentoEmpresaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DocumentoEmpresa:
    obj = await _get_or_404(db, doc_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "No se enviaron campos para actualizar"
        )
    for field, value in updates.items():
        setattr(obj, field, value)
    await db.commit()
    await db.refresh(obj)
    # Cambios en fecha_caducidad afectan al hard_filter_documentacion_al_dia
    disparar_recalculo_scores(obj.empresa_id)
    return obj


@router.delete(
    "/{doc_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft delete del documento (también borra el PDF en R2 si existe)",
)
async def eliminar(
    doc_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    storage: Annotated[R2Storage, Depends(get_storage)],
) -> None:
    obj = await _get_or_404(db, doc_id)
    emp_id = obj.empresa_id
    obj.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    disparar_recalculo_scores(emp_id)
    if obj.pdf_url:
        try:
            await storage.delete(storage.key_from_url(obj.pdf_url))
        except Exception as exc:  # noqa: BLE001
            # El soft delete ya se persistió; el PDF en R2 quedará huérfano
            # pero el usuario no ve diferencia. Loggeamos para limpieza.
            logger.warning(
                "No se pudo borrar PDF de R2 tras soft delete %s: %s", doc_id, exc
            )
