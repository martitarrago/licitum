# M3 — Analizador de pliegos

## Propósito
El cliente sube PCAP + PPT (o el sistema los descarga vía importación PSCP del M1) y la IA devuelve, en menos de 60 segundos, todo lo que importa para decidir si ir a la licitación: presupuesto, plazo, clasificación exigida, fórmula de valoración, umbral de baja temeraria, fechas clave, banderas rojas, recomendación ir/no ir.

Es el módulo de mayor palanca del MVP — convierte el Radar de "lista de oportunidades" a "decisión informada" y es la demo de 90 segundos que vende el producto.

Encaja entre M1 (decidir si vale la pena mirar) y M4+M5 (generar Sobre A + Sobre C). Sus extracciones también alimentan el semáforo multi-eje del M1 cuando el usuario abre la ficha de la licitación.

## Estado — base ✅ MVP funcional

Backend ✅, frontend ✅, recomendación ir/no ir ✅. Lo construido en el sprint del 2026-04-27:
- Migración 0012 con tabla `licitacion_analisis_ia` (PK = `licitacion_id`, cache global)
- Modelo + Pydantic schemas + `EstadoAnalisisPliegoType` TypeDecorator
- Worker Celery `extraccion_pliego` con `pdfplumber` + OCR fallback (`spa+cat`) + Claude `tool_use` (28 propiedades, system prompt bilingüe con glosario catalán)
- Servicio `recomendacion_evaluator.py` que cruza extracción × M2 (clasificaciones merged ROLECE+RELIC + volumen + certs + banderas)
- 6 endpoints `/api/v1/pliegos/*`: upload, GET, recomendacion, pdf proxy, reextraer, delete
- Página `/pliegos/[expediente]` con 4 estados (vacío→upload, procesando→polling 3s, fallido→reintentar, completado→bloques)
- Bloques editorial (económico, plazos, solvencia, valoración con extractos LITERALES en blockquote, garantías, sobre A extra, banderas rojas, resumen)
- Panel lateral sticky con recomendación (veredicto color-coded + razones a favor/a vigilar/en contra)
- Botón principal "Analizar pliego con IA" en `/radar/[expediente]`

Tested con casos sintéticos: pliego fácil → veredicto `ir`; pliego difícil → `no_ir` con razones de no + riesgo.

## Entradas
- Subida manual: PCAP + PPT (PDFs, opcionalmente otros anexos del expediente)
- Importación PSCP one-click desde M1: el Radar envía URL del expediente, el sistema descarga los pliegos y dispara el análisis automáticamente
- Idioma: castellano y catalán (Claude sonnet-4-6 procesa nativamente — no traducir antes; el prompt sí debe declarar explícitamente que se acepta catalán)

## Salida estructurada (extracción IA, temperatura 0)

### Económico
- Presupuesto base de licitación (€ sin IVA)
- IVA aplicable (%)
- Valor estimado del contrato (puede incluir prórrogas)

### Plazo
- Plazo de ejecución (días / meses)
- Fecha límite de presentación
- Fecha de apertura de sobres
- Fecha de visita a obra (si la hay)

### Solvencia exigida
- Clasificación (Grupo + Subgrupo + Categoría)
- Solvencia económica (umbral concreto, p.ej. volumen anual >X€)
- Solvencia técnica (obra similar últimos 5 años, importe mínimo, número de obras)

### Valoración
- Fórmula de oferta económica (extracto literal + modelo parametrizado para M5)
- Ponderación criterios subjetivos vs objetivos (% de cada uno)
- Umbral de baja temeraria (extracto literal — nunca parafraseado)
- Mejoras valorables y baremos
- Umbral de saciedad si lo hay

### Garantías
- Provisional (si exige) — % típico hasta 3% del presupuesto
- Definitiva — típico 5% del importe de adjudicación

### Documentación específica del Sobre A
Lo no estándar que pide el órgano, p.ej.:
- Declaración LISMI
- Código ético propio del organismo
- Compromiso de adscripción de medios
- Memoria de criterios sociales / ambientales

### Banderas rojas (heurística + IA)
- Plazo de presentación < 15 días naturales (sospechoso)
- Presupuesto bajo en relación al alcance descrito (riesgo de obra cuesta abajo)
- Criterios subjetivos redactados ambiguamente
- Mejoras valorables muy específicas (puede indicar contrato dirigido)
- Solvencia exigida muy alta para el importe (filtro de PYMES)
- Visita a obra obligatoria con plazo escaso (avisar)

## Recomendación ir/no ir
Cruza los datos extraídos con M2 Empresa y devuelve:
- **Veredicto:** ir / ir con riesgo / no ir
- **Razón en prosa** (temperatura 0.3): *"Te recomiendo ir: cumples clasificación C2-3, tu volumen de negocio (1,2M€) supera el exigido (800K€), has hecho 4 obras similares en 5 años. Riesgo: el plazo de 4 meses es ajustado para tu plantilla actual."*
- **Acciones recomendadas:** generar Sobre A (M4), abrir calculadora (M5), guardar para decidir más tarde (M6)

## Resumen ejecutivo
Un párrafo legible en el coche para el jefe de obra: contexto, lo más relevante, lo arriesgado. Temperatura 0.3.

## Caché y coste
- Cache **GLOBAL por licitación** (no por empresa). El resumen del pliego es el mismo para cualquier usuario.
- Lazy on-demand: solo se ejecuta cuando un usuario lo solicita explícitamente. Nunca eager sobre todo el feed.
- Tabla `licitacion_analisis_ia` con `licitacion_id` como PK (no `(licitacion_id, empresa_id)`).
- La **recomendación ir/no ir sí es por empresa** (cruza con M2): se calcula en tiempo de visualización a partir del análisis cacheado + datos de M2; no se persiste.
- Reutiliza pipeline IA del worker M2 (`pdfplumber` + Claude `tool_use`, fixes críticos de NullPool / AsyncAnthropic context manager / `--pool=solo`).

## Soporte catalán
Crítico para el mercado objetivo. Muchos ayuntamientos catalanes publican PCAPs en catalán. Claude sonnet-4-6 procesa catalán nativamente; el prompt debe:
- Declarar explícitamente que acepta entrada en castellano y catalán
- No forzar idioma de salida (responde en el idioma del input)
- Para extractos literales (umbral baja temeraria, fórmulas), preservar el idioma original

## UI propuesta
Página `/pliegos/[expediente:path]` con:
- Header: nombre licitación, organismo, fecha límite (countdown), botón "Generar Sobre A" + "Abrir calculadora"
- Tarjetas con los datos extraídos agrupados (económico, plazo, solvencia, valoración, garantías, banderas)
- Panel lateral: recomendación ir/no ir + razón + comparación con M2
- Botones de acción: enlazar al M4 (Sobre A) y M5 (Calculadora), guardar en M6 Tracker
- Visor PDF en pestaña secundaria para verificar extractos literales
- Estado del análisis: `procesando` → spinner + estimación 30-60s; `completado` → mostrar; `fallido` → botón reintentar

## Trabajo concreto

### Backend
- Migración Alembic: tabla `licitacion_analisis_ia` con `licitacion_id` PK, `extracted_data` JSONB, `confianza_global`, `idioma_detectado`, `estado` enum, `created_at`, `procesado_at`
- Modelo SQLAlchemy + Schemas Pydantic v2 (`PliegoExtraido` con sub-schemas por bloque)
- Worker Celery `workers/extraccion_pliego.py`:
  - Reusar los 5 fixes críticos de M2
  - Modelo `claude-sonnet-4-6`, temperatura 0, prompt cacheado
  - `tool_use` con schema `PliegoExtraido`
- Endpoints `/api/v1/pliegos`:
  - `POST /{expediente:path}/analizar` — encola análisis si no hay cache
  - `GET /{expediente:path}` — devuelve análisis (con polling 3s para estado `procesando`)
  - `POST /{expediente:path}/reextraer` — fuerza recálculo
  - `GET /{expediente:path}/recomendacion?empresa_id=X` — calcula veredicto on-the-fly cruzando con M2
- `app/services/recomendacion_evaluator.py` — lógica de cruce M3 ↔ M2

### Frontend
- Página `/pliegos/[expediente:path]` con layout dashboard
- Componente `PliegoBloque` reutilizable por bloque
- Componente `RecomendacionPanel` que llama al endpoint con polling
- Reutilizar `PdfViewer` y `LicitacionCard` patterns de M1/M2

## Dependencias
- **M1 Radar** — origen del expediente (importación one-click + acción "analizar pliego")
- **M2 Empresa** — datos para cruzar con la solvencia exigida y generar la recomendación
- Worker Celery con pipeline IA (reutilizar fixes del M2)

## Pendientes — quedaron fuera del sprint MVP

- **Listing `/pliegos`** — página índice con todos los pliegos analizados de la empresa (kanban o tabla con estado, fecha de análisis, recomendación). Hoy el usuario entra a M3 SOLO desde el detalle del Radar; la entrada del sidebar sigue marcada como `available: false`. Al construir el listing → activar el sidebar.
- **Importación PSCP one-click** — pegar URL del expediente en `contractaciopublica.cat` y que el sistema descargue el PCAP automáticamente. UX killer pero requiere scraper del portal público (la API Socrata no expone los PDFs directamente).
- **Multi-PDF (PCAP + PPT separados)** — hoy un solo PDF por licitación; si la empresa quiere subir también el Pliego de Prescripciones Técnicas para enriquecer la extracción, hay que ampliar el modelo a 1:N.
- **Visor PDF inline** — hoy el usuario clica "Ver PDF" → abre nueva pestaña vía `/api/v1/pliegos/{exp}/pdf`. Integrar `react-pdf` (ya existe en M2) en pestaña secundaria del detalle.
- **Parsear umbral de baja temeraria a número** — añadir al `PLIEGO_EXTRACTION_TOOL` campos `baja_temeraria_pct_sobre_base` y `baja_temeraria_puntos_sobre_media` para que M5 (Calculadora) pueda evaluar zona temeraria sin regex frágil.

## Decisiones abiertas (post-MVP)
- ¿Permitir comparar pliego nuevo vs uno previamente analizado del mismo organismo? (detectar copy-paste de cláusulas anómalas)
- ¿Enriquecer banderas rojas con histórico de adjudicaciones del organismo? (depende v2 — `M8-historico` y `M6-competencia`)
- ¿Soporte para anexos no-PDF (Excel de mediciones, BC3 nativo)? Out of MVP — abre puerta a M4-bc3 v2.
