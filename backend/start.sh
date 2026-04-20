#!/bin/bash
set -e

echo "→ Ejecutando migraciones Alembic…"
python -m alembic upgrade head

echo "→ Arrancando uvicorn en puerto ${PORT:-8000}…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
