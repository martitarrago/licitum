from fastapi import APIRouter

from app.api.v1 import empresas, licitaciones, sobre_a, tracker
from app.api.v1.empresa.router import router as empresa_router
from app.api.v1.pliegos.router import router as pliegos_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(empresas.router, prefix="/empresas", tags=["empresas"])
api_router.include_router(empresa_router)
api_router.include_router(licitaciones.router, prefix="/licitaciones", tags=["licitaciones"])
api_router.include_router(pliegos_router, prefix="/pliegos", tags=["pliegos"])
api_router.include_router(sobre_a.router, prefix="/sobre-a", tags=["sobre-a"])
api_router.include_router(tracker.router, prefix="/tracker", tags=["tracker"])
