"""Dependencies de auth — leen del request.state que llena el middleware.

El `SupabaseAuthMiddleware` ya validó el JWT y guardó `user_id` en
`request.state`. Aquí solo:
  - `get_current_user_id`: devuelve el sub del JWT (o None en dev-bypass).
  - `get_current_empresa_id`: resuelve la empresa_id del usuario, primero
    desde `app_metadata.empresa_id` (cache en JWT) y si no, vía DB lookup
    contra `user_empresa`.

Para scripts/tests sin auth real: header `X-Empresa-Id-Dev` en APP_ENV=dev.
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.models.user_empresa import UserEmpresa


class AuthError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


async def get_current_user_id(request: Request) -> str | None:
    """user_id (sub) del JWT validado por el middleware. None si dev-bypass."""
    if settings.app_env == "dev" and getattr(request.state, "dev_empresa_id", None):
        return None
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        # Esto no debería pasar si el middleware está activo, pero por
        # defensa devolvemos 401 en lugar de 500.
        raise AuthError("No autenticado")
    return user_id


async def get_current_empresa_id(
    request: Request,
    user_id: Annotated[str | None, Depends(get_current_user_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> uuid.UUID:
    """Empresa_id del usuario actual.

    Prioriza `app_metadata.empresa_id` del JWT (rápido, sin DB hit). Si no
    está, busca en la tabla `user_empresa`.
    """
    # Dev bypass
    dev_id = getattr(request.state, "dev_empresa_id", None)
    if user_id is None and dev_id:
        try:
            return uuid.UUID(dev_id)
        except ValueError as exc:
            raise AuthError("X-Empresa-Id-Dev inválido") from exc

    if user_id is None:
        raise AuthError("No autenticado")

    # 1) Custom claim en JWT (lo seedeamos con app_metadata.empresa_id)
    app_metadata = getattr(request.state, "user_app_metadata", {}) or {}
    claim_empresa_id = app_metadata.get("empresa_id")
    if claim_empresa_id:
        try:
            return uuid.UUID(claim_empresa_id)
        except ValueError:
            pass  # Cae a DB lookup

    # 2) DB lookup
    stmt = select(UserEmpresa.empresa_id).where(
        UserEmpresa.user_id == uuid.UUID(user_id)
    )
    result = await db.execute(stmt)
    empresa_id = result.scalar_one_or_none()
    if empresa_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario sin empresa vinculada",
        )
    return empresa_id


CurrentEmpresaId = Annotated[uuid.UUID, Depends(get_current_empresa_id)]
