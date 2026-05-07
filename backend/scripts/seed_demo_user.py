"""Seed del usuario demo en Supabase Auth + tabla user_empresa.

Crea (o actualiza) `demo@licitum.com` con contraseña `2026` y lo vincula a la
empresa Bosch (`00000000-0000-0000-0000-000000000001`). Idempotente.

Requiere `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` en el .env del backend.

Uso:
    cd backend
    ./.venv/Scripts/python.exe scripts/seed_demo_user.py
"""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path
from uuid import UUID

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("seed_user")

EMPRESA_ID = UUID("00000000-0000-0000-0000-000000000001")
DEMO_EMAIL = "demo@licitum.com"
DEMO_PASSWORD = "2026"


async def _get_user_by_email(client: httpx.AsyncClient, email: str) -> dict | None:
    """Busca un user en Supabase por email vía admin API. Devuelve dict o None."""
    r = await client.get(
        f"{settings.supabase_url}/auth/v1/admin/users",
        headers={
            "apikey": settings.supabase_service_key,
            "Authorization": f"Bearer {settings.supabase_service_key}",
        },
        params={"email": email},
    )
    r.raise_for_status()
    data = r.json()
    users = data.get("users") if isinstance(data, dict) else data
    if not users:
        return None
    for u in users:
        if u.get("email", "").lower() == email.lower():
            return u
    return None


async def _create_or_update_user(client: httpx.AsyncClient) -> str:
    """Crea o actualiza el user demo. Devuelve user_id (UUID)."""
    existing = await _get_user_by_email(client, DEMO_EMAIL)
    payload = {
        "email": DEMO_EMAIL,
        "password": DEMO_PASSWORD,
        "email_confirm": True,
        "app_metadata": {"empresa_id": str(EMPRESA_ID)},
        "user_metadata": {"display_name": "Demo Bosch"},
    }
    headers = {
        "apikey": settings.supabase_service_key,
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "Content-Type": "application/json",
    }
    if existing:
        user_id = existing["id"]
        log.info("User ya existe (%s) — actualizando password y app_metadata", user_id)
        r = await client.put(
            f"{settings.supabase_url}/auth/v1/admin/users/{user_id}",
            headers=headers,
            json=payload,
        )
        r.raise_for_status()
        return user_id

    log.info("Creando user %s...", DEMO_EMAIL)
    r = await client.post(
        f"{settings.supabase_url}/auth/v1/admin/users",
        headers=headers,
        json=payload,
    )
    r.raise_for_status()
    user_id = r.json()["id"]
    log.info("User creado: %s", user_id)
    return user_id


async def _link_user_empresa(user_id: str) -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        await db.execute(
            text(
                """
                INSERT INTO user_empresa (user_id, empresa_id, rol)
                VALUES (:user_id, :empresa_id, 'admin')
                ON CONFLICT (user_id) DO UPDATE SET empresa_id = EXCLUDED.empresa_id
                """
            ),
            {"user_id": user_id, "empresa_id": str(EMPRESA_ID)},
        )
        await db.commit()
    await engine.dispose()
    log.info("Vínculo user_empresa creado: user=%s -> empresa=%s", user_id, EMPRESA_ID)


async def main() -> None:
    if not settings.supabase_url or not settings.supabase_service_key:
        log.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en .env")
        sys.exit(1)

    async with httpx.AsyncClient(timeout=15.0) as client:
        user_id = await _create_or_update_user(client)

    await _link_user_empresa(user_id)
    log.info("✓ Listo. Login con %s / %s", DEMO_EMAIL, DEMO_PASSWORD)


if __name__ == "__main__":
    asyncio.run(main())
