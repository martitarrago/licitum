# Phase 0 — Data audit para motor de ganabilidad

**Fecha:** 2026-04-28
**Objetivo:** Verificar viabilidad técnica de construir un motor de "ganabilidad" sobre datasets públicos abiertos (PSCP + PLACSP) antes de comprometer 6-8 semanas de pipeline.
**Veredicto:** ✅ **GO.** Los datos de PSCP son significativamente mejores de lo esperado. El motor es construible **solo con PSCP** para el MVP catalán.

---

## Resumen ejecutivo

| Pregunta de viabilidad | Resultado |
|---|---|
| ¿Existen los campos críticos? | ✅ Sí, todos |
| ¿Cobertura ≥80% en adjudicaciones recientes? | ✅ Todos los críticos ≥99% (excepto `procediment` 83.6%) |
| ¿Universo es suficiente? | ✅ 235k adjudicaciones formales en PSCP, ~15-20k de obra |
| ¿Calidad permite cluster por órgano + CPV? | ✅ 100% órgano, 99.6% CPV |
| ¿Calculable la baja media? | ✅ 95.1% de la muestra |
| ¿Detectable la competencia esperada? | ✅ `ofertes_rebudes` poblado al 99.96% |
| ¿Detectables feudos (adjudicatario recurrente)? | ✅ CIF al 100% (UTEs separadas por `\|\|`) |
| ¿PLACSP viable como expansión post-MVP? | ✅ ATOM/CODICE accesible, sin auth |

**Implicación para el roadmap:** PSCP solo es suficiente para arrancar. PLACSP queda para v2 (expansión fuera de Cataluña). Esto recorta el alcance del Phase 1 de ~8 semanas a ~4-5 semanas.

---

## 1. PSCP — Dataset principal `ybgg-dgi6`

**Endpoint:** `https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json`
**Sin autenticación.** Socrata SoQL (`$where`, `$group`, `$select`, paginación 1000/req).
**Actualización:** diaria.
**Total registros:** 1.784.570 a fecha 2026-04-28.

### 1.1 Distribución por fase de publicación

| Fase | Registros | Acción modelo |
|---|---:|---|
| Publicació agregada de contractes | 1.501.313 | EXCLUIR (contratos menores en bulk) |
| Formalització | 163.221 | INCLUIR — universo principal |
| Adjudicació | 72.096 | INCLUIR — adjudicado, pre-formalización |
| Anul·lació | 19.662 | INCLUIR como señal negativa |
| Anunci de licitació | 15.160 | Para Radar (no scoring histórico) |
| Resto | <30k | Marginales |

**Universo útil para el modelo:** ~235k registros formales con datos competitivos completos.

### 1.2 Distribución por procedimiento

| Procediment | Registros | Comentario |
|---|---:|---|
| Contracte menor | 1.185.958 | Mayoría sin competencia (adj. directa) |
| `<null>` | 370.110 | A investigar — gran cantidad |
| Obert | 112.967 | **Procedimiento competitivo principal** |
| Obert simplificat (3 variantes) | 83.144 | Muy relevante para PYMES |
| Negociat sense publicitat | 25.304 | Excluir del modelo competitivo |
| Restringit | 2.106 | Marginal |

### 1.3 Distribución por tipo de contrato

| Tipus contracte | Registros |
|---|---:|
| Serveis | 852.260 |
| Subministraments | 826.243 |
| **Obres** | **80.106** |
| Concessió de serveis | 3.880 |
| Resto | <15k |

**Universo de obras:** ~80k totales, de los cuales estimo ~15-20k adjudicaciones formales (~10% del total formalizado). Suficiente para clustering por órgano + tipología, ajustado para hipersegmentación CPV de 8 dígitos.

### 1.4 Cobertura de campos críticos (muestra n=5000, últimos 365 días, adjudicados)

| Campo | Cobertura | Uso en el modelo |
|---|---:|---|
| `ofertes_rebudes` | **99.96%** | Competencia esperada por órgano+CPV |
| `identificacio_adjudicatari` (CIF) | 100.00% | Detección de feudos, concentración |
| `denominacio_adjudicatari` | 100.00% | Display, deduplicación |
| `import_adjudicacio_sense` | 99.38% | Cálculo de baja |
| `import_adjudicacio_amb_iva` | 99.34% | — |
| `pressupost_licitacio_sense` | 98.86% | Cálculo de baja |
| `pressupost_licitacio_sense_1` | 99.08% | Baja a nivel expediente |
| `valor_estimat_expedient` | 100.00% | Filtro y bucketing |
| `codi_cpv` | 99.58% | Clustering por tipología |
| `nom_organ` | 100.00% | Clustering, feudos |
| `codi_organ` | 100.00% | Join estable |
| `procediment` | 83.58% | ⚠️ 17% NULL — investigar |
| `tipus_contracte` | 100.00% | Filtro obras |
| `data_publicacio_adjudicacio` | 100.00% | Series temporales |
| `data_adjudicacio_contracte` | 100.00% | — |
| `data_formalitzacio_contracte` | 34.68% | ⚠️ Bajo, usar `data_adjudicacio` como referencia |
| `resultat` | 99.18% | Adjudicado/desert/desistit |
| `lloc_execucio` + `codi_nuts` | 100.00% | Filtro geográfico |
| `tipus_identificacio_adjudicatari` | 0.00% | ⚠️ Vacío total — deducir del prefijo NIF |

### 1.5 Distribución de competencia (clave para el modelo)

Sobre 4998 adjudicaciones con `ofertes_rebudes`:

| Ofertas recibidas | Frecuencia | % |
|---:|---:|---:|
| 0 | 0 | 0.0% |
| 1 | 2.205 | **44.1%** |
| 2-3 | 1.453 | 29.1% |
| 4-5 | 694 | 13.9% |
| 6-10 | 485 | 9.7% |
| 11+ | 161 | 3.2% |

**Mediana = 2 ofertas. Media = 3.02.**

**Insight crítico para el producto:** el 44% de las adjudicaciones reciben **una sola oferta**. Esto significa que en muchos órganos la "competencia esperada" es efectivamente cero — información oro para el cliente. El score de ganabilidad puede ser literal: *"este órgano adjudica el 60% sin competencia, eres prácticamente único candidato si te presentas"*.

### 1.6 Distribución de baja (oferta vs presupuesto)

Sobre 4757 adjudicaciones con baja calculable (95.1%):

| Métrica | Valor |
|---|---:|
| Baja media | 9.42% |
| Baja mediana | 2.60% |
| P10 | 0.00% (sin baja) |
| P90 | 28.02% (zona temeraria) |

**Insight:** la mediana real es muy baja (2.6%) — la mayoría de adjudicaciones se cierran cerca del presupuesto. El P90 al 28% revela que existen subuniversos donde la competencia es feroz y la baja determinante. El modelo debe segmentar por órgano+CPV para dar bajas medias significativas, no globales.

### 1.7 Anomalías detectadas

1. **`tipus_identificacio_adjudicatari` al 0%** — campo vacío en TODA la muestra. No bloqueante: el tipo se deduce del prefijo del NIF (A=SA, B=SL, G=asociación, F=cooperativa, *** = persona física anonimizada). Reportar a soporte de transparenciacatalunya como bug.
2. **`procediment` NULL al 16%** — investigar si correlaciona con `fase_publicacio = "Publicació agregada"`. Probable.
3. **UTEs:** `identificacio_adjudicatari` viene como `B50819507||B58903295||B60579240||...` con denominaciones equivalentes. **Necesita parser dedicado** para tracking individual de empresas en UTEs (importante para "feudos").
4. **`data_formalitzacio_contracte` solo al 34.68%** — usar `data_adjudicacio_contracte` (100%) como ancla temporal del modelo.

---

## 2. PLACSP — Dataset nacional (reconocimiento)

**Endpoint:** `https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom`
**Formato:** ATOM XML con cuerpos CODICE/UBL embebidos.
**Tamaño por página:** ~4.8 MB. Paginación vía `<link rel="next">` con timestamp en URL.
**Sin autenticación.**

**Otros endpoints relevantes:**
- `sindicacion_643/` — perfiles contratantes completos (incluye adjudicaciones)
- `sindicacion_1051/PlataformasAgregadasSinMenores.atom` — plataformas autonómicas agregadas

**Coste estimado de ingesta:** historial completo de varios años requiere descargar varios cientos de archivos (~2-5 GB total comprimido). Parsing CODICE/UBL es estandarizado pero verboso. Esfuerzo estimado: 2-3 semanas adicionales.

**Decisión:** PLACSP queda **fuera del Phase 1** (MVP catalán). Se incorpora cuando Licitum expanda fuera de Cataluña.

---

## 3. Implicaciones para la arquitectura del motor

### 3.1 Schema PostgreSQL propuesto (Phase 1)

Tabla principal `pscp_adjudicacion`:
- PK: `(codi_expedient, numero_lot)` o id Socrata.
- Índices: `nom_organ`, `codi_cpv`, `data_adjudicacio_contracte`, `tipus_contracte`.
- Tabla `pscp_adjudicacion_empresa` (M:N para UTEs): `adjudicacion_id`, `cif_normalizado`, `denominacion`.
- Materialized view `agg_competencia_organ_cpv`: por (`codi_organ`, `codi_cpv` 4 dígitos), media y mediana de `ofertes_rebudes`, baja media, top adjudicatarios, n_observaciones.

### 3.2 Pipeline de ingesta

- **Backfill inicial:** 5 años de historia (~300k formalizaciones+adjudicaciones). Estimación 2-3h con paginación 1000/req + throttling.
- **Incremental diario:** Celery Beat → query `data_publicacio_adjudicacio > last_sync`. Volumen ~700-1000 nuevos registros/día.
- **Sin token de Socrata** funciona para volúmenes <10k req/día. Para backfill masivo conviene registrar app token (gratis).

### 3.3 Modelo de scoring (Phase 2)

Score compuesto bayesiano por licitación nueva:
1. **Competencia esperada** = E[ofertes_rebudes | órgano, CPV, rango_presupuesto]. Posterior bayesiano con prior global cuando hay <5 observaciones por celda.
2. **Concentración del órgano** = Herfindahl sobre adjudicatarios histórico — alto = feudo.
3. **Baja necesaria** = mediana de baja en adjudicaciones similares.
4. **Tasa de éxito de empresas similares** = % adjudicaciones ganadas por empresas con clasificación/tamaño/geografía similar (requiere RELIC join).
5. **Output:** score 0-100 + breakdown explicable: *"Competencia: 6 ofertas esperadas (alto), Feudo: no, Baja necesaria: ~12% (apretada), Empresas como tú ganan el 18% en este órgano. Score: 42/100 — no recomendado salvo capacidad libre."*

---

## 4. Recomendación

**Proceder con Phase 1 (4-5 semanas) sobre PSCP solo:**

1. **Semana 1:** Schema + backfill 5 años PSCP. Normalización CIF + UTE parser.
2. **Semana 2:** Materialized views agregadas (competencia, baja, concentración por órgano+CPV). Dashboard interno de exploración.
3. **Semana 3:** Modelo bayesiano de score por licitación. Validación contra muestra holdout (predecir competencia real de Q1 2026).
4. **Semana 4:** Integración con M1 Radar — pasar de "240 aptas" a "Top 5 ganables + 235 compatibles".
5. **Semana 5:** Pulido del breakdown explicable + ajuste de pesos con feedback de pilotos.

**Riesgos remanentes (manejables):**
- 16% de `procediment` NULL — workaround: derivar de otros campos o tratar como categoría "desconocido".
- UTEs requieren cuidado en el M:N para no inflar conteos.
- Adjudicaciones sin formalización (~30% del universo) — incluir o no según validación.

**No bloqueantes:**
- `tipus_identificacio_adjudicatari` vacío — deducir del prefijo.
- `data_formalitzacio_contracte` al 35% — usar adjudicación.

---

## 5. Archivos producidos

- `backend/scripts/data_audit/pscp_audit.py` — script de auditoría reproducible
- `backend/scripts/data_audit/data/pscp_distributions.json` — distribuciones por dimensión
- `backend/scripts/data_audit/data/pscp_sample_adjudicats.json` — muestra de 5000 adjudicaciones
- `backend/scripts/data_audit/data/pscp_coverage.json` — cobertura por campo
- `docs/data-science/phase-0-data-audit.md` — este documento

Para regenerar: `PYTHONIOENCODING=utf-8 backend/.venv/Scripts/python.exe backend/scripts/data_audit/pscp_audit.py`
