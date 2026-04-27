# M4 — Estudio económico (BC3)

## Propósito
Resuelve uno de los trabajos más tediosos y críticos: convertir el presupuesto de la administración en algo con lo que puedas trabajar y comparar.

Cuando la administración publica una licitación, incluye un presupuesto con todas las partidas (metros de hormigón, kilos de acero, horas de maquinaria…) en PDF. Para preparar tu oferta económica necesitas ese mismo desglose en formato editable.

**Extractor:** sube el PDF, el sistema detecta las tablas, las normaliza y entrega el presupuesto en BC3 (estándar del sector) y Excel. El usuario trabaja directamente en su software de presupuestos habitual.

**Análisis de costes:** compara el precio unitario de la administración para cada partida con lo que tú has cobrado históricamente. Identifica las partidas donde vas a perder dinero si ofertas al precio de la administración — antes de que firmes.

**Análisis de Pareto:** señala las 5-10 partidas que concentran el 80% del presupuesto, para no perder tiempo refinando partidas que no mueven la aguja.

## Estado
🔲 Pendiente de construir

## Dependencias
- Formato BC3 (spec del sector)
- Histórico propio de precios unitarios (puede nutrirse de M3 + datos introducidos por el usuario)

## Notas de diseño
- La extracción de tablas de PDF es el reto técnico principal — evaluar `camelot`, `pdfplumber.extract_tables` o LLM con OCR
- El output BC3 debe ser válido para importar en Presto/Arquímedes

---

## Ruta técnica

### Alcance del MVP (decisión cerrada)
**Solo extracción + generación de BC3 importable en TCQ.** El cliente descarga el archivo, lo abre en TCQ y termina de pulirlo allí con su base de precios habitual.

- **No** hay análisis de costes, baja temeraria ni Pareto en el MVP
- **No** hay matching BEDEC ni banco de precios del cliente en el MVP
- **No** hay editor de presupuesto fino en frontend — solo correcciones puntuales pre-export

Razón: ahorrar las 4-6 horas de tecleo del PDF al BC3 ya es un valor enorme y suficiente para v1. El resto requiere investigación con clientes reales antes de invertir tiempo (ver "Futuro" más abajo).

---

### Fase 0 — Atajo: detectar BC3 nativo
Antes de extraer del PDF, comprobar si la administración ya publicó el BC3 en el sobre del pliego (M2 ya tiene los archivos del expediente).

- Si hay BC3 → parsearlo directamente con `app/services/bc3_reader.py`. Sin LLM. Sin coste. Resultado perfecto.
- Si solo hay PDF → caer a Fase 1.

Implementar Fase 0 primero porque es trivial (parser determinístico) y elimina un porcentaje no trivial de casos del flujo caro.

---

### Fase 1 — Extractor PDF → BC3
Subir PDF → tabla de partidas → export BC3 importable en TCQ.

**Decisión técnica de extracción:** **LLM-first con Claude vision** sobre PDF rasterizado.
- Los presupuestos públicos vienen en formatos muy variables (escaneados, celdas combinadas, multi-página). `pdfplumber`/`camelot` se rompen con frecuencia.
- Coste asumible: una oferta económica vale órdenes de magnitud más que la llamada al LLM. Cachear por hash del PDF.
- Chunking por capítulo si el PDF es largo (>40 páginas) — procesar capítulo a capítulo y unir.

**Validación de invariantes post-extracción (CRÍTICO):**
Sin esto, una alucinación del LLM se cuela en el BC3 que descarga el cliente.
- `importe == round(medición × precio_unitario, 2)` por partida → si no, marcar partida como "revisar"
- `∑(partidas) == total declarado del capítulo` → si no, reextraer ese capítulo
- `∑(capítulos) == PEM declarado` → si no, banner global "presupuesto no cuadra, revisar"

**Backend — modelos (Alembic nueva migración):**
- `presupuestos`: `id`, `empresa_id`, `licitacion_id` (nullable, link a M2), `nombre`, `pdf_url`, `pdf_hash`, `bc3_nativo` (bool — true si vino de Fase 0), `estado` (`procesando|pendiente_revision|validado|rechazado`), `total_pem`, `total_pec`, `confianza_global`, `invariantes_ok` (bool), `created_at`, `deleted_at`
- `partidas_presupuesto`: `id`, `presupuesto_id`, `capitulo`, `codigo`, `unidad`, `descripcion`, `medicion`, `precio_unitario`, `importe`, `confianza_celda`, `revisar` (bool, true si invariante falla), `orden`
- Soft delete (`deleted_at`) + UUIDs como en M3

**Backend — endpoints (`/api/v1/bc3/presupuestos`):**
- `POST` — sube PDF, comprueba si viene con BC3 (Fase 0), encola extracción
- `GET`, `GET /{id}`, `PATCH /{id}`, `DELETE /{id}`
- `GET /{id}/partidas`, `PATCH /{id}/partidas/{partida_id}` (correcciones puntuales)
- `POST /{id}/validar`, `POST /{id}/rechazar`, `POST /{id}/reextraer`
- `GET /{id}/pdf` — proxy R2 (igual que M3)
- `GET /{id}/export.bc3` — genera y descarga BC3

**Worker Celery — `workers/extraccion_presupuesto.py`:**
- Reusar los 5 fixes críticos de M3: `NullPool`, `httpx.Client` síncrono, `AsyncAnthropic` context manager, `--pool=solo`, `EstadoType` con TypeDecorator
- Modelo: `claude-sonnet-4-6`, temperatura 0, prompt cacheado (`cache_control: ephemeral`)
- `tool_use` con schema Pydantic v2: `PresupuestoExtraido` con lista de `PartidaExtraida` (incluye `confianza_celda` por partida)
- Tras extracción: pasar por `validar_invariantes()`

**Generación BC3:**
- `app/services/bc3_writer.py` — secciones `~V` (cabecera), `~C` (concepto/partida), `~M` (medición simple), `~T` (texto/pliego cuando exista). Sin descomposición (`~D`) — el cliente la añade en TCQ.
- **Validación obligatoria pre-deploy:** importar el BC3 generado en TCQ (no Presto/Arquímedes — el target real es TCQ). Si no abre limpio, no se hace deploy.

**Frontend:**
- `/bc3/presupuestos` — lista con polling 3s (patrón M3)
- `/bc3/presupuestos/[id]/revisar` — two-column: `PdfViewer` (izq) + tabla agrupada por capítulo (der). Cada celda con halo según `confianza_celda` (verde >0.9 / amarillo 0.7-0.9 / rojo <0.7). Filas con `revisar=true` destacadas.
- Banner si `invariantes_ok=false` con detalle ("capítulo 03: las partidas suman 12.450€ pero el total declarado es 12.500€")
- Reusar `CustomSelect`, `PdfViewer` de M3
- Botón "Descargar BC3" solo activo si `estado=validado`. Sin requerir `invariantes_ok=true` (el cliente decide si lo descarga aunque no cuadre — pero con warning visible).

**Regla crítica:** sin `validar` explícito, el presupuesto queda en `pendiente_revision` y no se puede descargar. Idéntico al flow de M3.

---

## Futuro — pendiente investigación con clientes
Las funcionalidades a continuación son las que convertirían M4 en una herramienta diferencial real. NO se construyen sin antes haber entrevistado a 3-5 jefes de estudio reales que usen TCQ y validar la hipótesis. Documentadas aquí para no perder el hilo.

- **Matching BEDEC en la extracción** — pre-etiquetar partidas con código BEDEC (catálogo ITeC) para que el BC3 abra en TCQ con códigos que el cliente reconoce
- **Cálculo de baja temeraria** — leer fórmula del pliego (M2), calcular umbral en €, mostrar "tu coste mínimo está N% bajo el umbral → puedes/no puedes ofertar sin caer". El feature 10/10.
- **Banco de precios del cliente** — importar Excel/CSV con `código BEDEC | descripción | unidad | precio` + tarifas internas (€/h oficial, €/h peón, % GG, % BI). Permite calcular coste real por partida.
- **Análisis de costes con histórico propio** — comparar precio admin vs precio histórico, semáforo verde/amarillo/rojo. Requiere banco de precios o histórico ≥200 partidas.
- **Análisis de Pareto** — destacar las 5-10 partidas que suman 80% del importe. Trivial una vez exista la tabla de partidas.
- **Extracción IA de albaranes/facturas** — para clientes sin base de precios estructurada. Casi un módulo aparte.

### Preguntas a validar con clientes antes de invertir en lo de arriba
- ¿Qué hacen hoy con el PDF de la admin? ¿Tipean a mano, OCR, externalizan?
- ¿Qué porcentaje de presupuestos públicos vienen ya con BC3? (define el ROI de Fase 0)
- ¿Editarían el presupuesto en una web o solo en TCQ?
- ¿Tienen base de precios propia exportable o trabajan sobre BEDEC pelado?
- ¿Calculan hoy la baja temeraria a mano? ¿Cuánto les duele?

---

## Dependencias técnicas para Fase 0 + Fase 1
- Spec FIEBDC-3 oficial (público) y 3-5 BC3s de muestra para tests del reader/writer
- 5-10 PDFs reales de presupuestos públicos (variedad: pequeño/grande, escaneado/digital) para benchmarkear extracción
- Acceso a TCQ para validar el BC3 generado — sin esto la Fase 1 no se puede dar por terminada
