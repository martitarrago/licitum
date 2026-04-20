from fastapi import APIRouter

from app.api.v1 import clasificaciones, empresas
from app.api.v1.solvencia.router import router as solvencia_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(empresas.router, prefix="/empresas", tags=["empresas"])
api_router.include_router(
    clasificaciones.router, prefix="/clasificaciones", tags=["clasificaciones"]
)
api_router.include_router(solvencia_router)
