from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "licitum",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=[
        "workers.extraccion_pdf",
        "workers.extraccion_pliego",
        "workers.ingesta_pscp",
        "workers.intel_pscp",
        "workers.recalcular_semaforos",
        "workers.sync_relic",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Madrid",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Cron diaria — Celery Beat embebido en el worker (flag `--beat` en start.sh).
    # Hora interpretada en Europe/Madrid; Celery hace la conversión a UTC.
    beat_schedule={
        "ingesta-pscp-diaria": {
            "task": "workers.ingesta_pscp.ingestar_feed",
            "schedule": crontab(hour=7, minute=0),
            "options": {
                # Si ya hay una ingesta encolada/ejecutándose, no apilar otra:
                # tareas en cola más de 30 min se descartan al recoger.
                "expires": 30 * 60,
            },
        },
        # Sync RELIC ~1h después de la ingesta PSCP. Reemplaza clasificaciones
        # de cada empresa registrada en bloque; tras el sync, encolamos
        # recálculo del semáforo del Radar (idempotente).
        "sync-relic-diaria": {
            "task": "workers.sync_relic.sincronizar_todas",
            "schedule": crontab(hour=8, minute=0),
            "options": {"expires": 30 * 60},
        },
        # Data layer PSCP — sync incremental obras adjudicadas + refresh mviews.
        # PSCP actualiza datasets de madrugada; corremos a las 6am Madrid.
        # Lookback 36h cubre cualquier delay del feed o reintentos.
        "intel-pscp-incremental": {
            "task": "workers.intel_pscp.incremental_sync",
            "schedule": crontab(hour=6, minute=0),
            "kwargs": {"lookback_hours": 36, "tipus_contracte": "Obres"},
            "options": {"expires": 30 * 60},
        },
        # Refresh mviews 30min después del sync. Skip inteligente si no hay
        # cambios reales (ver _has_real_changes_since_last_refresh).
        "intel-pscp-mview-refresh": {
            "task": "workers.intel_pscp.refresh_mviews",
            "schedule": crontab(hour=6, minute=30),
            "options": {"expires": 30 * 60},
        },
    },
)
