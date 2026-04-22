#!/bin/bash
set -e

if [ "${SERVICE_TYPE:-api}" = "worker" ]; then
    echo "→ Arrancando Celery worker…"
    exec python -m celery -A app.core.celery_app worker -l info --pool=solo
else
    echo "→ Ejecutando migraciones Alembic…"
    python -m alembic upgrade head

    echo "→ Arrancando uvicorn en puerto ${PORT:-8000}…"
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
fi
