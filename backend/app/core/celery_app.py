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
        "workers.intel_pliego_dispatch",
        "workers.intel_pscp",
        "workers.intel_scores",
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
    # Reciclar el proceso del worker tras CADA tarea — libera memoria
    # acumulada por OCR (tesseract), pdfplumber, cliente Claude y sesión
    # SQLAlchemy. Sin esto el worker sufría OOM tras 3-7 extracciones de
    # pliego consecutivas. Coste: +3-5s overhead por tarea (bootstrap
    # del proceso). Aceptable para tareas que ya tardan 30-60s.
    worker_max_tasks_per_child=1,
    # Tope de RSS por proceso — si una sola extracción supera el cap
    # (PDF grande con OCR pesado), Celery recicla el proceso preventivamente
    # ANTES de que Linux haga OOM-kill brutal. Diferencia clave: con OOM-kill
    # la tarea queda en `procesando` huérfana en BD; con max_memory el reciclaje
    # es controlado y la tarea reentregada vía task_acks_late se procesa en un
    # proceso fresco. 2 GB en Railway Hobby (8 GB total) deja margen para
    # extracciones de Projectes Tècnics escaneados (peak ~1-1.5 GB).
    worker_max_memory_per_child=2000000,
    # Celery Beat embebido en el worker (flag `--beat` en start.sh).
    # Horas interpretadas en Europe/Madrid; Celery hace la conversión a UTC.
    #
    # Cadencia:
    #   · Ingesta PSCP + scores: cada 4h (07, 11, 15, 19) — PSCP publica
    #     licitaciones a lo largo del día, no solo de madrugada.
    #   · Adjudicaciones históricas + mviews: 1x/día a las 06:00 — datos
    #     históricos que no cambian intraday.
    #   · RELIC: 1x/día a las 08:00 — cambia muy raramente.
    beat_schedule={
        # ── Ingesta feed PSCP — cada 4h ───────────────────────────────────
        # expires=30min: si el worker está ocupado y no recoge en ese tiempo,
        # descarta la tarea (la siguiente pasada lo recogerá).
        "ingesta-pscp-7h": {
            "task": "workers.ingesta_pscp.ingestar_feed",
            "schedule": crontab(hour=7, minute=0),
            "options": {"expires": 30 * 60},
        },
        "ingesta-pscp-11h": {
            "task": "workers.ingesta_pscp.ingestar_feed",
            "schedule": crontab(hour=11, minute=0),
            "options": {"expires": 30 * 60},
        },
        "ingesta-pscp-15h": {
            "task": "workers.ingesta_pscp.ingestar_feed",
            "schedule": crontab(hour=15, minute=0),
            "options": {"expires": 30 * 60},
        },
        "ingesta-pscp-19h": {
            "task": "workers.ingesta_pscp.ingestar_feed",
            "schedule": crontab(hour=19, minute=0),
            "options": {"expires": 30 * 60},
        },
        # ── Scores de ganabilidad — 15min después de cada ingesta ─────────
        # Idempotent: si M2 no cambió, skip vía empresa_context_hash.
        "intel-scores-7h15": {
            "task": "workers.intel_scores.calcular_para_todas_empresas",
            "schedule": crontab(hour=7, minute=15),
            "options": {"expires": 60 * 60},
        },
        "intel-scores-11h15": {
            "task": "workers.intel_scores.calcular_para_todas_empresas",
            "schedule": crontab(hour=11, minute=15),
            "options": {"expires": 60 * 60},
        },
        "intel-scores-15h15": {
            "task": "workers.intel_scores.calcular_para_todas_empresas",
            "schedule": crontab(hour=15, minute=15),
            "options": {"expires": 60 * 60},
        },
        "intel-scores-19h15": {
            "task": "workers.intel_scores.calcular_para_todas_empresas",
            "schedule": crontab(hour=19, minute=15),
            "options": {"expires": 60 * 60},
        },
        # ── Adjudicaciones históricas + mviews — 1x/día ───────────────────
        # Antes a las 06:00 Madrid (= 04:00 UTC). Beat solo dispara crons que
        # vencen mientras está vivo, y los pushes diarios entre 14-19 UTC
        # reinician el worker; cuando entraba en producción (~05:00 UTC) ya
        # había pasado la ventana de las 04:00 UTC y el cron se perdía. A las
        # 22:00 Madrid (= 20-21 UTC) hay 19h sin pushes hasta el día siguiente,
        # ventana segura. PSCP publica todo el día, cambiar la hora no impacta
        # frescura del dato. Ver catchup_pscp_incremental.py si vuelve a fallar.
        "intel-pscp-incremental": {
            "task": "workers.intel_pscp.incremental_sync",
            "schedule": crontab(hour=22, minute=0),
            "kwargs": {"lookback_hours": 36, "tipus_contracte": "Obres"},
            "options": {"expires": 30 * 60},
        },
        "intel-pscp-mview-refresh": {
            "task": "workers.intel_pscp.refresh_mviews",
            "schedule": crontab(hour=22, minute=30),
            "options": {"expires": 30 * 60},
        },
        # ── RELIC — 1x/día ────────────────────────────────────────────────
        "sync-relic-diaria": {
            "task": "workers.sync_relic.sincronizar_todas",
            "schedule": crontab(hour=8, minute=0),
            "options": {"expires": 30 * 60},
        },
    },
)
