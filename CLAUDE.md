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
Feeling:        Editorial premium    — B&N con acento naranja, restraint icónica
Color primario: #18181B (negro zinc — botones, mark, activos)
Color acento:   #E85820 (naranja del wordmark — sólo logo y franja activa sidebar, ≤1 aparición por pantalla)
Dark mode:      sí — fondo #0A0A0A (negro profundo, grises zinc puros)
Tipografía:
  - Display: Bricolage Grotesque (extiende energía del wordmark — geométrica, lowercase-friendly, peso 500-800). `font-display`
  - Body:    Inter (variable, todo el rango). `font-sans`
  - Acento editorial: Fraunces 500/600. `font-serif` (uso secundario en blockquotes y emphasis)
  - Mono:    ui-monospace stack para datos tabulares y códigos. `font-mono`
Utility classes (definidas en globals.css):
  - `.card` / `.card-interactive` — rounded-2xl + sombra layered (no ring plano)
  - `.btn-primary` / `.btn-secondary` — estilos de botón consistentes
  - `.eyebrow` — overline uppercase tracking 0.08em
  - `.display-h` — hero heading lowercase + extra-bold + tracking -0.025em
  - `.display-num` — KPIs grandes con Bricolage bold tabular
  - `.skeleton` — shimmer loader (no pulse simple)
  - `.stagger > *` — fade-up escalonado 50ms entre hijos
Sombras editoriales: `shadow-card`, `shadow-card-hover`, `shadow-elev-1/2/3`, `shadow-inset-soft`
Iconos: `lucide-react` SÓLO donde son funcionales (buttons de acción, sidebar nav, loading spinners). Iconos decorativos en KPI cards, section headers, body text → fuera. Status comunicado via color + dot pequeño + texto.
Componente ref: `/frontend/src/components/ui/LicitacionCard.tsx`, `/frontend/src/app/dashboard/page.tsx` (showcase del sistema completo)

## Módulos (MVP — foco Catalunya)

El MVP de Licitum cubre el ciclo completo de una licitación pública de obra para PYMES catalanas: detectar → decidir → presentar Sobre A + Sobre C → seguir hasta formalización. Diferenciador estratégico: catalán nativo + RELIC integrado + procedimientos catalanes específicos. Sobre B (memoria técnica), BC3, competencia, avales e histórico se quedan fuera del MVP — ver `docs/modules/v2/`.

Documentación por módulo en `docs/modules/`:
- [M1 Radar](docs/modules/M1-radar.md) ✅ base — feed PSCP Catalunya con semáforo y afinidad. Pendiente: 4º eje del semáforo + importación PSCP one-click + acciones guardar/analizar/descartar
- [M2 Empresa](docs/modules/M2-empresa.md) 🟡 — caja fuerte de documentos vivos: certificados ✅ + ROLECE ✅ + RELIC + Hacienda/SS + pólizas, con caducidad y semáforo de salud documental
- [M3 Pliegos](docs/modules/M3-pliegos.md) 🔲 — analizador IA de PCAP+PPT con recomendación ir/no ir + soporte catalán nativo
- [M4 Sobre A](docs/modules/M4-sobre-a.md) 🔲 — generación DEUC + declaración responsable, con DEUC ultra-simplificado para empresas en RELIC
- [M5 Calculadora](docs/modules/M5-calculadora.md) 🔲 — oferta económica con baja temeraria y puntuación en tiempo real (cierra Sobre C)
- [M6 Tracker](docs/modules/M6-tracker.md) 🔲 — pipeline kanban con todos los estados del ciclo + relojes legales (subsanación 3d, documentación previa 10d). Es el home del producto.

Orden de construcción propuesto:
1. **Validación pre-código** (1-2 semanas): 3-5 pilotos catalanes + 5-10 PCAPs reales + acceso programático RELIC
2. **Cimientos** (2-3 semanas): auth real (sustituir `EMPRESA_DEMO_ID`), M2 ampliado (RELIC + datos básicos + caducidades), M1 refinado (4º eje + acciones)
3. **Decisión** (3-4 semanas): M3 completo (extracción + recomendación + UI dashboard), importación PSCP one-click, soporte IA catalán
4. **Generación** (2-3 semanas): M4 Sobre A (DEUC + decl. responsable) + M5 Calculadora
5. **Cierre del ciclo** (2 semanas): M6 Tracker con relojes legales + agente de avisos diario
6. **Pulido** (1-2 semanas): UI editorial coherente + onboarding M2 + catalán completo en UI

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
