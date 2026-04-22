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
Deploy:   Railway

## Design system (DECISIONES CERRADAS — no cambiar sin confirmación)
Feeling:        Editorial y limpio   — B&N con acento naranja
Color primario: #18181B (negro zinc — botones, mark, activos)
Color acento:   #F59E0B (naranja — solo logo dot y franja activa sidebar, ≤1 aparición por pantalla)
Dark mode:      sí — fondo #0A0A0A (negro profundo, grises zinc puros)
Tipografía:     [se definirá en fase de diseño]
Componente ref: /frontend/src/components/ui/LicitacionCard.tsx (cuando exista)

## Módulos (orden de construcción)
M3 Solvencia → M2 Radar IA → M7 Admin → M1 Dashboard →
M4 BC3 → M5 Memorias → M6 Competencia → M8 Histórico

## Función de cada modulo (cada modulo es un apartado del sidebar)

M1 Dashboard: Es la pantalla de "buenos días". El usuario llega por la mañana y en 10 segundos sabe el estado de su empresa: cuánta solvencia le queda disponible para optar a más obras, qué licitaciones tiene en marcha con fecha límite próxima, nuevas licitaciones compatibles,cuánto dinero tiene inmovilizado en avales bancarios, y si su tasa de éxito está mejorando o empeorando.

M2 Radar IA -- Feed PLACSP: Este es el módulo que justifica la suscripción por sí solo. La PLACSP publica cientos de licitaciones cada semana. El problema no es que no estén disponibles, es que revisarlas todas manualmente para ver cuáles son relevantes para tu empresa es inviable. Un administrativo puede perderse 2 horas al día solo en eso.
El Radar filtra ese ruido automáticamente. Solo te muestra las licitaciones donde el semáforo está en verde o amarillo, es decir, aquellas para las que técnicamente puedes optar según tu clasificación oficial y tu solvencia económica acreditada. Las rojas directamente no aparecen porque no tiene sentido que el usuario invierta tiempo en estudiarlas.
La diferencia con un simple buscador por CPV es que el semáforo cruza tres variables a la vez: si tienes la clasificación correcta, si el importe de la obra cabe dentro de tu solvencia disponible, y si el tipo de obra se parece a lo que has hecho antes. Eso es lo que convierte un feed genérico en una bandeja de entrada de oportunidades reales.

M3 Gestor de solvencia:Este módulo es el cerebro de todo el sistema porque alimenta a casi todos los demás. Su función es construir y mantener el expediente técnico digital de la empresa: todas las obras terminadas con sus importes, fechas, organismos y tipos de trabajo certificados.
Tiene dos partes. La primera es el repositorio de certificados y actas de recepción de obra, que son los documentos que acreditan lo que has construido. La IA extrae los datos relevantes de esos PDFs y los indexa, de forma que el sistema siempre sabe exactamente a cuánto asciende tu solvencia económica para cada tipo de obra. Sin esto, cuando llega una licitación de 2 millones, el usuario tendría que calcular manualmente si sus últimas obras suman suficiente para poder optar.
La segunda parte es la gestión de la Clasificación ROLECE, que son los grupos y subgrupos oficiales que la Junta Consultiva de Contratación del Estado te reconoce. Esto determina legalmente a qué licitaciones puedes presentarte. El módulo controla las fechas de caducidad de cada clasificación y te avisa con tiempo para renovarlas, porque si caduca y no te das cuenta, puedes quedar excluido de una oferta en la que ya has invertido semanas de trabajo.

M4 Estudio económico - BC3: Este módulo resuelve uno de los trabajos más tediosos y críticos del proceso: convertir el presupuesto de la administración en algo con lo que puedas trabajar y comparar.
Cuando la administración publica una licitación, incluye un presupuesto de licitación con todas las partidas de obra: metros de hormigón, kilos de acero, horas de maquinaria, etc. Ese presupuesto viene en PDF. Para preparar tu oferta económica necesitas ese mismo desglose en un formato editable donde puedas introducir tus propios precios.
El extractor hace esa transformación automáticamente: sube el PDF, el sistema detecta las tablas, las normaliza y te entrega el presupuesto en BC3 (el formato estándar del sector de la construcción) y en Excel. A partir de ahí puedes trabajar directamente en tu software de presupuestos habitual.
El análisis de costes añade otra capa de valor: compara el precio unitario que pone la administración para cada partida con lo que tú has cobrado históricamente por esa misma partida en obras anteriores. Esto te identifica automáticamente las partidas donde vas a perder dinero si ofertas al precio de la administración, antes de que firmes nada. El análisis de Pareto te señala las 5 o 10 partidas que concentran el 80% del presupuesto, para que no pierdas tiempo refinando partidas que apenas mueven el total.

M5 Redactor de Memorias — Sobre B: Este módulo genera memorias (sobre A, sobre B, sobre C) de forma específica para cada obra usando los requisitos del pliego técnico como contexto. No es una plantilla genérica: si el pliego dice que la obra está en un entorno urbano con restricciones de horario nocturno, la metodología generada tiene en cuenta esa restricción. Si requiere trabajos en altura, el plan de seguridad enfatiza los protocolos correspondientes. Investigar sobre A, sobre B y C, si es necesario actualizar este punto tras investigación.

M6 Vigilante de competencia:Antes de decidir a cuánto ofertas económicamente, necesitas saber a cuánto va a ofertar la competencia. Eso no es adivinanza: hay patrones. Hay empresas que en el área metropolitana de Barcelona bajan siempre entre un 12% y un 15%. Hay organismos donde la competencia es más agresiva que en otros. Hay tipos de obra donde los márgenes del sector están muy ajustados.
El histórico de bajas construye esa base de datos de forma automática, consumiendo los datos públicos de adjudicaciones pasadas. Con el tiempo, cuando estás estudiando una licitación del Ayuntamiento de Sabadell para pavimentación urbana, puedes ver exactamente a cuánto han bajado los últimos 20 contratos similares en ese organismo.
El simulador de puntos resuelve la pregunta inversa: en lugar de "si bajo un 8%, ¿cuántos puntos económicos consigo?", te permite preguntar "¿cuánto tengo que bajar para conseguir 30 puntos económicos?". Y lo combina con tu puntuación técnica estimada para decirte si con esa oferta ganarías o no según el histórico de competidores. Esto convierte la decisión de la baja económica, que en muchas empresas se toma a intuición, en algo basado en datos.

M7  Control Administrativo: El Sobre A es el sobre administrativo: los documentos que acreditan que tu empresa existe, que estás al corriente de obligaciones fiscales y de Seguridad Social, y que cumples los requisitos de solvencia exigidos. El documento central es el DEUC, el Documento Europeo Único de Contratación.
El DEUC es un formulario XML estándar de la Unión Europea que en teoría simplifica la presentación de licitaciones. En la práctica, rellenarlo bien para cada licitación sigue siendo un proceso manual que requiere 30-60 minutos si no tienes los datos organizados. Este módulo lo automatiza: como ya tienes toda la información de la empresa en el Gestor de Solvencia, genera el DEUC correcto para cada licitación en segundos.
La Caja de Avales resuelve un problema financiero serio que muchas PYMES gestionan mal: el control de las garantías bancarias. Cuando te adjudican una obra, tienes que depositar un aval bancario equivalente al 5% del contrato. Ese dinero queda inmovilizado hasta que termina la obra y el organismo lo libera. El problema es que muchas empresas no reclaman la devolución a tiempo porque nadie controla las fechas. Este módulo calcula cuándo corresponde pedir cada devolución y te avisa automáticamente, liberando liquidez que estaba olvidada en el banco.

M8 Històrico de resultados: Este módulo cierra el ciclo de aprendizaje. Cada licitación en la que participas termina con un acta de resolución donde la mesa de contratación publica las puntuaciones de todos los licitadores: cuántos puntos técnicos y económicos obtuvo cada empresa y por qué ganó el que ganó.
El módulo extrae esa información automáticamente y la cruza con tu oferta. El resultado es un diagnóstico claro: perdiste porque fuiste caro (poca puntuación económica), porque tu memoria técnica puntuó menos que la de la empresa ganadora, o porque los criterios subjetivos de valoración jugaron en tu contra. Con el tiempo eso construye una curva de aprendizaje real: puedes ver si tu puntuación técnica media está mejorando, en qué tipos de obra eres más competitivo, y qué organismos valoran más la calidad técnica frente al precio.
Además, cada acta procesada alimenta directamente el Vigilante de Competencia del módulo 6 con datos de bajas reales, cerrando así el círculo de información entre todos los módulos.

## Estructura técnica


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

## Estado del proyecto — M3 Gestor de Solvencia

### Backend — COMPLETO Y EN PRODUCCIÓN (Railway)

**Modelos y BBDD**
- SQLAlchemy: `empresas`, `certificados_obra`, `clasificaciones_rolece`
- Migraciones Alembic: `0001_initial_m3`, `0002_add_procesando_estado`
- Empresa demo sembrada: `id=00000000-0000-0000-0000-000000000001`

**Endpoints**
- 8 bajo `/api/v1/solvencia/certificados`: POST, GET, GET/{id}, PATCH, DELETE, /validar, /rechazar, /reextraer
- 4 bajo `/api/v1/solvencia/clasificaciones`: POST, GET, PATCH/{id}, DELETE/{id}

**Worker Celery — `workers/extraccion_pdf.py`**
- Flujo: descarga PDF de R2 → pdfplumber nativo → OCR fallback (Tesseract+poppler) → Claude `tool_use`
- Modelo: `claude-sonnet-4-6`, temperatura 0, prompt cacheado (`cache_control: ephemeral`)
- Clasifica el documento ANTES de extraer (8 tipos: `cert_buena_ejecucion`, `acta_recepcion`, `cert_rolece` válidos; 5 inválidos)
- Valida output con `ClaudeOutput(BaseModel)` — campos extra ignorados con `extra='ignore'`
- Confianza extraída como campo explícito (0.0–1.0); tipo e invalidez guardados en el modelo

**Fixes críticos en el worker (imprescindible no revertir):**
1. `NullPool` en el engine SQLAlchemy: cada tarea Celery crea su propio event loop con `asyncio.run()`. El pool global queda atado al loop anterior (cerrado) y hace hang. `NullPool` crea conexiones frescas por tarea.
2. `_descargar_pdf` usa `httpx.Client` **síncrono**: `AsyncClient` deja cleanup tasks de `anyio` que fallan con "Event loop is closed" al cerrar el loop. La descarga es I/O único, no necesita async.
3. `--pool=solo` en Celery: evita fork/spawn de subprocesos en Windows; necesario para que `asyncio.run()` funcione dentro de tareas.

**Fixes críticos previos (imprescindible no revertir):**
- `EstadoCertificadoType` (TypeDecorator con `impl=PGEnum`) en `certificado_obra.py`: asyncpg no castea VARCHAR→enum implícitamente. El TypeDecorator fuerza el tipo correcto.

**Config (`app/config.py`) — fallback Redis:**
```python
@property
def broker_url(self) -> str:
    return self.celery_broker_url or self.redis_url or "redis://localhost:6379/0"
```
Railway inyecta `REDIS_URL`; el código acepta también `CELERY_BROKER_URL` por compatibilidad.

**Deploy Railway**
- Servicio API: `start.sh` con `SERVICE_TYPE` no definido → alembic upgrade + uvicorn
- Servicio Worker: añadir variable `SERVICE_TYPE=worker` → celery `--pool=solo`
- Variables de entorno necesarias en el worker: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT_URL`
- Si el worker corre uvicorn en vez de celery: verificar que `SERVICE_TYPE=worker` esté en las variables del servicio worker (no del API)

### Frontend M3 — COMPLETO

**Páginas**
- `/solvencia/certificados` — lista con filtros, polling cada 3s, UploadModal con progress bar XHR, sort dropdown con toggle asc/desc
- `/solvencia/certificados/[id]/revisar` — two-column: PdfViewer (izquierda) + ReviewForm + ConfirmModal (derecha)
- `/solvencia/clasificaciones` — tabla con edición inline (EditRow como fila colapsada colSpan=7 con grid 2 filas)

**Componentes UI clave**
- `src/components/ui/CustomSelect.tsx` — dropdown portal-based con `getBoundingClientRect()`, sin scroll, `width: rect.width`, detecta espacio arriba/abajo. Reemplaza `<select>` nativo en toda la app.
- `src/components/ui/DatePicker.tsx` — calendario mensual portal-based, lunes primero, locale `es-ES`, icono `CalendarDays`, formato ISO `yyyy-mm-dd`.
- `src/components/solvencia/ClasificacionesTabla.tsx` — EditRow usa `CustomSelect` para Grupo/Subgrupo/Categoría y `DatePicker` para fechas. Layout en grid colSpan=7 (no celdas separadas) para evitar scroll horizontal.
- `src/components/solvencia/CertificadoRevision.tsx` — ReviewForm usa `DatePicker` para `fecha_inicio` y `fecha_fin`.

**Infraestructura frontend**
- `src/lib/jccpe.ts` — 11 grupos, 68 subgrupos, 6 categorías ROLECE con rangos de anualidad
- `src/lib/api/certificados.ts` + `clasificaciones.ts`
- Proxy Next.js → backend en `next.config.mjs`
- Sidebar con todos los módulos M1–M8 en `src/components/layout/`
- SolvenciaResumen: 2 KPI tiles (anualidad media + obras) + desglose ROLECE
- PdfViewer con `react-pdf` (client-side); worker en `/public/pdf.worker.min.mjs`
- Endpoint backend `/pdf` usa `StreamingResponse` (no `RedirectResponse`) → same-origin, sin problemas de cross-origin iframe
- Detección de duplicados: banner + modal de confirmación; helpers `esDuplicadoPar`, `calcularEliminables`
- Iconos-only para estados con leyenda + accordion "¿Qué son los certificados?"

### Cómo arrancar el stack local
IMPORTANTE: usar el venv, NO py -3.11 directamente (no tiene uvicorn).
NO usar --reload en uvicorn (watchfiles en Windows se cuelga al recargar módulos).

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

Si el puerto 8001 está ocupado (TIME_WAIT de Windows): cambiar a 8002 en next.config.mjs y arrancar en ese puerto.

### Próxima sesión — por hacer

#### 1. Visor PDF — mejorar vista
- Toolbar con controles de zoom (+/- y fit-to-width)
- Thumbnail sidebar opcional para documentos largos
- `renderTextLayer` para permitir selección/copiar texto
- Archivo: `frontend/src/components/solvencia/CertificadoRevision.tsx` (PdfViewer)

#### 2. Animación de carga durante extracción
- Animar el skeleton del formulario cuando estado=procesando (efecto "typing" o reveal progresivo)
- Archivo: `ExtractionPending` en `CertificadoRevision.tsx` (existe pero es estático)

#### 3. Orden por estado — nueva prioridad
- Cambiar a: **validado → pendiente_revision → rechazado/error** (error primero dentro de pendiente si `extraction_error !== null`)
- Archivo: `frontend/src/app/solvencia/certificados/page.tsx` (constante `ESTADO_ORDEN`)

#### 4. Selección múltiple + eliminación masiva
- Checkbox en cada `CertificadoCard`; barra flotante "N seleccionados · Eliminar"
- Modal de confirmación con lista de títulos
- Backend: `DELETE /certificados/batch` con `{ ids: UUID[] }`
- Archivos: `page.tsx` + `CertificadoCard.tsx` (props `selected`, `onToggleSelect`) + `certificados.py`

#### 5. Eliminar duplicados — mostrar cuáles ANTES de confirmar
- Expandir el banner para listar exactamente qué se elimina (título, fecha, importe) y cuál se mantiene
- Archivo: `page.tsx` — helpers existentes: `esDuplicadoPar`, `calcularEliminables`

#### 6. Importación masiva de certificados
- Viabilidad: MEDIA-ALTA. Sin bloqueos técnicos graves.
- Flujo propuesto: ZIP con múltiples PDFs → endpoint `POST /certificados/batch-upload` → crea un certificado por PDF → encola un task Celery por cada uno → el polling existente los recoge
- La parte más costosa es el UX de revisión: con 20 PDFs simultáneos el usuario necesita una vista de "bandeja de revisión masiva" diferente al revisor individual actual.
- Primero completar puntos 4 y 5 antes de abordar esto.

#### 7. Pendientes arrastrados
- CRUD de empresas: endpoints GET/POST/PATCH (sin frontend aún)
- `extracted_data`: validar schema con Pydantic antes de guardar (actualmente JSONB libre)
- CORS: añadir dominio de Vercel a `allow_origins` en `main.py` cuando haya deploy frontend
- Autenticación: JWT o Supabase Auth (actualmente `EMPRESA_DEMO_ID` hardcodeado)

### Notas técnicas importantes
- Sin autenticación — pendiente para fase posterior (JWT o Supabase Auth)
- `EMPRESA_DEMO_ID` (`00000000-0000-0000-0000-000000000001`) hardcodeado en frontend hasta que haya auth real
- Tesseract OCR: `C:\Program Files\Tesseract-OCR\tesseract.exe` (ruta hardcodeada en worker, solo Windows local; en Railway/Docker se instala con apt-get en `Dockerfile.worker`)
- Poppler debe estar en PATH para `pdf2image` (OCR fallback); en Railway viene con `poppler-utils` del Dockerfile
- El worker en Railway procesa PDFs correctamente: ~12s por certificado, confianza típica 0.85–0.92
