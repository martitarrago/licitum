# Phase 2 — Integración de M3 (análisis de pliego) con el motor de ganabilidad

**Estado:** spec, pendiente de implementar
**Sesión propuesta:** próxima sesión completa (estimado 1-2 días de trabajo)
**Prerequisitos leídos:**
- [`architecture.md`](./architecture.md) — Phase 1 ya en producción (28k adjudicaciones, scoring bayesiano, mviews, cron diario, trigger M2→scores)
- [`docs/modules/M3-pliegos.md`](../modules/M3-pliegos.md) — base de M3 ya construida (worker, recomendación, página `/pliegos/[expediente]`)
- Memoria del proyecto: `demo_empresa_seed.md` y `project_winnability_engine_committed.md`

---

## 1. Por qué construir esto

El motor actual (Phase 1) puntúa cada licitación con 6 señales calculadas sobre **PSCP histórico + M2 estructurado**. **No lee el pliego.** Pero el pliego (PCAP+PPT) contiene cosas que ninguna otra fuente expone:

- Clasificación EXACTA exigida (a menudo a nivel de subgrupo concreto, no solo grupo)
- Solvencia económica con cifra exacta (volumen anual exigido en €)
- Solvencia técnica detallada (importe mínimo, número de obras similares, plazo histórico)
- Criterios técnicos puntuables (memoria, equipo adscrito, mejoras valorables)
- Restricciones geográficas o experiencia específica añadidas ad-hoc

**Síntoma reportado por el usuario:** *"cuando una oferta tiene buena puntuación analizo el pliego y me dice lo contrario"*. Score 85 azul + pliego dice "exige G6 cat 4 que no tienes" → cliente sin confianza en el motor.

**Solución arquitectónica:** capa híbrida.

```
┌─ Capa 1 (HECHO Phase 1): scoring rápido PSCP+M2 → tabla licitacion_score_empresa
│       triaje barato y batch de TODAS las licitaciones abiertas (~1300)
│       ↓
├─ Capa 2 (HECHO M3 base + FALTA INTEGRACIÓN — Phase 2):
│  análisis profundo de pliego solo del top-N por score
│       ↓
└─ Capa 3 (HECHO): página detalle muestra el análisis citable
```

---

## 2. Decisiones tomadas (no re-discutir)

| Decisión | Valor | Motivo |
|---|---|---|
| Modelo Claude | sonnet-4-6 (mismo que actual) | Ya validado en `extraccion_pliego.py` |
| Análisis es por licitación, no por empresa | Cache global en `licitacion_analisis_ia` | El pliego es el mismo independiente de quién mira; coste no escala con N empresas |
| Análisis solo PENALIZA o CONFIRMA | Nunca sube score sin techo | Evita bucle de re-rankings infinito |
| Buffer del cron | Top-20 (no top-5) | Aunque pliego baje un score, el siguiente top-5 ya está analizado |
| TTL del análisis | 30 días | Una vez analizado queda fijo ese mes; re-análisis solo por triggers explícitos |
| Budget guard | máx 10 análisis nuevos/día/empresa | Evita explosión de coste en empresa nueva |
| Peso de la señal pliego en el score compuesto | 0.20 (redistribuido: −0.05 competencia, −0.05 baja) | Suficiente para mover entre tiers sin dominar; calibrable después con feedback |
| Coste objetivo | $0.30-0.50 por pliego (~$8-12 primer arranque demo, $2-4/día ongoing) | Sostenible con margen vs subscripción €300/mes |
| Skip pliego enorme | >500k tokens → marcar pendiente con razón | Evita coste descontrolado en pliegos atípicos |
| Fuente de PDFs | PSCP attachments (`contractaciopublica.cat`) | Para MVP Cataluña no se necesita PLACSP |
| Si pliego no descargable | Estado `documento_no_disponible` | UI muestra "sin pliego accesible" |

---

## 3. Estado actual (lo que YA existe — no tocar, reutilizar)

### Backend
- **Tabla `licitacion_analisis_ia`** (PK = `licitacion_id`) — schema en `backend/app/models/licitacion_analisis_ia.py`. Cache global. Campos: `pdf_url`, `estado` (enum), `extracted_data` JSONB, `idioma_detectado`, `confianza_global`, `error_mensaje`, `procesado_at`.
- **Tabla `pscp_pliego_doc`** — definida en migración 0015, lista para guardar metadatos de PDFs descubiertos en el expediente PSCP (Phase 1.5 ready).
- **Worker Celery `extraccion_pliego.py`** en `backend/workers/` — recibe PDF subido manualmente, hace extracción con `pdfplumber` + OCR fallback `tesseract spa+cat`, llama Claude con tool_use de 28 propiedades, guarda en `licitacion_analisis_ia`.
- **Servicio `recomendacion_evaluator.py`** en `backend/app/services/` — cruza `extracted_data` × M2 (clasificaciones merged ROLECE+RELIC + volumen + certs + banderas) → veredicto `ir`/`ir_con_riesgo`/`no_ir` + razones a favor/a vigilar/en contra.
- **6 endpoints `/api/v1/pliegos/*`**: upload PCAP, GET estado, GET recomendacion, pdf proxy, reextraer, delete.

### Frontend
- **Página `/pliegos/[expediente]`** — 4 estados (vacío→upload, procesando→polling 3s, fallido→reintentar, completado→bloques editorial: económico, plazos, solvencia, valoración con extractos LITERALES, garantías, sobre A extra, banderas rojas, resumen + panel sticky con recomendación).
- **Botón "Analizar pliego con IA"** en `/radar/[expediente]` (link a `/pliegos/[expediente]`).

### Lo que NO existe y hay que construir
1. Descarga automática del PCAP/PPT desde PSCP attachments
2. Auto-trigger del análisis tras recalc de scores (top-20 buffer)
3. Hook análisis-completado → re-score esa licitación con la 7ª señal
4. Señal `pliego_check` en `composite.py`
5. Campo `pliego_estado` y `pliego_resumen` en respuesta API de `/licitaciones`
6. Badge en card + filter pill en frontend

---

## 4. Plan por fases (orden de ejecución)

### Fase B1 — Descarga automática de PDFs del expediente PSCP

**Objetivo:** dado un `licitacion_id`, descargar automáticamente PCAP+PPT desde el portal `contractaciopublica.cat`.

**Files a tocar:**
- **Nuevo:** `backend/app/services/pscp_attachment_downloader.py`
- **Existente:** `workers/extraccion_pliego.py` — añadir entrypoint que recibe `licitacion_id` (en vez de PDF subido) y resuelve URL → descarga → llama al pipeline existente.

**Decisiones técnicas:**
- Usar la columna `licitaciones.url_placsp` (que pese a su nombre es la URL del expediente en PSCP) como punto de entrada.
- Scrape simple con `httpx` + `beautifulsoup4`: descargar HTML del expediente, identificar enlaces a PDFs de tipo "PCAP", "PPT", "Plec administratiu", "Plec tècnic", "Plec de prescripcions tècniques", "Quadre de característiques" (y variantes catalán/castellano).
- Si encuentra ≥1 PDF que parece PCAP → procede. Si no → marca `licitacion_analisis_ia.estado = 'documento_no_disponible'` con razón.
- Cachear los PDFs en R2 (Cloudflare) bajo `pscp/{codi_expedient}/{filename}.pdf` para no re-descargar y servirlos al frontend si el usuario quiere ver el PDF original.
- Concatenación: si hay PCAP y PPT, ambos se concatenan en orden y se procesan como un único análisis (el worker actual ya soporta multi-PDF).

**Acceptance criteria:**
- Test manual: dado el `licitacion_id` de una licitación demo (cualquiera de las 138 viables), llamar al nuevo entrypoint y ver que se rellena `licitacion_analisis_ia` con `estado = 'completado'`.
- Tiempo total <90 segundos.
- Coste <$1 (verificado en log de worker).
- Skip sin error si pliego >500k tokens (estado `documento_demasiado_grande`).

**Estimación:** 4-6 horas. La parte costosa es el scraping del HTML del portal — patrón puede variar entre tipos de organismo.

---

### Fase B2 — Auto-trigger del top-20 buffer

**Objetivo:** cron diario tras `_run_recalc_empresa` que encole análisis de hasta 10 pliegos pendientes del top-20 de cada empresa.

**Files a tocar:**
- **Nuevo:** `backend/workers/intel_pliego_dispatch.py` con tarea Celery `analizar_top_pendientes_empresa(empresa_id, max_nuevos=10)`.
- **Existente:** `backend/workers/intel_scores.py` — al final de `_run_recalc_empresa`, encolar `analizar_top_pendientes_empresa.delay(empresa_id)`.
- **Existente:** `backend/app/core/celery_app.py` — añadir beat schedule diario (o tras el cron de scores).

**Lógica de la tarea:**
```python
async def analizar_top_pendientes_empresa(empresa_id: UUID, max_nuevos: int = 10):
    # 1. Top-20 viables por score
    top = SELECT licitacion_id FROM licitacion_score_empresa
          WHERE empresa_id = :id AND descartada = false
          ORDER BY score DESC LIMIT 20

    # 2. Cuáles ya tienen análisis vigente (TTL 30 días)
    analizados = SELECT licitacion_id FROM licitacion_analisis_ia
                 WHERE licitacion_id IN :top
                   AND estado = 'completado'
                   AND procesado_at > NOW() - 30 days

    # 3. Pendientes = top - analizados
    pendientes = top - analizados  # max 20 entries

    # 4. Encola hasta max_nuevos (budget guard)
    for licitacion_id in pendientes[:max_nuevos]:
        extraccion_pliego_desde_pscp.delay(licitacion_id)
```

**Acceptance criteria:**
- Demo Bosch i Ribera: tras un recalc completo, encolar 10 análisis (los top-10 entre los top-20 que no estuvieran analizados). Día siguiente se completan los 10 restantes del buffer.
- Idempotente: si todos los top-20 están analizados, la tarea es no-op (skip).
- Logs claros: "queued=N, skipped=M (already analyzed)".

**Estimación:** 2-3 horas.

---

### Fase B3 — Señal `pliego_check` en el motor de ganabilidad

**Objetivo:** cuando hay análisis disponible, una 7ª señal pondera el score con la información del pliego. Cuando no hay análisis, la señal devuelve neutro y el peso se redistribuye.

**Files a tocar:**
- **Existente:** `backend/app/intel/scoring/composite.py` — añadir `signal_pliego_check()`. Recalibrar `WEIGHTS`:
  ```python
  WEIGHTS = {
      "competencia_esperada": 0.20,    # antes 0.25
      "concentracion_organo": 0.18,
      "encaje_tecnico":       0.15,
      "encaje_geografico":    0.08,
      "preferencias_match":   0.09,
      "baja_factible":        0.20,    # antes 0.25
      "pliego_check":         0.20,    # nuevo, redistribuido
  }
  ```
- **Existente:** `backend/app/intel/scoring/service.py` — cargar análisis IA si existe, llamar a la señal.
- **Existente:** `backend/workers/intel_scores.py` — la lógica de score ya recibe el contexto, solo añadir lectura del análisis IA cuando esté disponible.
- **Nuevo:** función `re_score_una_licitacion(empresa_id, licitacion_id)` que se llama desde el worker de extracción cuando termina, para no re-scorear las 138 viables tras cada análisis individual.

**Comportamiento de `signal_pliego_check`:**
```python
def signal_pliego_check(analisis_ia | None, empresa_context) -> SignalBreakdown:
    if analisis_ia is None or analisis_ia.estado != "completado":
        return SignalBreakdown(value=0.5, weight=0.20, dq="faltante",
                               explanation="Pliego pendiente de análisis")

    # Lee del extracted_data:
    veredicto = recomendacion_evaluator.evaluar(analisis_ia, empresa_context)

    if veredicto == "ir":         value = 1.0   # confirma encaje
    elif veredicto == "ir_con_riesgo": value = 0.5  # matices
    else:                              value = 0.05 # no_ir, descalifica
    return SignalBreakdown(value, weight=0.20, dq="completa", explanation=...)
```

**Trigger del re-score:** tras `extraccion_pliego` exitosa, encolar `re_score_una_licitacion` para todas las empresas que tengan esa licitación en su top-100 (consulta barata, `licitacion_score_empresa.licitacion_id = X`).

**Acceptance criteria:**
- Una licitación con score 85 (PSCP-only) cuyo pliego dice "exige G6 cat 4" cae a ~30-40 al re-scorear (señal pliego en mínimo + factor 0.20).
- Una licitación con score 85 + pliego confirma → mantiene 85 o sube ligeramente (señal en máximo recompone los pesos).
- Tests con análisis sintéticos en JSON.

**Estimación:** 4-6 horas.

---

### Fase B4 — UI: badge en card + filter pill + integración detalle

**Files a tocar:**
- **Existente:** `backend/app/api/v1/licitaciones.py` — devolver `pliego_estado` y `pliego_veredicto` en el response.
- **Existente:** `backend/app/schemas/licitacion.py` — añadir campos a `LicitacionRead`.
- **Existente:** `frontend/src/lib/api/licitaciones.ts` — sincronizar interface.
- **Existente:** `frontend/src/components/ui/LicitacionCard.tsx` — renderizar badge según estado.
- **Existente:** `frontend/src/components/radar/RadarFilterBar.tsx` — añadir pill "Pliego" (4 opciones: todas / analizado encaja / con matices / pendiente).
- **Existente:** `frontend/src/lib/hooks/useRadarFilters.ts` — estado `pliego_filtro`.
- **Existente:** `frontend/src/app/radar/[expediente]/page.tsx` — embeber bloque resumen del pliego (si analizado) sin necesidad de clic.

**Estados del badge en card:**
| Estado backend | Icono | Color | Tooltip |
|---|---|---|---|
| sin análisis | (sin badge) | — | "Pendiente de análisis" |
| `pendiente` cron-encolado | ○ | gris | "Análisis en cola" |
| `procesando` | spinner | gris | "Analizando…" |
| `completado` + veredicto `ir` | ✓ | tono del tier (info/success) | "Pliego confirma encaje" |
| `completado` + veredicto `ir_con_riesgo` | ⚠ | warning | "Pliego con matices" |
| `completado` + veredicto `no_ir` | ✗ | danger | "Pliego descalifica" |
| `documento_no_disponible` | ⊘ | gris | "Pliego no accesible" |
| `error` | ! | danger | "Error de análisis — reintentar" |

**Posición:** debajo del score numérico en la esquina superior derecha de la card. Tamaño pequeño (h-3 w-3), color del tier, sin texto (tooltip en hover).

**Filter pill nueva:**
```
[Pliego] [Todas ▾]   →   [Pliego] [Solo encaje ✓ ▾]
```
Opciones:
- Todas (default)
- ✓ Solo encaje (incluye solo `completado` + `ir`)
- ⚠ Con matices (`completado` + `ir_con_riesgo`)
- ✗ No aptas (`completado` + `no_ir`)
- ○ Pendientes (sin análisis o `pendiente`)

**Detalle integrado:** en `/radar/[expediente]`, debajo del bloque de ganabilidad existente, añadir bloque resumen del pliego cuando hay análisis. Reutilizar componente del `/pliegos/[expediente]` o extraer un sub-componente compartido.

**Acceptance criteria:**
- Card visible con badge correcto cada estado.
- Filtro funcional vía URL state.
- Página detalle muestra ambos bloques (ganabilidad + pliego) sin clic.
- Si pliego no analizado, botón "Analizar ahora" sigue accesible (override del cron, on-demand).

**Estimación:** 6-8 horas.

---

## 5. Coste detallado

### Por pliego típico (50 páginas, 100k tokens input)
| Concepto | Tokens | $ |
|---|---|---|
| Input pliego | 100.000 | $0.30 |
| System prompt + tool def cacheado | 3.000 | $0.001 |
| Output JSON estructurado | 3.000 | $0.045 |
| **Total** | | **~$0.35** |

### Rangos
- Pequeño 10 páginas: ~$0.10
- Medio 50 páginas: ~$0.35
- Grande 200 páginas: ~$1.30
- Máximo permitido (>500k tokens): SKIP, no se procesa

### Demo Bosch i Ribera (138 viables)
- Primera tirada top-20: 20 × $0.40 = **~$8 una vez**
- Cada día: 5-10 nuevos × $0.40 = **$2-4/día**
- Mensual una empresa: ~$60-120

### Escala 100 empresas
- Cache global → unique pliegos analizados ≈ 3× una empresa = ~600
- Mensual total: $200-400
- Per cliente: $2-4/mes (vs subscripción €300/mes → margen 99%)

### Salvaguardas
- Budget guard: max 10 nuevos/día/empresa.
- Skip pliegos >500k tokens.
- TTL 30 días → no re-procesa por capricho.

---

## 6. UI mockups

### Card antes
```
┌──────[franja color tier]──────┐
│ Título de la licitación        85 │
│ Ajuntament de Sant Cugat          │
├──────────────────────────────────┤
│ Importe         Cierra            │
│ 487.500 €       15 mayo 2026      │
│                 En 16 días        │
├──────────────────────────────────┤
│ [45212200-8] [45310000-3]         │
└──────────────────────────────────┘
```

### Card después
```
┌──────[franja color tier]──────┐
│ Título de la licitación        85 │  ← score recalculado con señal pliego
│ Ajuntament de Sant Cugat       ✓ │  ← badge nuevo, estado del pliego
├──────────────────────────────────┤
│ Importe         Cierra            │
│ 487.500 €       15 mayo 2026      │
│                 En 16 días        │
├──────────────────────────────────┤
│ [45212200-8] [45310000-3]         │
└──────────────────────────────────┘
```

### Card cuando pliego descalifica
```
┌──────[franja ROJA — antes era AZUL]──────┐
│ Título de la licitación        38 │  ← bajó de 85 a 38 al recibir el pliego
│ Departament Salut              ✗ │
├──────────────────────────────────┤
│ Importe         Cierra            │
│ 1.250.000 €     22 mayo 2026      │
├──────────────────────────────────┤
│ [45215100-8]                     │
└──────────────────────────────────┘
```

---

## 7. Cuestiones abiertas (decidir en sesión próxima)

1. **¿Empezamos por B1 (descarga PSCP) o B3 (señal en motor con análisis sintético)?**
   - B3 es más fácil de testear (no necesita scraping).
   - B1 es más urgente para el flujo end-to-end real.
   - **Propuesta:** B3 con análisis sintético hardcodeado primero (1 día), luego B1 (1 día), luego B2+B4 (1 día). Total ~3 días.

2. **¿Peso de `pliego_check` correcto a 0.20?** O empezar con 0.30 para que pliego mande más fuerte?
   - Empezar con 0.20 según spec actual.
   - Calibrar tras 50-100 análisis reales con feedback de los 3-5 pilotos catalanes.

3. **¿Cómo manejar los pliegos no descargables (~20-30%)?**
   - Opción A: estado `documento_no_disponible` + score sin penalización (peso de la señal redistribuido a las otras 6).
   - Opción B: ofrecer al usuario subir el pliego manualmente desde la card (link a `/pliegos/[expediente]?upload=true`).
   - **Propuesta:** ambas. Default A, con CTA discreto para B.

4. **¿Qué hacer con licitaciones fuera del top-20 que el usuario abre manualmente?**
   - El botón "Analizar ahora" del detalle dispara la extracción on-demand, sin pasar por el budget guard.
   - Coste: el usuario consume su quota implícita (free tier vs premium ¿?).
   - **Propuesta:** decidir con pricing en sesión de pricing posterior. Por ahora permitir on-demand sin guard.

---

## 8. Checklist de arranque para próxima sesión

```
□ Leer este spec y la sección 4 de architecture.md
□ Verificar estado actual contra Supabase:
  □ SELECT count FROM licitacion_analisis_ia (debería estar vacía)
  □ SELECT count FROM licitacion_score_empresa WHERE empresa_id = demo (debería tener 138 viables)
□ Decidir orden B1/B3 (recomendado B3 sintético → B1 → B2 → B4)
□ Branch: git checkout -b phase-2-pliego-integration
□ Implementar Fase B3 con análisis sintético
□ Test holdout: una licitación cuyo pliego "descarte" debe bajar al tier rojo
□ Implementar Fase B1
□ Test end-to-end: una licitación real → análisis → re-score → card refleja
□ Implementar Fase B2 (cron + budget guard)
□ Implementar Fase B4 (UI)
□ Recalcular scores empresa demo, verificar visualmente en /radar
□ Push + PR + merge
```

---

## 9. Out of scope para Phase 2

- Análisis de pliegos en tiempo real cuando el usuario hace upload (eso es M3 actual, sigue funcionando).
- Re-análisis automático cuando M2 cambia (la señal pliego_check es relativamente estable; M2 cambia el resto).
- Extracción de pliegos PLACSP (España completa) — Phase 3 si pivotamos fuera de Cataluña.
- Pricing tiers para análisis on-demand — sesión separada.
- Mejora del prompt del worker (los 28 propiedades pueden ampliarse, pero eso no es parte de la integración).
