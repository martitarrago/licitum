# Licitum — Project context

## Product
SaaS B2B para PYMES de construcción en España (Cataluña primero).
Automatiza licitación pública: detectar → analizar → estudiar → redactar → ganar.
Usuario: jefe de obra o administrativo, 40-55 años, PYME 5-50 empleados.

## Stack
Frontend: Next.js 14 App Router + TypeScript + Tailwind CSS + React Query
Backend:  FastAPI (Python 3.11+) + PostgreSQL + pgvector + Redis + Celery
Storage:  Cloudflare R2 (PDFs) + PostgreSQL (datos)
AI:       Claude API claude-sonnet-4-20250514 — structured outputs siempre
Deploy:   Railway

## Design system (DECISIONES CERRADAS — no cambiar sin confirmación)
Feeling:        Cálido y cercano     — como Notion, Basecamp
Color primario: #1F4E79
Color acento: #F59E0B
Dark mode:      sí
Tipografía:     [se definirá en fase de diseño]
Componente ref: /frontend/src/components/ui/LicitacionCard.tsx (cuando exista)

## Módulos (orden de construcción)
M3 Solvencia → M2 Radar IA → M7 Admin → M1 Dashboard →
M4 BC3 → M5 Memorias → M6 Competencia → M8 Histórico

## Reglas de código
- Async/await en todos los endpoints FastAPI
- Pydantic v2 para schemas y validación
- React Query para todo fetch — nunca useEffect para datos
- UUID como PKs, soft delete con deleted_at
- Migraciones solo con Alembic — nunca alterar BBDD manualmente
- Variables de entorno en .env — nunca hardcodear keys
- API Claude: temperatura 0 para extracción, 0.3 para generación de texto
- Operaciones pesadas (PDFs, embeddings) siempre en Celery worker, nunca en request

## Reglas de diseño
- Antes de crear componente nuevo: revisar /frontend/src/components/ui/
- No inventar estilos nuevos — extender los existentes
- No instalar librerías UI sin preguntar
- Iconos: lucide-react únicamente
- Semáforo de solvencia: verde #16A34A / amarillo #EA580C / rojo #DC2626

## Regla crítica — extracción de PDFs
NUNCA guardar datos extraídos de PDF sin confirmación explícita del usuario.
El sistema propone. El usuario confirma. Sin bypass posible.

## Sesión actual
Módulo en progreso: SETUP INICIAL
Última tarea completada: estructura de carpetas creada
Próxima tarea: inicializar Next.js + FastAPI
Bloqueos: ninguno