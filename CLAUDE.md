# Licitum — Project context

## Product
SaaS B2B para PYMES de construcción en España (Cataluña primero).
Automatiza licitación pública: detectar → analizar → estudiar → redactar → ganar.
Usuario: jefe de obra o administrativo, 40-55 años, PYME 5-50 empleados.

## Stack
Frontend: Next.js 14 App Router + TypeScript + Tailwind CSS + React Query
Backend:  FastAPI (Python 3.11+) + PostgreSQL + pgvector + Redis + Celery
Storage:  Cloudflare R2 (PDFs) + PostgreSQL (datos)
AI:       Claude API claude-sonnet-4-6 — structured outputs siempre
Deploy:   Railway (backend + worker) + Vercel (frontend)

## Design system (DECISIONES CERRADAS — no cambiar sin confirmación)
Feeling:        Editorial y limpio   — B&N con acento naranja
Color primario: #18181B (negro zinc — botones, mark, activos)
Color acento:   #F59E0B (naranja — solo logo dot y franja activa sidebar, ≤1 aparición por pantalla)
Dark mode:      sí — fondo #0A0A0A (negro profundo, grises zinc puros)
Tipografía:     [se definirá en fase de diseño]
Componente ref: /frontend/src/components/ui/LicitacionCard.tsx (cuando exista)

## Módulos
Orden de construcción: **M3 Solvencia** → M2 Radar IA → M7 Admin → M1 Dashboard → M4 BC3 → M5 Memorias → M6 Competencia → M8 Histórico

Documentación por módulo en `docs/modules/`:
- [M1 Dashboard](docs/modules/M1-dashboard.md) — pantalla "buenos días" con resumen empresa
- [M2 Radar IA](docs/modules/M2-radar-ia.md) — feed PLACSP filtrado por semáforo
- [M3 Solvencia](docs/modules/M3-solvencia.md) ✅ — certificados de obra + clasificaciones ROLECE
- [M4 BC3](docs/modules/M4-bc3.md) — extracción presupuesto administrativo + análisis de costes
- [M5 Memorias](docs/modules/M5-memorias.md) — generación de sobres A/B/C
- [M6 Competencia](docs/modules/M6-competencia.md) — histórico de bajas + simulador
- [M7 Admin](docs/modules/M7-admin.md) — DEUC + caja de avales
- [M8 Histórico](docs/modules/M8-historico.md) — aprendizaje de actas de resolución

## Reglas de código
- Async/await en todos los endpoints FastAPI
- Pydantic v2 para schemas y validación
- React Query para todo fetch — nunca `useEffect` para datos
- UUID como PKs, soft delete con `deleted_at`
- Migraciones solo con Alembic — nunca alterar BBDD manualmente
- Variables de entorno en `.env` — nunca hardcodear keys
- API Claude: temperatura 0 para extracción, 0.3 para generación de texto
- Operaciones pesadas (PDFs, embeddings) siempre en Celery worker, nunca en request

## Reglas de diseño
- Antes de crear componente nuevo: revisar `/frontend/src/components/ui/`
- No inventar estilos nuevos — extender los existentes
- No instalar librerías UI sin preguntar
- Iconos: `lucide-react` únicamente
- Semáforo de solvencia: verde `#16A34A` / amarillo `#EA580C` / rojo `#DC2626`

## Regla crítica — extracción de PDFs
NUNCA guardar datos extraídos de PDF sin confirmación explícita del usuario.
El sistema propone. El usuario confirma. Sin bypass posible.

## Cómo arrancar el stack local

IMPORTANTE: usar el venv, NO `py -3.11` directamente (no tiene uvicorn).
NO usar `--reload` en uvicorn (watchfiles en Windows se cuelga al recargar módulos).

```
# Backend (puerto 8001 — el proxy del frontend apunta aquí)
cd C:/Users/tarra/licitum/backend
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8001

# Worker Celery
cd C:/Users/tarra/licitum/backend
./.venv/Scripts/python.exe -m celery -A app.core.celery_app worker -l info -P solo

# Redis (necesario para Celery)
"C:\Program Files\Redis\redis-server.exe"

# Frontend
cd C:/Users/tarra/licitum/frontend
npm run dev
# → localhost:3000 (proxy a localhost:8001)
```

Si el puerto 8001 está ocupado (TIME_WAIT de Windows): cambiar a 8002 en `next.config.mjs` y arrancar en ese puerto.

## Notas transversales
- Sin autenticación aún — `EMPRESA_DEMO_ID` (`00000000-0000-0000-0000-000000000001`) hardcodeado en frontend hasta que haya JWT/Supabase Auth
- Railway: API y worker son servicios separados. El worker no tiene healthcheck (es Celery). El API tiene healthcheck en `/health` configurado en el dashboard (no en `railway.toml`).
- Vercel: frontend en Next.js, deploy automático desde `main`
