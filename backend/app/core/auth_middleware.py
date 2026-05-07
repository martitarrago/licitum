"""Middleware ligero que verifica JWT en /api/v1/*.

Para el MVP demo: solo nos aseguramos de que el request trae un JWT válido
de Supabase. NO derivamos empresa_id aquí (eso queda para la fase de
hardening); el frontend sigue pasando empresa_id en query params.

Excepciones:
- `/health`, `/api/v1/system/health` → siempre permitidos.
- En `APP_ENV=dev`, requests sin Authorization header pasan (scripts/tests).
- En `APP_ENV=dev`, requests con header `X-Empresa-Id-Dev` saltan validación.
"""
from __future__ import annotations

import httpx
import jwt
from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings


PUBLIC_PATHS = {
    "/health",
    "/api/v1/system/health",
    "/docs",
    "/redoc",
    "/openapi.json",
}


async def _decode_token(token: str) -> dict | None:
    """Devuelve el payload del JWT si es válido, None si no."""
    if settings.supabase_jwt_secret:
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.InvalidTokenError:
            return None
    # Fallback remoto: pregunta a Supabase. Más lento pero funciona con keys ES256.
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    async with httpx.AsyncClient(timeout=5.0) as client:
        r = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
        )
    if r.status_code != 200:
        return None
    data = r.json()
    return {
        "sub": data.get("id"),
        "app_metadata": data.get("app_metadata") or {},
        "email": data.get("email"),
    }


class SupabaseAuthMiddleware(BaseHTTPMiddleware):
    """Valida JWT en /api/v1/* y guarda user info en request.state.

    Las dependencies (`get_current_user_id`, `get_current_empresa_id`)
    leen desde `request.state.user_id` para no re-validar el token.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        if method == "OPTIONS" or path in PUBLIC_PATHS:
            return await call_next(request)
        if not path.startswith("/api/v1/"):
            return await call_next(request)

        # Dev bypass por header (scripts/tests). Marcamos request.state para
        # que las dependencies usen el header X-Empresa-Id-Dev directamente.
        if settings.app_env == "dev":
            x_dev = request.headers.get("x-empresa-id-dev")
            if x_dev:
                request.state.dev_empresa_id = x_dev
                return await call_next(request)
            if not settings.supabase_url:
                return await call_next(request)

        auth = request.headers.get("authorization", "")
        if not auth.lower().startswith("bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Falta header Authorization Bearer"},
            )
        token = auth.split(" ", 1)[1].strip()
        payload = await _decode_token(token)
        if payload is None:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Token inválido o expirado"},
            )

        # Guardamos lo que necesitamos en request.state para que las
        # dependencies no tengan que re-validar.
        request.state.user_id = payload.get("sub")
        request.state.user_app_metadata = payload.get("app_metadata") or {}

        return await call_next(request)
