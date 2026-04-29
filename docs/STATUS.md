# Licitum — Estado del producto

**Fecha:** 2026-04-29
**Último commit en main:** `e1e9ab2`
**Resumen:** MVP catalán de licitación pública para PYMES de obra.
Phase 1 (data layer PSCP) + Phase 2 (integración pliego con motor de
ganabilidad) cerradas y validadas con datos reales. Diferencial vs
competidores ya construido. Quedan: M5 Sobre B (palanca premium), M6/M7
y pulido de M1.

---

## 1. Módulos del MVP — vista 360º

| Módulo | Estado | Notas |
|---|---|---|
| **M1 Radar** | 🟢 funcional, falta acciones por fila | Ver §2 |
| **M2 Empresa** | 🟢 funcional con consistency plan | Ver §3 + `docs/modules/M2-empresa-consistency-plan.md` |
| **M3 Pliegos** | 🟢 base + integración motor | Ver §4 (Phase 2) |
| **M4 Sobre A** | 🟡 generación DEUC + decl. responsable | `docs/modules/M4-sobre-a.md` |
| **M5 Sobre B** | 🔲 pendiente — palanca premium | `docs/modules/M5-sobre-b.md` |
| **M6 Calculadora** | 🔲 pendiente | `docs/modules/M6-calculadora.md` |
| **M7 Tracker** | 🔲 pendiente | `docs/modules/M7-tracker.md` |

Leyenda: 🟢 en producción · 🟡 base operativa con pendientes · 🔲 spec/no construido.

---

## 2. M1 — Radar

**En producción:**
- Feed PSCP Catalunya con 1300+ licitaciones abiertas, ingestado diario 07:00 Madrid (Celery Beat embedded).
- Cards con franja de tier (azul/verde/amarillo/rojo) según puntuación 0-100 del motor de ganabilidad.
- Puntuación visible top-right; badge del estado del pliego adyacente.
- Filtro por **Puntuación** (4 tiers), provincia, organismo, importe (presets ROLECE), plazo, CPV, búsqueda.
- Dropdown **Ordenar** + flecha clicable asc/desc (criterios: puntuación, plazo, importe, publicación).
- Sección colapsada de descartadas con razón citable (clasificación, solvencia, pliego dice no, etc.).
- Detalle por expediente con análisis de ganabilidad (6+1 señales con barras), botón "Analizar pliego con IA".
- Endpoint `/api/v1/licitaciones` con `order_by`, `min_score`, `max_score`, `incluye_descartadas`, `empresa_id`, `pliego_estado`, `pliego_veredicto`.

**Pendientes:**
- 🔲 Acciones por fila — Guardar (al M7), Descartar (silencia), Analizar pliego on-demand (M3 disparable)
- 🔲 Importación PSCP one-click (pegar URL → dispara M3 automático)
- 🟡 Semáforo 4 ejes (depende de M2 ampliado + M3 operativo, ambos hechos — quedan ajustes finales)

---

## 3. M2 — Empresa

**En producción (5 bloques):**
- Identidad: nombre, CIF, dirección con codigo INE provincia, datos básicos
- Solvencia: clasificaciones ROLECE (CRUD manual), RELIC (sync via Socrata por `n_registral`), certificados de obra (extracción PDF + Claude + validación humana antes de contar para solvencia)
- Recursos: personal (jefe obra, encargado, técnicos PRL/calidad/MA, ingenieros, arquitectos), maquinaria, sistemas de gestión (ISO 9001/14001/45001)
- Documentos: pólizas RC, Hacienda, SS, otros — con caducidad y semáforo de salud documental
- Preferencias: capacidad operativa, presupuesto rango, apetito UTE, estado aceptación, prioridad CPV (core/secundario/no_interesa), prioridad territorios

**Endpoint público clave:** `/empresa/resumen-solvencia` devuelve anualidad media (total importes UTE-aplicado / 5 años) + por grupo + año pico. Misma fórmula la usa el motor de ganabilidad ahora (commit `302463a`).

**Plan de consistencia:** `docs/modules/M2-empresa-consistency-plan.md` — fases 4-7 + 8.1-2 cerradas. Pendientes 1, 2.3, 3 para próxima sesión.

---

## 4. Data layer + Motor de ganabilidad

### Phase 1 — PSCP histórico (en producción)

| Métrica | Valor |
|---|---|
| `pscp_adjudicacion` | 28.082 records (rango 2020-01-02 → 2026-04-27) |
| `pscp_empresa` | 3.955 empresas adjudicatarias |
| `pscp_adjudicacion_empresa` (UTEs M:N) | 28.192 |
| Materialized views | `agg_organ_perfil`, `agg_empresa_perfil`, `agg_competencia_organ_cpv` |
| Cron diario | 04:00 UTC `incremental_sync` + 04:30 UTC `mview_refresh` |

**Spec:** `docs/data-science/architecture.md`.

### Motor de ganabilidad — 7 señales soft + 9 hard filters

**Pesos del score 0-100 (sumar 1.00):**
| Señal | Peso | Origen |
|---|---|---|
| competencia_esperada | 0.20 | PSCP `agg_competencia_organ_cpv` (bayesian shrinkage) |
| concentracion_organo | 0.18 | PSCP `agg_organ_perfil` (HHI) |
| encaje_tecnico | 0.15 | M2 ROLECE+RELIC clasificación |
| encaje_geografico | 0.08 | empresa.provincia codigo INE vs licitacion.provincias |
| preferencias_match | 0.09 | M2 prefs CPV core/secundario |
| baja_factible | 0.20 | PSCP histórico baja media + LCSP threshold + M2 margen |
| **pliego_check** (Phase 2) | **0.10** | M3 análisis IA del PCAP+PPT |

**Hard filters (descartan, score=0):**
estado_aceptacion, clasificacion, solvencia (técnica), **solvencia_economica** (Phase 2), presupuesto, capacidad, preferencia_no_interesa, documentacion_al_dia, **pliego** (Phase 2 — descarta cuando veredicto=`no_ir`).

**Persistencia:** `licitacion_score_empresa` (PK empresa+licitacion), con `breakdown_json`, `hard_filters_json`, `empresa_context_hash` para invalidación idempotente.

### Phase 2 — Integración M3 pliego (en producción)

**Spec:** `docs/data-science/phase-2-pliego-integration.md`.

| Capa | Implementación |
|---|---|
| **B1 Descarga automática** | `app/services/pscp_attachment_downloader.py` reverse-engineering del bundle Angular del portal — descubrió endpoint público `/portal-api/descarrega-document/{id}/{hash}` |
| **B1.1 PCAP+PPT** | Concatena ambos pliegos en una sola llamada Claude. Guard `MAX_PPT_BYTES=8MB` salta proyectos técnicos enormes |
| **B2 Cron top-20** | `workers/intel_pliego_dispatch.py` con buffer top-20, budget guard 10/día/empresa, TTL 30 días. Hook tras `_run_recalc_empresa` |
| **B3 Señal + hard filter** | `signal_pliego_check` (peso 0.10) + `hard_filter_pliego` cuando veredicto=`no_ir` |
| **B4 UI badge** | LicitacionRead expone `pliego_estado` + `pliego_veredicto`. Card renderiza ✓/⚠/⚪/⊘/○/! según estado |

**Coste real validado:** ~$0.30 por PCAP típico (0.74MB, 28 campos, ~30s).
**Coste mensual proyectado a escala 100 empresas:** $100-200 (cache global por licitación).

---

## 5. Stack técnico

### Backend
- FastAPI (Python 3.11+) + Pydantic v2 + SQLAlchemy 2.0 async
- PostgreSQL (Supabase) + pgvector + Redis + Celery
- 22 migraciones Alembic
- Anthropic SDK con `claude-sonnet-4-6` y prompt caching

**Workers Celery (todos en `backend/workers/`):**
- `ingesta_pscp` — descarga diaria del feed PSCP
- `intel_pscp` — backfill 5 años + sync incremental + refresh mviews
- `intel_scores` — recalc scores empresa con cron diario 07:15 Madrid
- `intel_pliego_dispatch` — encola análisis del top-20 tras recalc
- `extraccion_pliego` — descarga PCAP+PPT + Claude tool_use
- `extraccion_pdf` — Claude para certificados M2
- `recalcular_semaforos` — semáforo legacy CPV↔ROLECE
- `sync_relic` — sync RELIC vía Socrata

### Frontend
- Next.js 14 App Router + TypeScript + Tailwind + React Query
- Páginas: `/dashboard`, `/radar` + `/radar/[expediente]`, `/empresa/*`, `/pliegos/[expediente]`, `/sobre-a`, `/tracker`, `/preview` (sandbox)
- Design system: Bricolage Grotesque (display), paleta 4-tier vívida, badges sin iconos decorativos

### Despliegue
- Railway: API + worker (Celery con `--pool=solo`, Beat embedded)
- Vercel: frontend (deploy automático desde main)
- Cloudflare R2: PDFs

---

## 6. Demo / datos de prueba

**Empresa demo:** `00000000-0000-0000-0000-000000000001`
- Nombre: **Bosch i Ribera Construccions, SL** (B66789012)
- Inspirada en Calam Tapias (n_registral RELIC `NB1220972`)
- 31 clasificaciones RELIC sincronizadas (grupos A/B/C/E/G/J/K, max cat 3)
- 2 ROLECE (C-2-3 + G-6-3), 3 personal, ISO 9001+14001 vigentes
- Volumen: 1.18M / 980k / 850k €/año, plantilla 14, anualidad media 116k€

**Re-seed:** `cd backend && ./.venv/Scripts/python.exe scripts/seed_demo_empresa.py` (idempotente, ~13 min)

**Distribución de scores actual (post-pliegos analizados):**
- 4 viables (1 ✓ ir, 2 ⚠ ir_con_riesgo, 1 ! pliego fallido por OCR)
- 1239 descartadas (320 por clasificación, 145 por solvencia económica, 5 por pliego veredicto=no_ir)

---

## 7. Pendientes ordenados por prioridad

### Para cerrar M1 Radar
1. **Acciones por fila** (4-6h): Guardar (M7) / Descartar / Analizar on-demand
2. **Importación PSCP one-click** (2-3h): pegar URL → dispara `extraer_pliego_desde_pscp`

### Mejoras del motor de ganabilidad
3. **Migrar enum `EstadoAnalisisPliego`** para añadir `documento_no_disponible` nativo (hoy es prefix en error_mensaje). Cosmético, ~30 min.
4. **Persistir veredicto del pliego como columna** en `licitacion_analisis_ia` (hoy se deriva del breakdown_json en cada query). Performance, ~1h.
5. **Resolver OCR poppler missing** localmente (Railway sí lo tiene). 1 pliego del top-1 quedó fallido. ~30 min.

### Módulos siguientes del MVP
6. **M5 Sobre B** (2-3 días) — palanca premium, aprovecha todo el data layer + Phase 2
7. **M6 Calculadora** (1-2 días) — baja temeraria con histórico real PSCP
8. **M7 Tracker** (1-2 días) — pipeline kanban + relojes legales

### Validación de mercado
9. **Pilotos catalanes** — 3-5 PYMES reales para validar señales del motor con sus datos
10. **Métricas operativas** — coste mensual Claude API, latencia recalc, tasa de pliegos no descargables

---

## 8. Cómo arrancar el stack local

```
# Backend (puerto 8001 — el proxy del frontend apunta aquí)
cd backend
./.venv/Scripts/python.exe -m uvicorn app.main:app --port 8001
# NO usar --reload (watchfiles en Windows se cuelga al recargar módulos)

# Worker Celery
./.venv/Scripts/python.exe -m celery -A app.core.celery_app worker -l info -P solo
# Beat embedded en el mismo worker:
# .../celery -A app.core.celery_app worker -B -l info -P solo

# Redis (necesario para Celery)
"C:\Program Files\Redis\redis-server.exe"

# Frontend
cd frontend
npm run dev   # localhost:3000 → proxy a localhost:8001
```

Re-seed demo: `./.venv/Scripts/python.exe scripts/seed_demo_empresa.py`
Recalc scores manual: importar `_run_recalc_empresa` desde `workers.intel_scores`.
Análisis de un pliego on-demand: importar `_ejecutar_desde_pscp` desde `workers.extraccion_pliego`.

---

## 9. Spec docs detallados

| Doc | Para qué |
|---|---|
| `docs/data-science/architecture.md` | Phase 1 — data layer PSCP, schema, mviews, scoring engine |
| `docs/data-science/phase-0-data-audit.md` | Audit del dataset PSCP antes de comprometer backfill |
| `docs/data-science/phase-2-pliego-integration.md` | Phase 2 — integración M3 con el motor (B1-B4) |
| `docs/modules/M1-radar.md` | M1 — feed, semáforo, filtros, motor |
| `docs/modules/M2-empresa.md` | M2 — 5 bloques de la caja fuerte |
| `docs/modules/M2-empresa-consistency-plan.md` | M2 — plan de consistencia 8 fases |
| `docs/modules/M3-pliegos.md` | M3 — extracción IA del PCAP/PPT |
| `docs/modules/M4-sobre-a.md` | M4 — DEUC + declaración responsable |
| `docs/modules/M5-sobre-b.md` | M5 — memoria técnica (palanca premium) |
| `docs/modules/M6-calculadora.md` | M6 — oferta económica con baja real |
| `docs/modules/M7-tracker.md` | M7 — pipeline kanban + relojes legales |

---

## 10. Hallazgos técnicos relevantes

- **API pública del PSCP descubierta** (Phase 2 B1): `/portal-api/descarrega-document/{id}/{hash}` — sin auth ni token. Reverse-engineered del bundle Angular del portal `contractaciopublica.cat`.
- **Patrón anti-bucle del análisis** (Phase 2 B2): cache global per-licitación + buffer top-20 + TTL 30 días + budget guard + hard filter solo descarta = convergencia matemática garantizada en pocos días.
- **Bayesian shrinkage** sobre celdas de competencia esperada (PSCP `agg_competencia_organ_cpv`) — ver `app/intel/scoring/bayesian.py`. Resuelve el problema de celdas con n=0 ó n<5.
- **Continuidad de buckets** (`signal_competencia_esperada`, `signal_baja_factible`, `signal_encaje_geografico`): exp decay y rampas lineales en vez de saltos discretos. Resuelve los empates artificiales en el ranking.
