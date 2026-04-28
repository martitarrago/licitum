from fastapi import APIRouter

from app.api.v1.empresa import (
    certificados,
    clasificaciones,
    documentos,
    maquinaria,
    personal,
    preferencias,
    relic,
    sistemas_gestion,
)

router = APIRouter(prefix="/empresa")
router.include_router(
    certificados.router,
    prefix="/certificados",
    tags=["empresa · certificados"],
)
router.include_router(
    clasificaciones.router,
    prefix="/clasificaciones",
    tags=["empresa · clasificaciones"],
)
router.include_router(
    documentos.router,
    prefix="/documentos",
    tags=["empresa · documentos"],
)
router.include_router(
    relic.router,
    prefix="/relic",
    tags=["empresa · relic"],
)
router.include_router(
    personal.router,
    prefix="/personal",
    tags=["empresa · personal"],
)
router.include_router(
    maquinaria.router,
    prefix="/maquinaria",
    tags=["empresa · maquinaria"],
)
router.include_router(
    sistemas_gestion.router,
    prefix="/sistemas-gestion",
    tags=["empresa · sistemas-gestion"],
)
router.include_router(
    preferencias.router,
    prefix="/preferencias",
    tags=["empresa · preferencias"],
)
