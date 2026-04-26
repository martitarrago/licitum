# M2 — Radar IA

## Propósito
Módulo que justifica la suscripción por sí solo. La Plataforma de Serveis de Contractació Pública (PSCP) de la Generalitat de Catalunya publica cientos de licitaciones por semana; revisarlas manualmente es inviable (un administrativo puede perder 2h/día solo en eso).

El Radar **filtra ese ruido automáticamente**. Solo muestra licitaciones con semáforo verde o amarillo: aquellas para las que técnicamente la empresa puede optar según su clasificación oficial y solvencia económica acreditada. Las rojas directamente no aparecen (o se relegan a un filtro aparte).

La diferencia con un buscador por CPV es que **el semáforo cruza varias variables**:
1. Si tiene la clasificación correcta (cruce con M3 clasificaciones)
2. Si el importe de la obra cabe dentro de su solvencia disponible (cruce con M3 certificados)
3. Si el tipo de obra se parece a lo que ha hecho antes (histórico)
4. Si la ubicación está dentro del radio operativo de la empresa

Eso convierte un feed genérico en una **bandeja de entrada de oportunidades reales**.

---

## Estado MVP — completado ✅

El M2 está cerrado para MVP. Cubre la promesa diferencial del producto: detectar oportunidades reales filtradas por solvencia legal y ordenadas por afinidad histórica.

### Fase 1 — Ingestión y feed básico ✅
- Fuente de datos: dataset `ybgg-dgi6` de la Generalitat vía API Socrata (`analisi.transparenciacatalunya.cat`), sin autenticación, actualización diaria, 54 campos por registro
- Worker Celery `workers/ingesta_pscp.py`: descarga paginada (batches de 1000), dedup por `codi_expedient`, upsert bulk en batches de 500
- ~1.300 licitaciones únicas abiertas en cualquier momento, de las cuales ~270 son obras
- Tabla `licitaciones` con columnas físicas + JSONB `raw_data`
- API `GET /api/v1/licitaciones` con filtros y paginación
- Frontend `/radar` con grid de cards, búsqueda y botón "Actualizar feed"

### 1. Filtros avanzados ✅
- 7 parámetros: `provincia[]`, `tipo_organismo[]`, `importe_min/max`, `plazo_min/max_dias`, `cpv_prefix`, `q`, `semaforo`
- Estado serializado en URL (`useSearchParams` + `router.replace`) → enlaces compartibles, atrás funciona, recargar conserva estado
- Componentes UI nuevos: `FilterPopover` (portal + auto-flip), `FilterPill` (3 estados), `CheckboxGroup`, `ActiveFilterChip`
- Presets ROLECE para importe (cat 1–6), presets para plazo (hoy / 7d / 14d / 30d / >30d)
- Corte de plazo en hora `Europe/Madrid` con `cutoff = hoy + N+1 días`
- Chip único "Toda Cataluña" cuando las 4 provincias están seleccionadas
- Backfill SQL en migración 0008 (provincias[] + tipo_organismo desde NUTS y nombre)

### 2. Semáforo real CPV ↔ ROLECE ✅
- `app/core/cpv_rolece.py`: catálogo de 18 prefijos CPV de la familia 45 (cubre el 100% del dataset Socrata) → grupos ROLECE A–K
- `app/services/solvencia_evaluator.py`: `SolvenciaEmpresa` snapshot inmutable + `evaluar_semaforo` con doble canal:
  - **Canal 1 — clasificaciones ROLECE activas** (`activa=true AND fecha_caducidad >= today`)
  - **Canal 2 — certificados validados** (fallback legal LCSP art. 88 para obras ≤500K€ y como complemento)
- Razón en prosa con grupo, categoría e importe — el corazón pedagógico del producto:
  - VERDE: *"Tu clasificación C6 (más de 5 M€) cubre esta obra de 578.246 € (exige cat 3, 360 000–840 000 €)."*
  - ROJO: *"Esta obra exige grupo I (Instalaciones eléctricas) y tu solvencia acreditada está en grupo(s) C."*
- Granularidad de **grupo** (A–K), no subgrupo. Suficiente para v1; refinable a futuro sin reescribir consumidores.

### 3. Categoría ROLECE por importe ✅ *(absorbida en el punto 2)*
- `parsear_anualidad(importe, durada_text)` con regex catalán para `"N anys/mesos/dies"` y combinaciones (`"1 any 6 mesos"`, `"4 anys 0 mesos 0 dies"`)
- Cap inferior 1 año para no inflar categorías en contratos cortos (un contrato de 100 K€ en 29 días NO debe exigir cat 6)
- Categoría exigida según RD 1098/2001 art. 26 (cat 1: ≤150 K€ → cat 6: >5 M€)
- Logging de proporción de fallback de duración (~9% del dataset real)

### 4. Ingesta automática diaria ✅
- Celery Beat embebido en el worker (`worker -B --schedule=/tmp/celerybeat-schedule`) → 1 servicio Railway, no 2
- `crontab(hour=7, minute=0)` interpretado en `Europe/Madrid`
- `expires=1800` evita apilar tareas si el worker estuvo caído al disparo
- Las ingestas evalúan el semáforo in-place; el `recalcular_semaforos.py` separado se usa para forzar reevaluación tras cambios en M3

### 5. Factor histórico / afinidad ✅
- Score `0.00–1.00` por licitación cruzando organismo + CPV con el histórico de M3
- Pesos sin DIR3 (configuración actual): nombre organismo 0.7 + prefijo CPV 0.3
- No cambia el semáforo, solo el orden: dentro de cada nivel, las de mayor afinidad suben primero
- Migración 0009: columna `score_afinidad NUMERIC(3,2)` + índice `DESC NULLS LAST` para sort barato
- Frontend: indicador sutil con icono `Sparkles` bajo el organismo:
  - score ≥ 0.7 → *"Has trabajado antes con este organismo"*
  - 0.3 ≤ score < 0.7 → *"Tipo de obra similar a tu histórico"*

---

## Distribución del semáforo con la empresa demo (C2-6 activa)

| Estado | Antes | Ahora |
|---|---|---|
| Verde obras | 0 | 240 |
| Amarillo obras | 271 | 0 |
| Rojo obras | 0 | 31 |
| Gris obras | 0 | 0 |

Las 0 amarillas son coherentes: la demo tiene cat 6 (la máxima), nunca está "ajustada" — todo lo que tenga grupo correcto va directo a verde.

---

## Pendiente post-MVP

Todo lo que queda fuera del scope del MVP. No bloquea ventas; se retoma con feedback de usuarios reales o cuando los módulos dependientes estén montados.

### Punto 6 — Detalle con análisis IA del pliego 🔲

Página `/radar/[expediente]` con resumen IA del pliego oficial (3 bullets: qué piden, criterios de adjudicación, plazo crítico) + botones para saltar a otros módulos.

**Por qué se aplaza:**
- Sin M4 (BC3) ni M5 (Memorias) los botones *"preparar memoria"* y *"analizar presupuesto"* no llevan a ningún sitio — el ciclo no se cierra
- Coste alto en LLM tokens si se analiza todo el feed automáticamente

**Decisión de arquitectura ya tomada (cuando se construya):**
- Cache GLOBAL por licitación (no por empresa) — el resumen del pliego es el mismo para cualquier usuario
- Lazy on-demand: solo se ejecuta cuando UN usuario lo solicita explícitamente desde la UI
- Tabla `licitacion_analisis_ia` con `licitacion_id` como PK (no `(licitacion_id, empresa_id)`)
- Reusa la infraestructura de extracción IA del worker M3 (`pdfplumber` + Claude `tool_use`)

### Punto 7 — Pipeline kanban 🔲

Estados por licitación: `nueva / seguida / descartada / presentada / ganada / perdida`. Vista kanban con métricas de embudo comercial (tasa de éxito, baja media, tiempo medio hasta decisión).

**Por qué se aplaza:**
- Sin volumen real de licitaciones gestionadas, un kanban con 2 cards parece un juguete
- Las métricas dependen de datos que aún no existen (M8 Histórico cierra el ciclo)
- Requiere multi-tenancy real (sin auth todavía)

**Trabajo futuro:**
- Tabla `licitacion_empresa_estado(licitacion_id, empresa_id, estado, …)` (multi-tenancy)
- Endpoints `PATCH /licitaciones/{id}/estado`
- Vista `/radar/pipeline` con drag-and-drop

### Deuda técnica

- **Capturar `organismo_id` (DIR3) en certificados de M3** → desbloquea el peso 0.5 de DIR3 en el cálculo de afinidad y rebalancea la fórmula a 0.5 / 0.3 / 0.2 (DIR3 / nombre / CPV)
- **Auto-trigger de recálculo desde M3** → hoy es manual con el botón "Recalcular semáforos"; cuando se valida/rechaza un certificado o se edita una clasificación, el semáforo del Radar queda obsoleto hasta el siguiente trigger
- **Notificaciones por email/push tras la ingesta diaria** (*"3 nuevas oportunidades verdes para ti"*) → depende de tener auth real (sin destinatario claro hoy)
- **Persistencia de filtros favoritos** (`empresas.filtros_radar` JSONB) → dependía del punto 1 pero quedó fuera de scope; el URL state cubre el caso real hasta que haya auth y "perfiles" de usuario
- **Refinar mapeo CPV→ROLECE a nivel de subgrupo** cuando aparezcan pliegos que exijan subgrupo específico (`C2`, `G4`, etc.); hoy operamos a nivel de grupo (A–K) y cubre el 95% de los casos
- **Ajustar mensaje del semáforo cuando los grupos exigidos son TODOS** (CPV genérico 45000000) — actualmente la prosa dice solo *"Tu clasificación C6 cubre esta obra"* sin mencionar que el CPV genérico abarcaba todo (resuelto pero anotado por si aparece otro caso similar)
- **Renombrar `licitaciones.url_placsp` → `url_publicacio`** (cosmético, el dato viene de PSCP no de PLACSP)

### Geográfico (Fase 2.3 del plan original) 🔲

Configurar radio operativo por empresa (`provincia_base`, `radio_km` en `empresas`) y degradar el semáforo a amarillo si la obra cae fuera del radio.

**Por qué se aplaza:** los filtros del punto 1 ya permiten al usuario filtrar manualmente por provincia. La automatización con radio + tabla de centroides NUTS3 es nice-to-have, no MVP.

### Expansión a toda España 🔲

Hoy el feed solo cubre Cataluña (dataset Socrata Generalitat). Si los primeros clientes operan en otras comunidades:
- Investigar nuevos endpoints de la PLACSP nacional (los antiguos quedaron decomisionados en 2024)
- O añadir una segunda fuente en `workers/ingesta_placsp.py`

---

## Notas técnicas

- El modelo `Licitacion` tiene `raw_data` JSONB donde se guardan `lloc_execucio`, `nom_ambit`, `codi_nuts`, `numero_lot`, `durada_contracte`, etc. Los filtros M2 promueven a columnas físicas (`provincias[]`, `tipo_organismo`, `score_afinidad`) los datos que aparecen en `WHERE` constantes — índices B-tree/GIN, mejor performance que JSONB
- El campo `cpv_codes` admite el separador `||` (formato Socrata cuando un registro tiene múltiples valores) — el extractor de grupos splittea por `||` antes de mapear
- La empresa demo (`00000000-0000-0000-0000-000000000001`) tiene `C2-6` activa y `0` certificados validados → todos los semáforos verdes vienen del canal 1 (clasificación). El canal 2 (certificados) está implementado pero solo se ejercita cuando hay certificados reales
- En Railway: el servicio worker arranca con `celery worker -B` (Beat embebido). Si en el futuro hay >1 instancia de worker, mover Beat a un servicio propio para evitar disparos duplicados
