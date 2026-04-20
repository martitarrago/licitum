from fastapi import APIRouter

from app.api.v1.solvencia import certificados

router = APIRouter(prefix="/solvencia")
router.include_router(
    certificados.router,
    prefix="/certificados",
    tags=["solvencia · certificados"],
)
