# Data layer arquitectura — Motor de ganabilidad

**Estado:** spec Phase 1, pendiente de implementar
**Audiencia:** desarrolladores que vayan a tocar el pipeline o las APIs `/api/intel/*`
**Prerequisito leído:** [phase-0-data-audit.md](./phase-0-data-audit.md)

---

## 1. Objetivo del data layer

Convertir el dataset PSCP en un servicio interno que responda en <100ms a preguntas como:

- *"¿Cuál es la competencia esperada en una licitación de obra de 800k€ del Ajuntament de Girona, CPV 4521____?"*
- *"¿Qué baja media se necesita históricamente para ganar en este órgano + tipología?"*
- *"¿Es este órgano un feudo? ¿Qué empresas concentran las adjudicaciones?"*
- *"Para esta empresa con CIF X, ¿en qué órganos compite habitualmente, con qué tasa de éxito aparente?"*
- *"Score de ganabilidad de esta licitación concreta, con breakdown explicable."*

Estas respuestas alimentan transversalmente:
- **M1 Radar** → score de ganabilidad para "Top 5 ganables vs N compatibles"
- **M3 Pliegos** → contexto del órgano para enriquecer recomendación ir/no ir
- **M5 Sobre B** → perfil del órgano para adaptar la memoria, referencias citables
- **M6 Calculadora** → baja temeraria con distribución real, no fórmula genérica

---

## 2. Fuentes de datos

| Fuente | Estado | Volumen | Cobertura | Uso |
|---|---|---|---|---|
| **PSCP `ybgg-dgi6`** | Phase 1 | 1.78M total / 235k formales | Catalunya | Universo principal del modelo |
| **PSCP `8idu-wkjv`** (fase ejecución) | Phase 1.5 opt | ~5.9k | Catalunya | Modificaciones, indemnizaciones, suspensiones (señal de obras problemáticas) |
| **PDFs adjuntos** (PCAP/PPT/memorias) | Phase 1.5 (sample) | Variable | ~70-80% PCAP, <30% memorias | Enriquecimiento Sobre B + criterios pliegos |
| **PLACSP nacional** | v2 | ~10x PSCP | España | Expansión fuera de Cataluña |
| **RELIC (ya integrado)** | Producción | 26k empresas | Catalunya | Cruce con `identificacio_adjudicatari` para detectar empresas catalanas |

PSCP es la fuente única de Phase 1. Resto se incorpora cuando el ROI esté validado.

---

## 3. Schema PostgreSQL

### 3.1 Tabla principal `pscp_adjudicacion`

```sql
CREATE TABLE pscp_adjudicacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Identidad de origen
    socrata_row_id TEXT NOT NULL UNIQUE,  -- :id de Socrata, estable entre re-publishes del mismo registro
    codi_expedient TEXT NOT NULL,
    numero_lot TEXT,
    expedient_lot_key TEXT GENERATED ALWAYS AS (
        codi_expedient || '::' || COALESCE(numero_lot, '__SINGLE__')
    ) STORED,

    -- Órgano contratante (jerarquía completa)
    codi_ambit TEXT,
    nom_ambit TEXT,
    codi_departament_ens TEXT,
    nom_departament_ens TEXT,
    codi_organ TEXT NOT NULL,
    nom_organ TEXT NOT NULL,
    codi_unitat TEXT,
    nom_unitat TEXT,
    codi_dir3 TEXT,

    -- Tipo de contrato y procedimiento
    tipus_contracte TEXT,
    procediment TEXT,
    tipus_tramitacio TEXT,
    fase_publicacio TEXT,
    resultat TEXT,
    es_agregada BOOLEAN,

    -- Descripción
    denominacio TEXT,
    objecte_contracte TEXT,
    descripcio_lot TEXT,
    codi_cpv TEXT,
    codi_cpv_2 TEXT GENERATED ALWAYS AS (LEFT(codi_cpv, 2)) STORED,
    codi_cpv_4 TEXT GENERATED ALWAYS AS (LEFT(codi_cpv, 4)) STORED,

    -- Geografía
    lloc_execucio TEXT,
    codi_nuts TEXT,

    -- Importes (parseo del texto crudo de PSCP)
    valor_estimat_contracte NUMERIC(15,2),
    valor_estimat_expedient NUMERIC(15,2),
    pressupost_licitacio_sense NUMERIC(15,2),       -- a nivel lote
    pressupost_licitacio_sense_1 NUMERIC(15,2),     -- a nivel expediente
    pressupost_licitacio_amb NUMERIC(15,2),
    pressupost_licitacio_amb_1 NUMERIC(15,2),
    import_adjudicacio_sense_raw TEXT,              -- crudo con "||" si multi-lote
    import_adjudicacio_amb_iva_raw TEXT,
    import_adjudicacio_sense NUMERIC(15,2),         -- primer importe parseado
    import_adjudicacio_amb_iva NUMERIC(15,2),

    -- Baja calculada
    baja_pct NUMERIC(7,3) GENERATED ALWAYS AS (
        CASE
            WHEN pressupost_licitacio_sense > 0 AND import_adjudicacio_sense IS NOT NULL
            THEN ROUND((1 - import_adjudicacio_sense / pressupost_licitacio_sense) * 100, 3)
            ELSE NULL
        END
    ) STORED,

    -- Competencia
    ofertes_rebudes INTEGER,

    -- Fechas (todas TIMESTAMPTZ, son ISO 8601 en PSCP)
    termini_presentacio_ofertes TIMESTAMPTZ,
    data_publicacio_futura TIMESTAMPTZ,
    data_publicacio_previ TIMESTAMPTZ,
    data_publicacio_anunci TIMESTAMPTZ,
    data_publicacio_adjudicacio TIMESTAMPTZ,
    data_publicacio_formalitzacio TIMESTAMPTZ,
    data_publicacio_anul TIMESTAMPTZ,
    data_publicacio_consulta TIMESTAMPTZ,
    data_adjudicacio_contracte TIMESTAMPTZ,
    data_formalitzacio_contracte TIMESTAMPTZ,

    -- Otros
    durada_contracte TEXT,
    enllac_publicacio TEXT,
    racionalitzacio_contractacio TEXT,
    tipus_financament TEXT,

    -- Auditoría / metadatos / change detection
    raw_record JSONB NOT NULL,                      -- crudo siempre, para reprocesar sin re-fetch
    content_hash TEXT NOT NULL,                     -- sha256 sobre campos clave (ver 5.3)
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- siempre que se vuelve a ver el registro
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- SÓLO cuando content_hash cambia (cambio real)
    deleted_at TIMESTAMPTZ                          -- soft delete si desaparece de PSCP
);

CREATE INDEX idx_pscp_adj_updated ON pscp_adjudicacion (updated_at DESC);

CREATE INDEX idx_pscp_adj_organ_cpv4 ON pscp_adjudicacion (codi_organ, codi_cpv_4);
CREATE INDEX idx_pscp_adj_data_adj ON pscp_adjudicacion (data_adjudicacio_contracte DESC);
CREATE INDEX idx_pscp_adj_tipus ON pscp_adjudicacion (tipus_contracte);
CREATE INDEX idx_pscp_adj_fase ON pscp_adjudicacion (fase_publicacio);
CREATE INDEX idx_pscp_adj_expedient ON pscp_adjudicacion (codi_expedient);
CREATE UNIQUE INDEX idx_pscp_adj_expedient_lot ON pscp_adjudicacion (expedient_lot_key);
```

### 3.2 Tabla `pscp_empresa` — adjudicatarios normalizados

```sql
CREATE TABLE pscp_empresa (
    cif TEXT PRIMARY KEY,                           -- normalizado: ver 3.2.1
    cif_raw_seen JSONB DEFAULT '[]'::jsonb,         -- todas las variantes crudas vistas (auditoría)
    denominacio_canonica TEXT,                      -- la denominación más reciente vista
    nif_type CHAR(1),                               -- A, B, G, F, P, Q, S, ... derivado de cif[0]
    is_persona_fisica BOOLEAN,                      -- true si cif coincide con patrón ***xxxx**
    is_anonimizada BOOLEAN,                         -- persona física con datos protegidos
    is_extranjera BOOLEAN,                          -- empresa extranjera sin NIF español
    checksum_valid BOOLEAN,                         -- letra de control verificada

    -- Cruce con RELIC (Catalunya)
    n_registral_relic TEXT,                         -- si la encontramos en RELIC vía cruce de denominación + ubicación
    has_relic_classification BOOLEAN DEFAULT FALSE,

    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pscp_empresa_relic ON pscp_empresa (n_registral_relic) WHERE n_registral_relic IS NOT NULL;
```

### 3.2.1 Normalización agresiva de CIF — `normalize.py`

PSCP no garantiza formato estándar. Hemos visto: prefijos de país (`ES`, `PT`), espacios intermedios, guiones, mayúsculas mixtas, errores tipográficos, duplicados con caracteres ocultos. Sin normalización agresiva, una misma empresa puede aparecer como 3-4 CIFs distintos → infla diversidad, rompe detección de feudos, rompe el cruce con RELIC.

**Algoritmo `normalize_cif(raw: str) -> NormalizedCif`:**

```python
@dataclass
class NormalizedCif:
    cif: str                    # canónico, lo que va a la PK
    nif_type: str | None        # primera letra para personas jurídicas, None para físicas
    is_persona_fisica: bool
    is_anonimizada: bool
    is_extranjera: bool
    checksum_valid: bool
    raw_seen: str               # tal como vino, para auditoría

def normalize_cif(raw: str) -> NormalizedCif:
    # 1. Strip whitespace (incluye U+00A0 non-breaking, U+200B zero-width, etc.)
    s = re.sub(r"[\s ​-‏﻿]+", "", raw or "")

    # 2. Uppercase
    s = s.upper()

    # 3. Remove dots, dashes, slashes
    s = re.sub(r"[.\-/]+", "", s)

    # 4. Strip country prefix (VAT-style)
    if re.match(r"^(ES|PT|FR|DE|IT|GB|AD)[A-Z0-9]", s) and len(s) > 9:
        s = s[2:]

    # 5. Detectar persona física anonimizada: ***1234**, ***-1234-**, etc.
    if re.match(r"^\*+\d+\*+$", s):
        return NormalizedCif(
            cif=s, nif_type=None, is_persona_fisica=True,
            is_anonimizada=True, is_extranjera=False,
            checksum_valid=False, raw_seen=raw,
        )

    # 6. CIF persona jurídica española (8 dígitos + letra control, primer carácter A-W)
    if re.match(r"^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$", s):
        valid = validate_cif_checksum(s)
        return NormalizedCif(
            cif=s, nif_type=s[0], is_persona_fisica=False,
            is_anonimizada=False, is_extranjera=False,
            checksum_valid=valid, raw_seen=raw,
        )

    # 7. NIF persona física española (8 dígitos + letra)
    if re.match(r"^\d{8}[A-Z]$", s):
        valid = validate_nif_checksum(s)
        return NormalizedCif(
            cif=s, nif_type=None, is_persona_fisica=True,
            is_anonimizada=False, is_extranjera=False,
            checksum_valid=valid, raw_seen=raw,
        )

    # 8. NIE (X/Y/Z + 7 dígitos + letra)
    if re.match(r"^[XYZ]\d{7}[A-Z]$", s):
        valid = validate_nie_checksum(s)
        return NormalizedCif(
            cif=s, nif_type=None, is_persona_fisica=True,
            is_anonimizada=False, is_extranjera=False,
            checksum_valid=valid, raw_seen=raw,
        )

    # 9. Desconocido / extranjera sin formato estándar
    return NormalizedCif(
        cif=s if s else "__UNKNOWN__", nif_type=None,
        is_persona_fisica=False, is_anonimizada=False,
        is_extranjera=True, checksum_valid=False, raw_seen=raw,
    )
```

**Validadores de checksum** (`validate_cif_checksum`, `validate_nif_checksum`, `validate_nie_checksum`) implementan los algoritmos oficiales de la AEAT — son determinísticos y rápidos, ningún CIF malformado debe pasar.

**Cruce RELIC:** RELIC Socrata (`t3wj-j4pu`) NO contiene CIF (memoria conocida). El cruce se construye de dos formas:
1. **Onboarding del usuario:** la empresa aporta su `n_registral` cuando se registra en M2 → guardado en `empresas` table → cruce directo con `pscp_empresa.n_registral_relic`.
2. **Heurístico denominación + ubicación:** para empresas cuyo CIF aparece adjudicado en PSCP pero no son usuarias todavía, cruzar (denominación normalizada + localidad NUTS) contra RELIC para inferir `n_registral`. Confianza media — marcar como `inferred = true`.

**Reprocesamiento:** si `normalize_cif` evoluciona (nuevo regex, nuevo validador), una tarea Celery `pscp_renormalize_companies` itera todos los registros de `pscp_adjudicacion_empresa.denominacio_raw` + `cif_raw_seen` y re-normaliza. Idempotente.

### 3.3 Tabla `pscp_adjudicacion_empresa` — M:N para UTEs

```sql
CREATE TABLE pscp_adjudicacion_empresa (
    adjudicacion_id UUID NOT NULL REFERENCES pscp_adjudicacion(id) ON DELETE CASCADE,
    cif TEXT NOT NULL REFERENCES pscp_empresa(cif),
    posicio_ute INTEGER NOT NULL DEFAULT 0,         -- orden en la UTE; 0 si solo
    denominacio_raw TEXT,                           -- denominación tal como aparecía en este registro
    PRIMARY KEY (adjudicacion_id, cif)
);

CREATE INDEX idx_pscp_adj_emp_cif ON pscp_adjudicacion_empresa (cif);
```

**Justificación M:N:** las UTEs aparecen en PSCP como `B50819507||B58903295||B60579240` con denominaciones equivalentes separadas por `||`. Necesitamos descomponer para tracking individual de empresas (cuántas adjudicaciones gana cada una, en qué órganos), y para detectar feudos correctamente.

### 3.4 Tabla `pscp_pliego_doc` — Phase 1.5 (extracción documentos)

```sql
CREATE TABLE pscp_pliego_doc (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    adjudicacion_id UUID REFERENCES pscp_adjudicacion(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL,                         -- 'pcap' | 'ppt' | 'memoria_adj' | 'informe_mesa' | 'resolucion_adj'
    source_url TEXT,                                -- URL original en PSCP
    storage_url TEXT,                               -- R2 path tras descarga
    sha256 TEXT,                                    -- para deduplicación
    bytes_size INTEGER,
    pages_count INTEGER,
    is_scanned BOOLEAN,                             -- true si requiere OCR
    extracted_at TIMESTAMPTZ,
    extraction_model TEXT,                          -- 'claude-sonnet-4-6' etc.
    extraction_cost_usd NUMERIC(8,4),
    extracted_data JSONB,                           -- structured output (criterios puntuación, baja temeraria, etc.)
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pscp_pliego_adj ON pscp_pliego_doc (adjudicacion_id);
CREATE INDEX idx_pscp_pliego_type ON pscp_pliego_doc (doc_type);
```

### 3.5 Tabla `pscp_sync_log` — observabilidad del pipeline

```sql
CREATE TABLE pscp_sync_log (
    id BIGSERIAL PRIMARY KEY,
    sync_type TEXT NOT NULL,                        -- 'backfill' | 'incremental' | 'mview_refresh'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    records_fetched INTEGER,
    records_inserted INTEGER,
    records_updated INTEGER,
    error TEXT,
    metadata JSONB
);
```

---

## 4. Materialized views agregadas

Refresh diario tras sync incremental. Indices BTREE para lookups O(log n) desde la API.

### 4.1 `agg_competencia_organ_cpv` — competencia esperada

```sql
CREATE MATERIALIZED VIEW agg_competencia_organ_cpv AS
SELECT
    codi_organ,
    nom_organ,
    codi_cpv_4,
    tipus_contracte,
    COUNT(*) AS n_obs,
    AVG(ofertes_rebudes::numeric)::numeric(6,2) AS ofertes_avg,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ofertes_rebudes) AS ofertes_median,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ofertes_rebudes) AS ofertes_p90,
    SUM(CASE WHEN ofertes_rebudes = 1 THEN 1 ELSE 0 END)::numeric / COUNT(*) AS pct_oferta_unica,
    AVG(baja_pct)::numeric(6,2) AS baja_avg,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY baja_pct) AS baja_median,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY baja_pct) AS baja_p90,
    AVG(import_adjudicacio_sense)::numeric(15,2) AS import_avg
FROM pscp_adjudicacion
WHERE fase_publicacio IN ('Adjudicació', 'Formalització')
  AND ofertes_rebudes IS NOT NULL
  AND codi_cpv IS NOT NULL
GROUP BY codi_organ, nom_organ, codi_cpv_4, tipus_contracte;

CREATE UNIQUE INDEX idx_agg_comp_pk
    ON agg_competencia_organ_cpv (codi_organ, codi_cpv_4, tipus_contracte);
```

### 4.2 `agg_organ_perfil` — concentración + top adjudicatarios

```sql
CREATE MATERIALIZED VIEW agg_organ_perfil AS
WITH adj_emp AS (
    SELECT a.codi_organ, ae.cif, COUNT(*) AS n
    FROM pscp_adjudicacion a
    JOIN pscp_adjudicacion_empresa ae ON ae.adjudicacion_id = a.id
    WHERE a.fase_publicacio IN ('Adjudicació', 'Formalització')
      AND a.tipus_contracte = 'Obres'
    GROUP BY a.codi_organ, ae.cif
),
totals AS (
    SELECT codi_organ, SUM(n) AS total FROM adj_emp GROUP BY codi_organ
)
SELECT
    t.codi_organ,
    t.total AS n_adjudicaciones_obras,
    SUM(POWER(ae.n::numeric / t.total, 2))::numeric(6,4) AS hhi_concentracion,  -- 0 = atomizado, 1 = monopolio
    JSON_AGG(
        JSON_BUILD_OBJECT('cif', ae.cif, 'n', ae.n, 'pct', ROUND(ae.n::numeric / t.total * 100, 2))
        ORDER BY ae.n DESC
    ) FILTER (WHERE ae.n >= 2) AS top_adjudicatarios
FROM adj_emp ae
JOIN totals t USING (codi_organ)
GROUP BY t.codi_organ, t.total;

CREATE UNIQUE INDEX idx_agg_organ_pk ON agg_organ_perfil (codi_organ);
```

### 4.3 `agg_empresa_perfil` — perfil de cada empresa

```sql
CREATE MATERIALIZED VIEW agg_empresa_perfil AS
SELECT
    ae.cif,
    e.denominacio_canonica,
    COUNT(*) AS n_adjudicaciones,
    COUNT(*) FILTER (WHERE a.tipus_contracte = 'Obres') AS n_obres,
    AVG(a.baja_pct)::numeric(6,2) AS baja_avg,
    SUM(a.import_adjudicacio_sense)::numeric(15,2) AS volumen_total,
    MIN(a.data_adjudicacio_contracte) AS primera_adj,
    MAX(a.data_adjudicacio_contracte) AS ultima_adj,
    JSON_AGG(DISTINCT a.codi_organ ORDER BY a.codi_organ) FILTER (WHERE TRUE) AS organs_freq,
    JSON_AGG(DISTINCT a.codi_cpv_4 ORDER BY a.codi_cpv_4) FILTER (WHERE a.codi_cpv_4 IS NOT NULL) AS cpvs_freq
FROM pscp_adjudicacion_empresa ae
JOIN pscp_adjudicacion a ON a.id = ae.adjudicacion_id
JOIN pscp_empresa e ON e.cif = ae.cif
WHERE a.fase_publicacio IN ('Adjudicació', 'Formalització')
GROUP BY ae.cif, e.denominacio_canonica;

CREATE UNIQUE INDEX idx_agg_empresa_pk ON agg_empresa_perfil (cif);
```

### 4.4 Refresh strategy con detección de cambios reales

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY agg_competencia_organ_cpv;
REFRESH MATERIALIZED VIEW CONCURRENTLY agg_organ_perfil;
REFRESH MATERIALIZED VIEW CONCURRENTLY agg_empresa_perfil;
```

CONCURRENTLY requiere índice unique. Coste <30s para los tres en escala 5 años de Catalunya — pero el coste real no es el SQL sino el lock contention contra queries del API en horario laboral.

**Skip inteligente:** PSCP republishes sutilmente registros sin cambios reales (campos no clave, ej. nombre cosmético del órgano). Antes de refrescar, comprobar:

```sql
SELECT COUNT(*)
FROM pscp_adjudicacion
WHERE updated_at > (SELECT MAX(finished_at) FROM pscp_sync_log
                    WHERE sync_type = 'mview_refresh' AND error IS NULL);
```

- Si `count = 0` → log "no real changes since last refresh, skipping" y salir.
- Si `count > 0` → refrescar las 3 mviews y registrar en `pscp_sync_log` con `metadata.real_changes_count`.

Esto evita refresh diario gratuito cuando solo hubo re-publish cosmético, y deja métricas claras para investigar drift de PSCP.

---

## 5. Pipeline de ingestión

### 5.1 Estructura de módulos

```
backend/app/intel/
├── __init__.py
├── pscp/
│   ├── __init__.py
│   ├── client.py              # httpx wrapper a Socrata API + paginación + retries
│   ├── parsers.py             # parseo de campos PSCP (importes con ||, fechas)
│   ├── normalize.py           # normalize_cif + checksum validators + UTE explode
│   ├── hashing.py             # content_hash sobre campos clave (ver 5.3)
│   ├── upsert.py              # upsert idempotente con detección de cambio real
│   └── tasks.py               # Celery tasks (backfill, incremental, refresh, renormalize)
├── scoring/
│   ├── __init__.py
│   ├── bayesian.py            # bayesian shrinkage con fallback a celdas más amplias
│   ├── composite.py           # score compuesto + breakdown explicable
│   └── service.py             # interfaz limpia para los routers
└── api/
    ├── __init__.py
    └── routers.py             # FastAPI router /api/intel/*
```

### 5.3 `content_hash` — campos clave para detectar cambio real

```python
# backend/app/intel/pscp/hashing.py

KEY_FIELDS_FOR_HASH = (
    # Identidad
    "codi_expedient", "numero_lot",
    # Estado
    "fase_publicacio", "resultat",
    # Económicas (las que afectan al modelo)
    "import_adjudicacio_sense_raw", "pressupost_licitacio_sense",
    "pressupost_licitacio_sense_1", "valor_estimat_expedient",
    # Competencia
    "ofertes_rebudes",
    # Adjudicatario
    "identificacio_adjudicatari", "denominacio_adjudicatari",
    # Fechas estructurales
    "data_publicacio_adjudicacio", "data_publicacio_formalitzacio",
    "data_adjudicacio_contracte", "data_formalitzacio_contracte",
    # Categorías
    "tipus_contracte", "procediment", "codi_cpv", "codi_organ",
)

def compute_content_hash(record: dict) -> str:
    canonical = "|".join(
        str(record.get(f, "") or "").strip() for f in KEY_FIELDS_FOR_HASH
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

**Lógica de upsert:**
1. Calcular `new_hash = compute_content_hash(raw_record)`.
2. SELECT existing row by `socrata_row_id`.
3. Si no existe → INSERT con `updated_at = NOW()`.
4. Si existe y `existing.content_hash == new_hash` → UPDATE solo `last_seen_at = NOW()` (no toca `updated_at`).
5. Si existe y hashes difieren → UPDATE TODO + `updated_at = NOW()` + log diff a `pscp_sync_log.metadata` para auditoría.

Esto evita inflar el `updated_at` con republishes cosméticos y permite skip inteligente de las mviews (ver 4.4).

### 5.2 Tareas Celery

```python
# backend/app/intel/pscp/tasks.py

@celery_app.task
def pscp_backfill(start_date: str, end_date: str) -> dict:
    """Backfill chunked por mes. Idempotente."""

@celery_app.task
def pscp_incremental_sync() -> dict:
    """Pull desde data_publicacio_adjudicacio > last_sync. Diario."""

@celery_app.task
def pscp_refresh_mviews() -> dict:
    """Refresh CONCURRENTLY de las 3 materialized views."""

@celery_app.task
def pscp_normalize_companies(batch_size: int = 1000) -> dict:
    """Re-normaliza CIFs y resuelve denominación canónica para empresas con múltiples variantes."""
```

### 5.3 Schedule (Celery Beat)

```python
beat_schedule = {
    "pscp-incremental-sync": {
        "task": "app.intel.pscp.tasks.pscp_incremental_sync",
        "schedule": crontab(hour=4, minute=0),       # 4am, después de la actualización diaria de PSCP
    },
    "pscp-refresh-mviews": {
        "task": "app.intel.pscp.tasks.pscp_refresh_mviews",
        "schedule": crontab(hour=4, minute=30),
    },
}
```

### 5.4 Backfill plan

Estrategia: chunked por mes para evitar problemas de paginación profunda en Socrata (offset > 50k es lento).

```python
# Ejemplo de orquestación
from datetime import date
from dateutil.relativedelta import relativedelta

start = date(2020, 1, 1)
end = date.today()
cur = start
while cur < end:
    nxt = cur + relativedelta(months=1)
    pscp_backfill.delay(cur.isoformat(), nxt.isoformat())
    cur = nxt
```

Tiempo estimado: 5 años × 12 meses = 60 chunks. Con throttling 1 req/s y ~50 req/chunk en promedio = ~50 min total. Puede paralelizarse a 2-3 workers sin problemas para Socrata sin token.

---

## 6. Scoring engine

### 6.1 Modelo bayesiano de competencia esperada

Para una licitación nueva con `(codi_organ, codi_cpv_4, tipus_contracte)`:

```
posterior_mean(ofertes) =
    (n_obs * sample_mean + k * prior_mean) / (n_obs + k)
```

Donde:
- `sample_mean` = media de `ofertes_rebudes` en la celda (organ, cpv4, tipus)
- `prior_mean` = media global por (cpv4, tipus) — estabilidad cuando la celda específica es pequeña
- `k = 30` = pseudocount, calibrable. Valor alto = más conservador.

Fallback a 2 niveles si la celda específica tiene n=0:
1. Celda (organ, cpv4) sin tipus
2. Celda (cpv4, tipus) sin organ
3. Global

### 6.2 Score compuesto

5 señales normalizadas a 0-100, ponderadas, con explicabilidad:

```python
@dataclass
class GanabilidadScore:
    score: int                      # 0-100
    breakdown: dict[str, dict]      # {signal: {value, weight, contribution, explanation}}

# Señales:
# 1. competencia_esperada    weight 25%   menos competencia → más score
# 2. concentracion_organo    weight 20%   no es feudo → más score
# 3. encaje_tecnico          weight 20%   ya existente, viene de M2 + clasificación
# 4. encaje_geografico       weight 10%   distancia a NUTS habitual de la empresa
# 5. baja_factible           weight 25%   baja necesaria está dentro del margen empresa
```

Cada señal expone:
```python
{
    "value": 0.7,                   # 0-1 normalizado
    "weight": 0.25,
    "contribution": 17.5,           # value * weight * 100
    "explanation": "Competencia histórica baja: solo 2 ofertas medianas en este órgano para CPV similar",
    "data_points": {
        "n_obs": 47,
        "ofertes_median": 2,
        "ofertes_p90": 4,
        "pct_oferta_unica": 0.43,
    }
}
```

### 6.3 Margen de incertidumbre

Cuando `n_obs < 10` en la celda principal, marcar el score como **estimado** con tag visual ("baja confianza, basado en celdas más amplias"). No ocultar — el cliente debe saber qué hay detrás.

---

## 7. API contract

Todos los endpoints son GET, autenticados (cuando haya auth), respuesta JSON. Cache HTTP 5min para respuestas que no cambian con frecuencia.

```
GET /api/intel/competencia
    ?codi_organ=...&codi_cpv=...&tipus_contracte=...
→ {
    n_obs, ofertes_avg, ofertes_median, ofertes_p90,
    pct_oferta_unica, fallback_level: "exact" | "cpv4" | "global"
}

GET /api/intel/baja
    ?codi_organ=...&codi_cpv=...&tipus_contracte=...
→ {
    n_obs, baja_avg, baja_median, baja_p90, baja_temeraria_estimada
}

GET /api/intel/organ/{codi_organ}/perfil
→ {
    nom_organ, n_adjudicaciones_obras, hhi_concentracion,
    top_adjudicatarios: [{cif, denominacio, n, pct}],
    cpvs_frequents: [...], baja_tipica
}

GET /api/intel/empresa/{cif}/perfil
→ {
    denominacio, n_adjudicaciones, n_obres, baja_avg,
    organs_freq, cpvs_freq, ultima_adj
}

POST /api/intel/score-licitacion
    body: {codi_organ, codi_cpv, tipus_contracte, pressupost,
           empresa_cif, empresa_clasificacio, lloc_execucio}
→ GanabilidadScore (ver 6.2)

GET /api/intel/_health
→ {last_sync_at, records_total, mviews_fresh_at}
```

---

## 8. Integración con módulos del MVP

### 8.1 M1 Radar
Cada licitación abierta del feed PSCP se enriquece con `score-licitacion`. UI:
- **Top 5 ganables** destacado en home
- Filtro nuevo "Ganabilidad ≥ 60"
- Cada card muestra el score + breakdown clicable ("¿por qué este score?")

### 8.2 M3 Pliegos
La pantalla de análisis del pliego añade panel "Contexto del órgano":
- "Este órgano publica X licitaciones similares al año"
- "Top adjudicatarios: A (32%), B (18%), C (11%)"
- "Baja media histórica: 12% — la tuya estaría en línea"
- "Empresas tipo PYME ganan el 28% del volumen — eres competitivo"

### 8.3 M5 Sobre B
La generación de memoria recibe en su prompt:
- Perfil del órgano (qué tipos de obra ha adjudicado)
- 3-5 adjudicaciones recientes similares (denominación, CPV, importe) → para citar como referencias relevantes del mercado
- Si Phase 1.5 está activo: extractos de memorias adjudicatarias similares como in-context examples

### 8.4 M6 Calculadora
Calculadora cargada con histórico:
- Slider de baja propuesta vs distribución histórica del órgano (visualización)
- Cálculo de baja temeraria con fórmula real (no constante 10%)
- "Si ofreces 14% baja, prob. estimada de ganar: 38%"

---

## 9. Phase 1.5 — extracción documentos (opcional, decisión informada)

### 9.1 Sample plan (semana 6, post Phase 1)

Selección aleatoria estratificada de **200 expedientes** adjudicados de obra:
- 50 de Generalitat (`codi_ambit = 'GENERALITAT'`)
- 50 de Diputaciones
- 50 de Ayuntamientos grandes (>50k habitantes)
- 50 de Ayuntamientos pequeños

Para cada uno:
1. Resolver `enllac_publicacio` y crawlear página del expedient
2. Detectar PDFs disponibles: PCAP, PPT, memoria adjudicataria, informe mesa, resolución
3. Descargar a R2
4. Detectar si es escaneado (heurística: ratio texto/páginas)
5. Parsear con Claude Sonnet (cache + structured output)
6. Registrar coste real

### 9.2 Métricas de decisión — gate estricto

Tras el sample, con datos reales:

| Métrica | Umbral GO | Acción si < umbral |
|---|---|---|
| % expedientes con PCAP descargable | ≥70% | Pivotar a "extracción on-demand" |
| % expedientes con memoria adjudicataria | ≥25% | Eliminar memorias del scope, solo pliegos+resoluciones |
| **% PDFs con texto nativo (NO escaneado)** | **≥80%** | **Re-presupuestar con OCR — ver 9.2.1** |
| % éxito OCR sobre PDFs escaneados (texto utilizable) | ≥70% | NO hacer backfill OCR; sólo extracción on-demand cuando usuario pague |
| Coste medio Claude por expediente (texto nativo) | <$0.50 | Re-evaluar volumen objetivo |
| Coste medio Claude por expediente (con OCR) | <$1.50 | Re-evaluar viabilidad económica |

**Regla dura:** si **% PDFs no escaneados < 80% Y % éxito OCR < 70%**, el backfill batch NO procede. Pasamos a modelo on-demand: extracción sólo cuando un usuario abre/analiza la licitación, coste imputable al uso.

### 9.2.1 La trampa del OCR — por qué el coste sube exponencialmente

OCR no es "el mismo coste +un pelín". Es otro orden de magnitud:

| Vía | Coste por página | Velocidad | Calidad |
|---|---|---|---|
| Texto nativo (PDF con capa de texto) | ~0 (extracción libre) | Instantáneo | Perfecta |
| Tesseract local | ~0 ($) pero CPU intensivo | ~3-10s/pág | Variable, mala con escaneos malos |
| Cloud OCR (Azure/AWS Textract) | $1-3 / 1000 pág | <1s/pág | Buena con escaneos decentes |
| Claude vision (PDF como imagen) | ~$15 / 1000 pág | 5-10s/pág | Excelente, pero caro |

**Ayuntamientos pequeños son el riesgo principal** — escaneos de fotocopias de fotocopias, baja resolución, sellos manuscritos encima del texto. En esos casos:
- Tesseract devuelve basura (texto ininteligible que confunde a Claude downstream)
- Cloud OCR a veces tampoco rescata nada
- Claude vision funciona pero a $15/1000 pág × pliegos de 80 páginas = $1.20/expediente solo en OCR, antes de extracción semántica

**Mitigación:** detectar calidad de escaneo ANTES de OCR (resolución de página, ratio negro/blanco, presencia de capa de texto parcial). Si calidad <umbral, marcar el expediente como "no procesable" en `pscp_pliego_doc.error` y NO gastar tokens. Reportar % no-procesables en el dashboard de salud.

### 9.3 Backfill completo (si GO en 9.2)

15-20k expedientes de obra × coste medio realista calibrado por el sample. Estimación afinada se hace **post-sample**, no antes. Distribución en lotes de 500 expedientes con quality gate manual cada lote — abortar si % de errores >20%.

---

## 10. Coste y operativa

### 10.1 Coste recurrente (Phase 1)

| Concepto | Coste mensual estimado |
|---|---|
| Socrata API | $0 (sin token, suficiente para volumen) |
| PostgreSQL extra storage | ~$5/mes (1-2 GB con backfill 5 años) |
| Celery worker time | <1h/día → marginal sobre Railway actual |
| Materialized views | <30s/día → marginal |

**Coste fijo Phase 1: ~$5-10/mes incremental.** El motor es prácticamente gratis de operar.

### 10.2 Coste Phase 1.5 (extracción documentos)

| Concepto | Coste único | Coste mensual |
|---|---|---|
| Sample 200 expedientes (texto nativo dominante) | $50-100 | — |
| Sample 200 expedientes (con OCR fallback intensivo) | $200-400 | — |
| R2 storage | ~$1/100GB | ~$1-2/mes |
| Backfill completo si solo texto nativo (15k exp) | $5-8k | — |
| Backfill completo si requiere OCR cloud (15k exp) | $15-25k | — |
| Backfill completo si requiere Claude vision (15k exp) | $30-50k | — |
| Extracción incremental (~50/día) | — | ~$50-300/mes según OCR |

**Lectura:** la diferencia entre escenario optimista (texto nativo) y pesimista (Claude vision OCR para todo) es **6x**. Por eso el sample es bloqueante — sin él, podríamos estar firmando un cheque de $50k pensando que era $5k.

### 10.3 Monitorización

- Tabla `pscp_sync_log` consultada por endpoint `/api/intel/_health`
- Alerta Slack si `last_sync_at > 36h`
- Dashboard interno con: registros totales, % cobertura por campo crítico (mantener por encima del audit baseline), latencia de mviews

---

## 11. Plan de implementación Phase 1 (4-5 semanas)

| Semana | Entregable |
|---|---|
| 1 | Schema Alembic + módulos `app/intel/pscp/` (client, parsers, normalize, upsert) |
| 1-2 | Backfill funcional para 12 meses + validación contra audit baseline |
| 2 | Backfill completo 5 años + materialized views + refresh task |
| 3 | Scoring engine bayesiano + tests sobre holdout (predecir competencia Q1 2026 con datos hasta Q4 2025) |
| 3 | API `/api/intel/*` con OpenAPI schema |
| 4 | Integración con M1 Radar (Top 5 ganables) |
| 4 | Integración con M6 Calculadora (baja histórica) |
| 5 | Pulido + documentación + dashboard de salud + ajuste de pesos del scoring con feedback de pilotos |

Phase 1.5 (extracción documentos) opcional, decisión post-Phase 1.

---

## 12. Decisiones abiertas

1. **App token Socrata:** registrar uno gratis para evitar rate-limit en backfill paralelo. Decidir si se usa o no (recomendado: sí).
2. **OCR fallback:** decisión depende de Phase 1.5 sample. Si >20% de PDFs son escaneados, presupuestar Tesseract o servicio cloud.
3. **Empresas fuera de Catalunya:** PSCP incluye adjudicatarios catalanes Y no catalanes. Decidir si normalizamos todo en `pscp_empresa` o filtramos por NIF prefix B/A/G... catalán. Recomendación: incluir todo, marcar geografía después.
4. **Histórico pre-2020:** PSCP tiene datos de hace más años pero la calidad disminuye. Decidir profundidad del backfill. Recomendación: 2020-presente como baseline, extender si la validación pide más muestra.
