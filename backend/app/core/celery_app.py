from celery import Celery

from app.config import settings

celery_app = Celery(
    "licitum",
    broker=settings.broker_url,
    backend=settings.result_backend,
    include=["workers.extraccion_pdf"],
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
)
