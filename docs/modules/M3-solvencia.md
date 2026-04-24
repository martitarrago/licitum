# M3 — Gestor de Solvencia

## Propósito
Cerebro del sistema. Alimenta a casi todos los demás módulos. Construye y mantiene el **expediente técnico digital** de la empresa: todas las obras terminadas con sus importes, fechas, organismos y tipos certificados.

Dos partes:

1. **Repositorio de certificados y actas de recepción** — documentos que acreditan lo que has construido. La IA extrae los datos y los indexa, de forma que el sistema siempre sabe a cuánto asciende la solvencia económica por tipo de obra. Sin esto, cuando llega una licitación de 2M€, el usuario tendría que calcular manualmente si sus últimas obras suman suficiente.

2. **Clasificación ROLECE** — grupos y subgrupos oficiales que la JCCPE reconoce. Determina legalmente a qué licitaciones puede presentarse. El módulo controla las fechas de caducidad y avisa con tiempo para renovarlas.

## Estado — EN PRODUCCIÓN ✅
- Backend ✅ — Railway (API + worker Celery)
- Frontend ✅ — Vercel
- Funcional end-to-end

---

## Backend

### Modelos y BBDD
- SQLAlchemy: `empresas`, `certificados_obra`, `clasificaciones_rolece`
- Migraciones Alembic: `0001` a `0006` (la última hace `pdf_url` nullable para entrada manual)
- Empresa demo sembrada: `id=00000000-0000-0000-0000-000000000001`

### Endpoints

**`/api/v1/solvencia/certificados`:**
- `POST` — sube PDF + encola extracción
- `POST /manual` — crea certificado con datos introducidos manualmente (sin PDF, sin worker)
- `GET`, `GET/{id}`, `PATCH`, `DELETE`, `DELETE /batch`
- `/{id}/validar`, `/{id}/rechazar`, `/{id}/reextraer`, `/{id}/revertir`
- `/{id}/pdf` — proxy del PDF desde R2 (same-origin para iframe)
- `/resumen-solvencia` — agregado de solvencia por grupo ROLECE

**`/api/v1/solvencia/clasificaciones`:**
- `POST`, `GET`, `PATCH/{id}`, `DELETE/{id}`

### Worker Celery — `workers/extraccion_pdf.py`
Flujo: descarga PDF de R2 → `pdfplumber` nativo → OCR fallback (Tesseract + poppler) → Claude `tool_use`.

- Modelo: `claude-sonnet-4-6`, temperatura 0, prompt cacheado (`cache_control: ephemeral`)
- Clasifica el documento ANTES de extraer (8 tipos: `cert_buena_ejecucion`, `acta_recepcion`, `cert_rolece` válidos; 5 inválidos)
- Valida output con `ClaudeOutput(BaseModel)` — campos extra ignorados con `extra='ignore'`
- Confianza como campo explícito (0.0–1.0); tipo e invalidez guardados en el modelo

### Fixes críticos del worker (imprescindible no revertir)

1. **`NullPool` en el engine SQLAlchemy**: cada tarea Celery crea su propio event loop con `asyncio.run()`. El pool global queda atado al loop anterior (cerrado) y hace hang. `NullPool` crea conexiones frescas por tarea.

2. **`_descargar_pdf` con `httpx.Client` síncrono**: `AsyncClient` deja cleanup tasks de `anyio` que fallan con "Event loop is closed" al cerrar el loop. La descarga es I/O único, no necesita async.

3. **`AsyncAnthropic` como context manager**: `async with AsyncAnthropic(...) as client:` cierra el `httpx.AsyncClient` interno antes de que termine `asyncio.run()`. Sin esto se ve el error "Event loop is closed" en los logs del worker (cleanup del GC tras cerrar el loop).

4. **`--pool=solo` en Celery**: evita fork/spawn de subprocesos en Windows; necesario para que `asyncio.run()` funcione dentro de tareas.

5. **`EstadoCertificadoType` (TypeDecorator con `impl=PGEnum`)** en `certificado_obra.py`: asyncpg no castea VARCHAR→enum implícitamente.

### Config — fallback Redis
```python
@property
def broker_url(self) -> str:
    return self.celery_broker_url or self.redis_url or "redis://localhost:6379/0"
```
Railway inyecta `REDIS_URL`; el código acepta también `CELERY_BROKER_URL` por compatibilidad.

### Deploy Railway
- **Servicio API**: `Dockerfile` + `start.sh`. Sin `SERVICE_TYPE` → alembic upgrade + uvicorn. Healthcheck `/health` configurado en el dashboard.
- **Servicio Worker**: `Dockerfile.worker` (o `Dockerfile` + `SERVICE_TYPE=worker`) → celery `--pool=solo`. Sin healthcheck (no es HTTP).
- Variables de entorno necesarias en el worker: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT_URL`
- Ambos Dockerfiles instalan `tesseract-ocr`, `tesseract-ocr-spa` y `poppler-utils`

---

## Frontend

### Páginas
- `/solvencia/certificados` — lista con filtros, polling cada 3s, modal con dos pestañas (Subir PDF / Entrada manual), ordenación por cabeceras de columna clicables
- `/solvencia/certificados/[id]/revisar` — two-column: PdfViewer (izquierda, oculto si es entrada manual) + ReviewForm + ConfirmModal (derecha)
- `/solvencia/clasificaciones` — tabla con edición inline (EditRow como fila colapsada colSpan=7 con grid 2 filas)

### Componentes UI clave
- `src/components/ui/CustomSelect.tsx` — dropdown portal-based con `getBoundingClientRect()`, sin scroll, `width: rect.width`, detecta espacio arriba/abajo. Reemplaza `<select>` nativo en toda la app.
- `src/components/ui/DatePicker.tsx` — calendario mensual portal-based, lunes primero, locale `es-ES`, icono `CalendarDays`, formato ISO `yyyy-mm-dd`.
- `src/components/solvencia/ClasificacionesTabla.tsx` — EditRow usa `CustomSelect` para Grupo/Subgrupo/Categoría y `DatePicker` para fechas.
- `src/components/solvencia/CertificadoRevision.tsx` — ReviewForm usa `DatePicker` para `fecha_inicio` y `fecha_fin`.
- `src/components/solvencia/UploadModal.tsx` — dos pestañas (PDF / Manual)

### Comportamiento clave
- **Rechazar certificado**: hace soft delete (no lo guarda como `rechazado`). El botón está en la página de revisión.
- **Entrada manual**: crea certificado en `pendiente_revision` con `pdf_url=null`; la IA no entra. El PdfViewer se oculta cuando `pdf_url` es null.
- **Ordenación**: las cabeceras de columna (Certificado, Período, Importe, Grupo, Estado) son clicables con flecha. Primera pulsación activa columna (desc); segunda invierte dirección. No hay dropdown de ordenar.
- **IVA**: el sistema trabaja siempre con importe sin IVA (base imponible). El prompt de Claude prefiere "sin IVA" y divide entre 1,21 si solo aparece con IVA. El formulario manual lo indica explícitamente ("€ sin IVA").

### Infraestructura frontend
- `src/lib/jccpe.ts` — 11 grupos, 68 subgrupos, 6 categorías ROLECE con rangos de anualidad
- `src/lib/api/certificados.ts` + `clasificaciones.ts`
- Proxy Next.js → backend en `next.config.mjs`
- Sidebar con todos los módulos M1–M8
- SolvenciaResumen: 2 KPI tiles (anualidad media + obras) + desglose ROLECE
- PdfViewer con `react-pdf` (client-side); worker en `/public/pdf.worker.min.mjs`
- Detección de duplicados: banner + modal de confirmación; helpers `esDuplicadoPar`, `calcularEliminables`

---

## Pendientes / ideas

### Visor PDF — mejorar vista
- Toolbar con controles de zoom (+/- y fit-to-width)
- Thumbnail sidebar opcional para documentos largos
- `renderTextLayer` para permitir selección/copiar texto

### Animación de carga durante extracción
- Animar el skeleton del formulario cuando `estado=procesando` (efecto "typing" o reveal progresivo)
- Archivo: `ExtractionPending` en `CertificadoRevision.tsx`

### Importación masiva de certificados
- ZIP con múltiples PDFs → endpoint `POST /certificados/batch-upload` → crea un certificado por PDF → encola un task Celery por cada uno
- Costoso en UX: con 20 PDFs simultáneos el usuario necesita una bandeja de revisión masiva distinta al revisor individual

### Varios
- CRUD de empresas: endpoints GET/POST/PATCH (sin frontend aún)
- `extracted_data`: validar schema con Pydantic antes de guardar (actualmente JSONB libre)
- CORS: añadir dominio de Vercel a `allow_origins` en `main.py`
