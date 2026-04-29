# M1 — Radar

## Propósito
Punto de entrada del producto. La Plataforma de Serveis de Contractació Pública de la Generalitat de Catalunya (`contractaciopublica.cat`) publica cientos de licitaciones por semana — revisarlas a mano es inviable (un administrativo pierde 2h/día). El Radar **filtra ese ruido automáticamente** y se apoya en M2 Empresa + M3 Pliegos para mostrar no una lista, sino una **bandeja de entrada de oportunidades reales con recomendación de qué hacer**.

Es un **motor de decisión**, no un buscador. La diferencia clave es el semáforo multi-eje, que cruza:
1. Clasificación exigida (CPV ↔ ROLECE) ✅
2. Solvencia económica disponible ✅ (canal 2 vía certificados, ampliable con cuentas anuales del M2)
3. Solvencia técnica acreditada (afinidad histórica con organismo + tipo obra) ✅
4. Plazo de presentación vs hueco real (planificado, depende de M6)

Eso convierte un feed genérico en un asistente.

---

## Estado MVP — base completada ✅

El M1 cubre la promesa diferencial básica: detectar oportunidades reales filtradas por solvencia legal y ordenadas por afinidad histórica. Pendiente: refinar el semáforo con M2 ampliado y añadir acciones (guardar / analizar pliego / descartar).

### Fase 1 — Ingestión y feed básico ✅
- Fuente: dataset `ybgg-dgi6` de la Generalitat vía API Socrata (`analisi.transparenciacatalunya.cat`), sin autenticación, actualización diaria, 54 campos por registro
- Worker Celery `workers/ingesta_pscp.py`: descarga paginada (batches de 1000), dedup por `codi_expedient`, upsert bulk en batches de 500
- ~1.300 licitaciones únicas abiertas en cualquier momento, ~270 son obras
- Tabla `licitaciones` con columnas físicas + JSONB `raw_data`
- API `GET /api/v1/licitaciones` con filtros y paginación
- Frontend `/radar` con grid de cards, búsqueda y botón "Actualizar feed"

### 1. Filtros avanzados ✅
- 7 parámetros: `provincia[]`, `tipo_organismo[]`, `importe_min/max`, `plazo_min/max_dias`, `cpv_prefix`, `q`, `semaforo`
- Estado serializado en URL (`useSearchParams` + `router.replace`) → enlaces compartibles, atrás funciona, recargar conserva estado
- Componentes: `FilterPopover` (portal + auto-flip), `FilterPill` (3 estados), `CheckboxGroup`, `ActiveFilterChip`
- Presets ROLECE para importe (cat 1–6), presets para plazo (hoy / 7d / 14d / 30d / >30d)
- Corte de plazo en hora `Europe/Madrid` con `cutoff = hoy + N+1 días`
- Chip único "Toda Cataluña" cuando las 4 provincias están seleccionadas
- Backfill SQL en migración 0008 (`provincias[]` + `tipo_organismo` desde NUTS y nombre)

### 2. Semáforo CPV ↔ ROLECE ✅
- `app/core/cpv_rolece.py`: catálogo de 18 prefijos CPV de la familia 45 (cubre el 100% del dataset Socrata) → grupos ROLECE A–K
- `app/services/solvencia_evaluator.py`: `SolvenciaEmpresa` snapshot inmutable + `evaluar_semaforo` con doble canal:
  - **Canal 1 — clasificaciones ROLECE activas** (`activa=true AND fecha_caducidad >= today`)
  - **Canal 2 — certificados validados** (fallback legal LCSP art. 88 para obras ≤500K€ y como complemento)
- Razón en prosa con grupo, categoría e importe — el corazón pedagógico del producto:
  - VERDE: *"Tu clasificación C6 (más de 5 M€) cubre esta obra de 578.246 € (exige cat 3, 360 000–840 000 €)."*
  - ROJO: *"Esta obra exige grupo I (Instalaciones eléctricas) y tu solvencia acreditada está en grupo(s) C."*
- Granularidad de **grupo** (A–K), suficiente para v1; refinable a subgrupo sin reescribir consumidores

### 3. Categoría ROLECE por importe ✅
- `parsear_anualidad(importe, durada_text)` con regex catalán para `"N anys/mesos/dies"` y combinaciones (`"1 any 6 mesos"`, `"4 anys 0 mesos 0 dies"`)
- Cap inferior 1 año para no inflar categorías en contratos cortos
- Categoría exigida según RD 1098/2001 art. 26 (cat 1: ≤150 K€ → cat 6: >5 M€)
- Logging de proporción de fallback de duración (~9% del dataset real)

### 4. Ingesta automática diaria ✅
- Celery Beat embebido en el worker (`worker -B --schedule=/tmp/celerybeat-schedule`) → 1 servicio Railway, no 2
- `crontab(hour=7, minute=0)` interpretado en `Europe/Madrid`
- `expires=1800` evita apilar tareas si el worker estuvo caído al disparo
- Las ingestas evalúan el semáforo in-place; el `recalcular_semaforos.py` separado se usa para forzar reevaluación tras cambios en M2

### 5. Factor histórico / afinidad ✅
- Score `0.00–1.00` por licitación cruzando organismo + CPV con el histórico de M2 (certificados de obra)
- Pesos sin DIR3 (configuración actual): nombre organismo 0.7 + prefijo CPV 0.3
- No cambia el semáforo, solo el orden: dentro de cada nivel, las de mayor afinidad suben primero
- Migración 0009: columna `score_afinidad NUMERIC(3,2)` + índice `DESC NULLS LAST` para sort barato
- Frontend: indicador sutil con icono `Sparkles` bajo el organismo:
  - score ≥ 0.7 → *"Has trabajado antes con este organismo"*
  - 0.3 ≤ score < 0.7 → *"Tipo de obra similar a tu histórico"*

### 6. Auto-recálculo del semáforo desde M2 ✅
- `app/services/semaforo_trigger.py` con helper `disparar_recalculo_semaforo()` que encola `recalcular_todas` tras cualquier cambio en M2 que afecte al semáforo:
  - Crear / editar / soft-delete de certificados (incluido el batch)
  - Validar / rechazar / revertir certificado
  - Crear / editar / soft-delete de clasificación
- Tolera fallo del broker silenciosamente (Redis caído → log + seguir; el endpoint M2 nunca cae por esto)
- Idempotente: la tarea solo escribe filas que cambian
- Botón manual "Recalcular semáforos" del Radar como red de seguridad

---

## Distribución del semáforo con la empresa demo (C2-6 activa)

| Estado | Antes | Ahora |
|---|---|---|
| Verde obras | 0 | 240 |
| Amarillo obras | 271 | 0 |
| Rojo obras | 0 | 31 |
| Gris obras | 0 | 0 |

Las 0 amarillas son coherentes: la demo tiene cat 6 (la máxima), nunca está "ajustada".

---

## Pendiente MVP — refinamiento del Radar como motor de decisión

### Semáforo multi-eje (4 ejes) 🟡
Hoy el semáforo cruza CPV ↔ ROLECE + afinidad. Cuando M2 esté ampliado (RELIC + cuentas anuales + certificados Hacienda/SS al día) y M3 esté operativo, el semáforo ampliará a 4 ejes:
1. ✅ Clasificación exigida vs ROLECE/RELIC del cliente
2. 🔲 Solvencia económica exigida (volumen anual exigido en el PCAP, extraído por M3) vs cuentas anuales del cliente (M2 ampliado)
3. ✅ Solvencia técnica (afinidad histórica)
4. 🔲 Plazo de presentación vs hueco operativo del cliente — depende del calendario de obras en M6

El cálculo se mantiene **on-demand** cuando el usuario abre la ficha (regla de coste — ver `m2_pliegos_cache_global.md` en memoria del proyecto). El feed sigue mostrando el semáforo CPV+afinidad pre-calculado para no disparar coste IA por ingesta.

### Importación PSCP one-click 🔲
Pegar URL de un expediente del portal `contractaciopublica.cat` → el sistema descarga PCAP+PPT y dispara M3 automáticamente. UX killer — los competidores hacen subir manualmente.

Endpoint propuesto: `POST /api/v1/radar/importar-expediente` body `{ url }` → resuelve `codi_expedient`, descarga adjuntos vía scraper del portal público, encola M3.

### Acciones por fila 🔲
En la card de cada licitación + en el detalle:
- **Guardar** → manda al M6 Tracker en estado `en preparación`
- **Analizar pliego** → dispara M3 si no hay análisis cacheado, abre el dashboard de pliegos
- **Descartar** → silencia la licitación en el feed (no aparece más salvo filtro explícito)

Modelo de datos: el estado por licitación se gestiona en `licitacion_estado_empresa` (ver [M6 Tracker](M6-tracker.md)). El Radar simplemente despliega los CTAs.

### Detalle con análisis IA del pliego → migrado a M3
El "Punto 6 — Detalle con análisis IA del pliego" del backlog antiguo se ha promovido a módulo propio: ver [M3 Pliegos](M3-pliegos.md). Reutiliza la decisión de arquitectura (cache global por licitación, lazy on-demand, tabla `licitacion_analisis_ia`).

### Estados kanban → migrado a M6
El "Punto 7 — Estados por licitación" del backlog antiguo se ha promovido a módulo propio: ver [M6 Tracker](M6-tracker.md). El Radar enlaza al pipeline pero la gestión vive en M6.

---

## Deuda técnica
- **Capturar `organismo_id` (DIR3) en certificados de M2** → desbloquea el peso 0.5 de DIR3 en el cálculo de afinidad y rebalancea la fórmula a 0.5 / 0.3 / 0.2 (DIR3 / nombre / CPV)
- **Persistencia de filtros favoritos** (`empresas.filtros_radar` JSONB) → depende de auth real; el URL state cubre el caso real hasta entonces
- **Refinar mapeo CPV→ROLECE a nivel de subgrupo** cuando aparezcan pliegos que exijan subgrupo específico (`C2`, `G4`, etc.)
- **Ajustar mensaje del semáforo cuando los grupos exigidos son TODOS** (CPV genérico 45000000) — actualmente la prosa solo menciona la cobertura, sin contexto del CPV genérico
- **Renombrar `licitaciones.url_placsp` → `url_publicacio`** (cosmético, el dato viene de PSCP no de PLACSP)
- **Ingesta multi-lote: importe del expediente vs importe del lote** 🐞
  PSCP devuelve **una fila por lote** del mismo `codi_expedient`, cada una con su propio `pressupost_licitacio_sense`. El worker en `backend/workers/ingesta_pscp.py:122-128` deduplica por `codi_expedient` y conserva la **primera aparición**, ordenada por `data_publicacio_anunci DESC` — no por `numero_lot`. Resultado: cualquiera de los lotes (no necesariamente el más grande) acaba representando al expediente entero.

  **Ejemplo real detectado 2026-04-29** — expediente `2025CT09_2026_755` "CONSTRUCCIÓ POLIESPORTIU MUNICIPAL":
  | Lot | Descripción | `pressupost_licitacio_sense` |
  |-----|-------------|---:|
  | 1 | Pavelló esportiu (3 fases) | 3.424.960,79 € |
  | 2 | Terra tècnic | 107.052,10 € |
  | 3 | Equipament | 46.901,22 € |
  | 4 | Pistes de pàdel | 81.412,54 € |
  | 5 | Urbanització accés | **51.079,68 €** ← guardado en BBDD |
  | **Total** | | **3.711.406,33 €** = `valor_estimat_expedient` |

  En la card del Radar se ve 51 K€; al analizar el pliego (M3 lee el PDF completo) aparecen los 3,7 M reales — choque visible para el usuario.

  **Impacto** — el importe erróneo afecta a:
  - Filtro `importe_min/max` del Radar (oportunidades grandes filtradas hacia abajo)
  - `evaluar_semaforo` (categoría ROLECE exigida calculada sobre el importe equivocado)
  - `empresa_context.calcular_banda_competitiva` y scoring de afinidad PSCP
  - M5 Sobre B y M6 Calculadora consumen `licitacion.importe_licitacion` directo

  **Fix propuesto** — en `_parsear_row` o en una fase previa al dedup en `_ejecutar_ingesta`:
  1. Usar `valor_estimat_expedient` como fuente principal de `importe_licitacion` (PSCP lo devuelve idéntico en todas las filas del expediente, por diseño es el total).
  2. Fallback: `SUM(pressupost_licitacio_sense)` agrupando filas por `codi_expedient` antes de deduplicar.
  3. Persistir los lotes individuales en `raw_data.lotes` (lista) para que M3/M5 tengan la descomposición y puedan razonar sobre lotes.
  4. (Opcional) añadir `numero_lotes` como columna física para ordenar/filtrar y para mostrar un badge "5 lotes" en la card.

  **Validación** — antes de patchear, contar cuántos expedientes en BBDD tienen `numero_lot != NULL` y comparar `importe_licitacion` actual vs `SUM(pressupost_licitacio_sense)` real (consultando la API PSCP) para dimensionar cuántas oportunidades están infravaloradas.

## Geográfico (post-MVP) 🔲
Configurar radio operativo por empresa (`provincia_base`, `radio_km` en `empresas`) y degradar el semáforo a amarillo si la obra cae fuera del radio. Los filtros del punto 1 ya cubren el caso manual hasta que haya feedback de pilotos.

## Expansión a toda España (post-MVP) 🔲
Hoy el feed solo cubre Cataluña (dataset Socrata Generalitat). Si los primeros clientes operan en otras comunidades:
- Investigar nuevos endpoints de la PLACSP nacional (los antiguos quedaron decomisionados en 2024)
- O añadir una segunda fuente en `workers/ingesta_placsp.py`

---

## Notas técnicas
- El modelo `Licitacion` tiene `raw_data` JSONB (con `lloc_execucio`, `nom_ambit`, `codi_nuts`, `numero_lot`, `durada_contracte`, etc.). Los filtros del M1 promueven a columnas físicas (`provincias[]`, `tipo_organismo`, `score_afinidad`) los datos que aparecen en `WHERE` constantes — índices B-tree/GIN, mejor performance que JSONB
- El campo `cpv_codes` admite el separador `||` (formato Socrata cuando un registro tiene múltiples valores) — el extractor de grupos splittea por `||` antes de mapear
- La empresa demo (`00000000-0000-0000-0000-000000000001`) tiene `C2-6` activa y `0` certificados validados → todos los semáforos verdes vienen del canal 1. El canal 2 (certificados) está implementado pero solo se ejercita cuando hay certificados reales
- En Railway: el servicio worker arranca con `celery worker -B` (Beat embebido). Si en el futuro hay >1 instancia de worker, mover Beat a un servicio propio para evitar disparos duplicados
