# M2 — Empresa (caja fuerte de documentos vivos)

## Propósito
La caja fuerte donde están **todos** los documentos que cualquier licitación pública puede pedir, con fecha de caducidad, avisos y un semáforo de salud documental. No es solo "datos de solvencia" — es la fuente única de verdad que alimenta:

- El **semáforo multi-eje del M1** (clasificación, volumen de negocio, certificados)
- La **recomendación ir/no ir del M3** (cruce con la solvencia exigida del PCAP)
- El **DEUC ultra-simplificado del M4** (con RELIC) y la declaración responsable
- Los **avisos del M6** cuando un documento está a punto de caducar y el cliente acaba de ganar provisionalmente

**Por qué importa más de lo que parece.** Cuando el cliente gana una adjudicación provisional, tiene **10 días hábiles** para presentar Hacienda + SS al corriente + pólizas + garantía definitiva. Si no llega, pierde la obra y le penalizan con el 3% del presupuesto base (LCSP). M2 al día = obra ganada se queda ganada.

Dos partes implementadas hoy:

1. **Repositorio de certificados de obra** ✅ — documentos que acreditan lo que has construido. La IA extrae los datos y los indexa.
2. **Clasificaciones ROLECE** ✅ — grupos y subgrupos oficiales con caducidad y avisos.

Ampliación MVP planificada (ver sección abajo): RELIC, datos básicos de empresa, certificados Hacienda/SS, pólizas, ISOs, semáforo de salud documental.

## Estado — base EN PRODUCCIÓN ✅
- Backend ✅ — Railway (API + worker Celery)
- Frontend ✅ — Vercel (rutas `/empresa/*`)
- Funcional end-to-end para certificados + clasificaciones

---

## Backend (implementado)

### Modelos y BBDD
- SQLAlchemy: `empresas`, `certificados_obra`, `clasificaciones_rolece`
- Migraciones Alembic: `0001` a `0006` (la última hace `pdf_url` nullable para entrada manual)
- Empresa demo sembrada: `id=00000000-0000-0000-0000-000000000001`

### Endpoints

**`/api/v1/empresa/certificados`:**
- `POST` — sube PDF + encola extracción
- `POST /manual` — crea certificado con datos manuales (sin PDF, sin worker)
- `GET`, `GET/{id}`, `PATCH`, `DELETE`, `DELETE /batch`
- `/{id}/validar`, `/{id}/rechazar`, `/{id}/reextraer`, `/{id}/revertir`
- `/{id}/pdf` — proxy del PDF desde R2 (same-origin para iframe)
- `/resumen-solvencia` — agregado de solvencia por grupo ROLECE

**`/api/v1/empresa/clasificaciones`:**
- `POST`, `GET`, `PATCH/{id}`, `DELETE/{id}`

### Worker Celery — `workers/extraccion_pdf.py`
Flujo: descarga PDF de R2 → `pdfplumber` nativo → OCR fallback (Tesseract + poppler) → Claude `tool_use`.

- Modelo: `claude-sonnet-4-6`, temperatura 0, prompt cacheado (`cache_control: ephemeral`)
- Clasifica el documento ANTES de extraer (8 tipos: `cert_buena_ejecucion`, `acta_recepcion`, `cert_rolece` válidos; 5 inválidos)
- Valida output con `ClaudeOutput(BaseModel)` — campos extra ignorados con `extra='ignore'`
- Confianza como campo explícito (0.0–1.0); tipo e invalidez guardados en el modelo

### Fixes críticos del worker (NO REVERTIR)

1. **`NullPool` en el engine SQLAlchemy**: cada tarea Celery crea su propio event loop con `asyncio.run()`. Sin NullPool, el pool global queda atado al loop anterior (cerrado) y hace hang.
2. **`_descargar_pdf` con `httpx.Client` síncrono**: `AsyncClient` deja cleanup tasks de `anyio` que fallan con "Event loop is closed" al cerrar el loop. La descarga es I/O único, no necesita async.
3. **`AsyncAnthropic` como context manager**: `async with AsyncAnthropic(...) as client:` cierra el `httpx.AsyncClient` interno antes de que termine `asyncio.run()`. Sin esto se ve "Event loop is closed" en los logs del worker (cleanup del GC tras cerrar el loop).
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
- **API**: `Dockerfile` + `start.sh`. Sin `SERVICE_TYPE` → alembic upgrade + uvicorn. Healthcheck `/health` configurado en el dashboard.
- **Worker**: `Dockerfile.worker` (o `Dockerfile` + `SERVICE_TYPE=worker`) → celery `--pool=solo`. Sin healthcheck (no es HTTP).
- Variables de entorno necesarias en el worker: `ANTHROPIC_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT_URL`
- Ambos Dockerfiles instalan `tesseract-ocr`, `tesseract-ocr-spa` y `poppler-utils`

---

## Frontend (implementado)

### Páginas
- `/empresa/certificados` — lista con filtros, polling cada 3s, modal con dos pestañas (Subir PDF / Entrada manual), ordenación por cabeceras de columna clicables
- `/empresa/certificados/[id]/revisar` — two-column: PdfViewer (izquierda, oculto si es entrada manual) + ReviewForm + ConfirmModal (derecha)
- `/empresa/clasificaciones` — tabla con edición inline (EditRow como fila colapsada `colSpan=7` con grid 2 filas)

### Componentes UI clave
- `src/components/ui/CustomSelect.tsx` — dropdown portal-based con `getBoundingClientRect()`, sin scroll, `width: rect.width`, detecta espacio arriba/abajo. Reemplaza `<select>` nativo en toda la app.
- `src/components/ui/DatePicker.tsx` — calendario mensual portal-based, lunes primero, locale `es-ES`, icono `CalendarDays`, formato ISO `yyyy-mm-dd`.
- `src/components/empresa/ClasificacionesTabla.tsx` — EditRow usa `CustomSelect` para Grupo/Subgrupo/Categoría y `DatePicker` para fechas.
- `src/components/empresa/CertificadoRevision.tsx` — ReviewForm usa `DatePicker` para `fecha_inicio` y `fecha_fin`.
- `src/components/empresa/UploadModal.tsx` — dos pestañas (PDF / Manual)

### Comportamiento clave
- **Rechazar certificado**: hace soft delete (no lo guarda como `rechazado`). El botón está en la página de revisión.
- **Entrada manual**: crea certificado en `pendiente_revision` con `pdf_url=null`; la IA no entra. El PdfViewer se oculta cuando `pdf_url` es null.
- **Ordenación**: las cabeceras de columna (Certificado, Período, Importe, Grupo, Estado) son clicables con flecha. Primera pulsación activa columna (desc); segunda invierte dirección. No hay dropdown de ordenar.
- **IVA**: el sistema trabaja siempre con importe sin IVA (base imponible). El prompt de Claude prefiere "sin IVA" y divide entre 1,21 si solo aparece con IVA. El formulario manual lo indica explícitamente ("€ sin IVA").

### Infraestructura frontend
- `src/lib/jccpe.ts` — 11 grupos, 68 subgrupos, 6 categorías ROLECE con rangos de anualidad
- `src/lib/api/certificados.ts` + `clasificaciones.ts`
- Proxy Next.js → backend en `next.config.mjs`
- SolvenciaResumen: 2 KPI tiles (anualidad media + obras) + desglose ROLECE
- PdfViewer con `react-pdf` (client-side); worker en `/public/pdf.worker.min.mjs`
- Detección de duplicados: banner + modal de confirmación; helpers `esDuplicadoPar`, `calcularEliminables`

---

## Ampliación MVP planificada

Lo que falta para que M2 sea la **caja fuerte completa** que alimenta el resto del MVP. Ordenado por prioridad estratégica.

### 1. RELIC — Registre Electrònic d'Empreses Licitadores i Classificades de Catalunya ✅

Diferenciador estratégico del producto. La inscripción RELIC contiene personalidad jurídica, capacidad de obrar, representación y solvencia económica/financiera y técnica/profesional. Para empresas inscritas, el M4 Sobre A se reduce a "consta en RELIC nº X" + firma. Esa simplificación no la replica un competidor nacional sin equipo regional dedicado.

**Acceso programático validado ✅** (2026-04-27)

- **Dataset Socrata:** `t3wj-j4pu` en `analisi.transparenciacatalunya.cat` — sin autenticación, actualización diaria
- **26.272 empresas registradas, 9.560 clasificadas**
- **Endpoint:** `GET https://analisi.transparenciacatalunya.cat/resource/t3wj-j4pu.json?n_registral={N}`
- Devuelve **una fila por clasificación**: una empresa con N clasificaciones devuelve N filas con el mismo `n_registral`
- Schema relevante (todos `text` salvo donde se indica):
  - `n_registral` — ID RELIC (formatos: "NB1325817" antiguo, "2026007542" numérico nuevo)
  - `nom_empresa`
  - `data_actualitzacio` (calendar_date)
  - `prohibicio` (bool) + campos `ambit_pr`, `data_res_pr`, `data_inici_pr`, `data_fi_pr`, `causa_legal_pr`
  - `classificacio` (bool) + `suspensio_cl` (bool)
  - `tipus_cl` — "OBRES" o "SERVEIS"
  - `sigles_cl` — clave de oro: `"C4"`, `"B1"`, `"I9"`, etc. (letra grupo + dígito subgrupo). A nivel grupo es solo letra (`"C"`).
  - `grup_cl` — nombre legible del grupo cuando la clasificación es a nivel grupo
  - `subgrup_cl` — nombre legible del subgrupo
  - `categoria_cl` — texto: `"Categoria 6, si la seva quantia és superior a cinc milions d'euros."` (parsear el dígito)
  - `data_atorgament_cl` (calendar_date)

**Gap crítico — el dataset NO incluye CIF/NIF.** Solo `n_registral`. Implicación UX:

- En onboarding pedir al cliente **CIF + Nº registral RELIC**. Ambos están en su tarjeta de inscripción.
- Si la empresa no está en RELIC, saltar el paso; M4 generará DEUC completo en lugar del simplificado.
- (Opcional v2) buscador por nombre con confirmación manual para empresas que no recuerdan su `n_registral`.

**Modelo (planificado):**
```
empresas_relic:
  empresa_id            uuid FK
  n_registral           varchar          — clave de sincronización con Socrata
  nom_empresa           varchar          — copia para mostrar / verificar match
  prohibicio            bool
  prohibicio_data       jsonb            — ambit_pr, data_res_pr, data_inici_pr, data_fi_pr, causa_legal_pr cuando aplique
  data_actualitzacio    date             — última fecha de cambio según RELIC
  ultima_sincronizacion timestamptz      — cuándo lo trajimos nosotros
  + UniqueConstraint(empresa_id)

clasificaciones_relic:
  id                    uuid
  empresa_relic_id      uuid FK
  tipus_cl              enum (OBRES / SERVEIS)
  sigles_cl             varchar          — "C4" o "C"
  grupo                 varchar(1)       — extraído de sigles_cl
  subgrupo              varchar(2)       — extraído de sigles_cl, null si nivel-grupo
  categoria             smallint         — parseado de categoria_cl (1..6)
  subgrup_cl_text       varchar          — descripción legible para mostrar
  categoria_cl_text     varchar          — descripción legible para mostrar
  suspensio             bool
  data_atorgament       date
```

**Worker de sincronización:** Celery beat diario al amanecer. Para cada empresa con `n_registral`, query a Socrata, parsea sigles + categoria, hace upsert. Si `data_actualitzacio` no cambió desde la última sync, skip (idempotencia barata).

**UI:** panel "RELIC" en `/empresa` con:
- Estado: inscrita / no inscrita / suspendida / con prohibición
- `n_registral` editable
- Botón "Sincronizar ahora" (manual sobre el daily auto)
- Lista de clasificaciones RELIC junto a las clasificaciones manuales (M2 actual)
- Banner si hay prohibición activa (rojo)

**Relación con clasificaciones manuales existentes:** las clasificaciones que ya tenemos (`clasificaciones_rolece`) son introducidas a mano por el cliente. Las RELIC son tiradas del registro oficial. Para el cálculo del semáforo del M1, **prioridad RELIC > manual** cuando existan ambas (RELIC es la fuente oficial). Se evalúa fusionar tablas v2 si los datos quedan duplicados sistemáticamente.

### 2. Datos básicos de empresa (consolidación) ✅

Hoy el modelo `Empresa` es minimal (nombre, CIF, email). Extender con todo lo que el DEUC y el M4 necesitan, **una sola vez**:

```
direccion_calle           varchar(255)
direccion_codigo_postal   varchar(16)
direccion_ciudad          varchar(128)
direccion_provincia       varchar(64)
direccion_pais            varchar(64) DEFAULT 'ES'
representante_nombre      varchar(255)
representante_nif         varchar(16)         — validar algoritmo español
representante_cargo       varchar(128)
telefono                  varchar(32)
iae                       varchar(16)
cnae                      varchar(16) opcional
tamano_pyme               enum (micro / pequena / mediana / grande)
volumen_negocio_n         numeric(14,2)       — último ejercicio
volumen_negocio_n1        numeric(14,2)
volumen_negocio_n2        numeric(14,2)
plantilla_media           int opcional
```

UI: formulario en `/empresa/perfil` con secciones (Identificación / Dirección / Representante / Contacto / Volumen / Plantilla).

### 3. Documentos administrativos con caducidad ✅

**Tabla nueva** `documentos_empresa`:
```
id                   uuid
empresa_id           uuid FK
tipo                 enum (hacienda_corriente, ss_corriente, poliza_rc,
                           poliza_todo_riesgo, iso_9001, iso_14001, iso_45001,
                           rea_construccion, plantilla_tc2, otros)
titulo               varchar(255)
pdf_url              varchar(1024) opcional
fecha_emision        date
fecha_caducidad      date opcional       — null = sin caducidad explícita
estado               enum (vigente / a_caducar / caducado)
notas                text opcional
+ TimestampMixin + SoftDeleteMixin
UniqueConstraint(empresa_id, tipo, fecha_emision)
```

**Computed `estado`:**
- `vigente` si `fecha_caducidad >= today + 30 días` o `fecha_caducidad is null`
- `a_caducar` si `today <= fecha_caducidad < today + 30 días`
- `caducado` si `fecha_caducidad < today`

**UI:** página `/empresa/documentos` con tabla agrupada por tipo, badges de estado, modal de upload (reusa `UploadModal` con menos campos), avisos en `/empresa` (KPI "X documentos caducan este mes").

**Avisos:** integración con M6 Tracker — cuando una licitación entra en "documentación previa adjudicación", el sistema lista qué documentos está a punto de pedir el órgano y los marca con su estado.

### 4. Semáforo de salud documental — ✅ parcial / 🔲 pendiente la home

Hecho: el KPI de salud documental vive en `/empresa/documentos` (banner superior con `% al día` + sub-KPIs vigentes/a caducar/caducados + lista de "atención inmediata" con countdown).

Pendiente: convertir `/empresa` en home del módulo con un resumen agregado (perfil completitud + salud documental + estado RELIC + acción siguiente). Hoy el sidebar parent va a `/empresa/perfil`. Cuando se construya la home, modificar `Sidebar.tsx` para que el parent navegue a `/empresa` (router) y `/empresa/perfil` baje a child.

### 5. Onboarding guiado 🔲 — bloqueado por auth real

Asistente de 5 pasos al primer login:
1. Datos básicos (formulario corto)
2. Importar de RELIC por CIF (si aplica) — autorrellena lo importable
3. Subir clasificación ROLECE (PDF o manual)
4. Subir certificados de obra (puede saltarse — añadir después)
5. Subir certificados Hacienda + SS al corriente

Sin M2 mínimamente lleno el resto del producto no rinde. El onboarding debe sacar al cliente al M1 en menos de 30 minutos. Si tiene RELIC, en menos de 10.

**Bloqueador:** "primer login" implica que existe auth. Hoy `EMPRESA_DEMO_ID` es hardcodeado. Implementar onboarding antes de auth real significaría disparar el wizard cada vez que se entra (o un flag manual). Esperar a tener Supabase Auth / Clerk en su sitio.

### 6. Avisos automáticos por email 🔲 — depende de auth real + integración con M6 Tracker

Tres trigger points donde el cliente debería recibir un email:

1. **Documento caducando** — 30 días antes y 7 días antes de la `fecha_caducidad` de cualquier documento administrativo (Hacienda/SS/pólizas/ISOs). Worker Celery beat diario recorre `documentos_empresa` y dispara emails.
2. **Adjudicación provisional ganada** — cuando una licitación pasa a estado `documentación_previa` en M6 Tracker (manualmente o vía scraping post-MVP), email con la lista de documentos de M2 que caducan en <14 días o están caducados, marcando los que el órgano va a pedir según LCSP. Es donde una PYME pierde obras ya ganadas — el aviso es el alto valor de M2 + M6 fusionados.
3. **Resumen diario** (configurable) — N nuevas licitaciones encajan + deadlines críticos esta semana + documentos a caducar este mes. Engagement diario.

**Implementación:**
- Servicio `app/services/avisos_email.py` con `enviar_aviso_caducidad(documento)`, `enviar_aviso_adjudicacion(licitacion)`, `enviar_resumen_diario(empresa)`
- Worker `workers/avisos_diarios.py` con beat al amanecer (después del M1 + M2 daily syncs)
- Templates Jinja2 en `templates/email/*.html.j2`
- Backend de email: Resend o Postmark (decidir cuando se aborde — Resend más barato, Postmark más reputación inbox)

**Bloqueadores:**
- Auth real (necesitamos email confirmado del usuario, no solo `email` actual de `empresas` que es info de la empresa)
- M6 Tracker existir con estado `documentación_previa` y la transición que dispara el aviso

### 7. Worker IA para extracción de fechas en documentos administrativos 🔲

Hoy `/empresa/documentos` requiere que el cliente teclee `fecha_emision` y `fecha_caducidad` a mano. Para certificados Hacienda/SS y pólizas, las fechas están en el PDF y son fáciles de extraer.

**Reusar el pipeline del worker M2 actual** (`workers/extraccion_pdf.py`):
- Mismos 5 fixes críticos (NullPool, httpx síncrono, AsyncAnthropic context manager, --pool=solo, EstadoType TypeDecorator)
- Prompt distinto: clasifica tipo de documento (hacienda/SS/póliza/ISO/REA/TC2) y extrae fechas + emisor
- Tras extracción, `documentos_empresa.fecha_emision` y `fecha_caducidad` quedan en `pendiente_revision` hasta que el usuario confirma (regla CLAUDE.md de PDF extraction)

**Por qué post-MVP:** la entrada manual del MVP funciona y es rápida (3 campos). El ahorro de tecleo no justifica el coste de API + complejidad antes de validar con pilotos que el feature de "documentos con caducidad" se usa de verdad. Documentado para saber que está pensado.

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
- CRUD de empresas: endpoints GET/POST/PATCH (sin frontend aún para el formulario completo)
- `extracted_data`: validar schema con Pydantic antes de guardar (actualmente JSONB libre)
- CORS: añadir dominio de Vercel a `allow_origins` en `main.py`

---

## Dependencias
- **Stack base** ya cubierto (FastAPI + PG + Celery + Redis + R2 + Claude API)
- **RELIC**: validar acceso programático antes de planificar
- **Auth real** (sustituir `EMPRESA_DEMO_ID`): bloquea avisos email y multi-tenancy real, no bloquea la implementación de los datos
