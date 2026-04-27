from fastapi import APIRouter

from app.api.v1.empresa import certificados, clasificaciones, documentos, relic

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
