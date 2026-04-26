#!/bin/bash
set -e

if [ "${SERVICE_TYPE:-api}" = "worker" ]; then
    echo "→ Arrancando Celery worker + Beat embebido…"
    # --beat: Beat embebido en el mismo proceso que el worker. Para 1 cron
    # diario es la opción más simple (1 servicio en Railway, no 2). Si en
    # el futuro aparece >1 instancia de worker, mover Beat a un servicio
    # propio para evitar disparos duplicados.
    # --schedule=/tmp/celerybeat-schedule: en disco efímero del contenedor;
    # tras un restart se reescribe sin problema (cron simples no necesitan
    # persistencia del último disparo).
    exec python -m celery -A app.core.celery_app worker -l info --pool=solo \
        --beat --schedule=/tmp/celerybeat-schedule
else
    echo "→ Ejecutando migraciones Alembic…"
    python -m alembic upgrade head

    echo "→ Arrancando uvicorn en puerto ${PORT:-8000}…"
    exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
fi
