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

## Estado actual (2026-04-24)

✅ **Fase 1 completada** — MVP funcional:
- Fuente de datos: dataset `ybgg-dgi6` de la Generalitat vía API Socrata (`analisi.transparenciacatalunya.cat`), sin autenticación, actualización diaria, 54 campos por registro
- Worker Celery `workers/ingesta_pscp.py`: descarga paginada (batches de 1000), dedup por `codi_expedient`, upsert bulk en batches de 500
- ~1329 licitaciones únicas abiertas en Catalunya en cualquier momento, de las cuales ~300 son obras
- Tabla `licitaciones` con 15+ columnas + JSONB `raw_data`
- API `GET /api/v1/licitaciones` con filtros (semáforo, tipo_contrato, búsqueda, paginación)
- Endpoint `POST /api/v1/licitaciones/ingestar` para trigger manual
- Frontend `/radar` con tabs de semáforo, búsqueda, grid de cards, paginación y botón "Actualizar feed"

❌ **Nota histórica:** arrancamos apuntando al feed ATOM de la PLACSP nacional (`contrataciondelestado.es/sindicacion/...`), pero esa infraestructura fue decomisionada en la migración de 2024 y los URLs antiguos devuelven una página HTML de redirect al portal. El pivote a Socrata (Catalunya) es estratégicamente mejor porque los primeros clientes son catalanes.

⚠️ **Semáforo actual es provisional:** solo comprueba `tipo=obras AND importe <= max_solvencia`. Funciona como filtro grosero pero no aporta inteligencia real. Ver Fase 2.

⚠️ **Estética:** la página `/radar` usa el componente `LicitacionCard` existente pero la disposición del header, filtros y paginación es utilitaria. Se pulirá en la fase final de diseño junto al resto del producto.

---

## Fase 2 — Semáforo real (la "IA" del Radar IA)

Hacer que el semáforo deje de ser un filtro binario y se convierta en la capa de inteligencia que diferencia a Licitum de un feed RSS.

### 2.1 Cruce CPV ↔ clasificación ROLECE
- M3 guarda las clasificaciones activas de la empresa (grupo C, G, I…)
- Cada código CPV de una licitación se mapea a una o varias clasificaciones exigibles (tabla de mapeo CPV→ROLECE que hay que construir o heurística basada en los primeros dígitos del CPV)
- Ejemplo: CPV `45233000` (carreteras) → exige grupo G
- Si la empresa no tiene G → **rojo** (no **verde** como ahora)
- Si tiene G pero no la categoría adecuada → **amarillo**

**Trabajo concreto:**
- Crear tabla `cpv_rolece_map` (o constante Python) con las correspondencias principales
- Extender `_calcular_semaforo()` en `workers/ingesta_pscp.py`
- Recalcular semáforo de todas las filas existentes en una migración de datos

### 2.2 Categoría ROLECE por importe
- La ROLECE divide las empresas en 6 categorías según el tamaño de obra que pueden ejecutar:
  - Cat 1: ≤ 150.000€
  - Cat 2: 150.000€ – 360.000€
  - Cat 3: 360.000€ – 840.000€
  - Cat 4: 840.000€ – 2.400.000€
  - Cat 5: 2.400.000€ – 5.000.000€
  - Cat 6: > 5.000.000€
- Obra de 400.000€ → exige categoría 3 mínimo
- Si la empresa solo tiene C2 (hasta 360K€) → **amarillo**, no verde aunque tenga el grupo correcto

**Trabajo concreto:**
- Añadir función `_categoria_rolece_requerida(importe: Decimal) -> int`
- Cruzar con las categorías declaradas en M3 `clasificaciones_rolece.categoria`

### 2.3 Factor geográfico
- El dataset ya trae `lloc_execucio` (texto) y `codi_nuts` (código NUTS)
- La empresa debe poder configurar su radio operativo (ej: "Barcelona + 100km", "Cataluña entera")
- Una obra fuera del radio → **amarillo** automático aunque la clasificación encaje

**Trabajo concreto:**
- Añadir columnas `provincia_base` y `radio_km` a `empresas` (migración)
- UI en página de empresa para configurarlo
- Calcular distancia desde el centroide de la provincia (tabla de lat/lng por NUTS)

### 2.4 Factor histórico
- Si la empresa ya ejecutó obras para ese organismo (buscando en M3 `certificados_obra.organismo`) → bonus verde
- Si tiene CPV similares ya certificados → bonus verde
- Útil para diferenciar entre dos verdes: el que "puede" vs el que "probablemente gana"

**Trabajo concreto:**
- Query adicional al calcular semáforo: ¿ha trabajado antes con este `organismo`?
- Campo nuevo en `licitaciones`: `score_afinidad` (0-1) que combine CPV match + organismo match
- Frontend: ordenar por afinidad dentro de cada nivel de semáforo

### Resultado esperado de la Fase 2
El usuario deja de recibir 1.329 licitaciones y recibe **15-20 obras realmente ganables**, ordenadas por afinidad histórica. Ahí es donde Licitum empieza a justificar su precio frente a una búsqueda manual en el portal público.

---

## Fase 3 — Acciones desde el Radar

Cerrar el ciclo: pasar de "ver licitaciones" a "gestionarlas".

### 3.1 Pipeline de licitaciones
- Estados por licitación: `nueva / seguida / descartada / presentada / ganada / perdida`
- Vista kanban → el usuario ve su embudo comercial
- Métricas: tasa de éxito, baja media, tiempo medio hasta decisión

**Trabajo concreto:**
- Tabla `licitacion_empresa_estado` (multi-tenancy en el futuro)
- Endpoints `PATCH /licitaciones/{id}/estado`
- Vista `/radar/pipeline` con columnas drag-and-drop

### 3.2 Detalle con análisis IA
- Click en card → página de detalle completo
- Usar `url_json_licitacio` del Socrata para traer los metadatos enriquecidos
- Descarga automática de los pliegos desde el PSCP
- Claude resume el pliego en 3 bullets: *qué piden, criterios de adjudicación, plazo crítico*
- Botones de acción que saltan a otros módulos: "Preparar memoria" (→ M5), "Analizar presupuesto" (→ M4), "Generar DEUC" (→ M7)

**Trabajo concreto:**
- Página `/radar/[expediente]`
- Endpoint que descarga los pliegos a R2 y los procesa con Claude (reutilizar parte del worker de M3)
- Tabla `licitacion_analisis_ia` con el resumen en JSONB

### 3.3 Ingesta automática diaria
- Celery Beat configurado para lanzar `ingesta_pscp` cada mañana a las 7:00
- Detectar licitaciones nuevas desde la última ingesta
- Si hay nuevas obras verdes → email o push notification: *"3 nuevas oportunidades verdes para ti"*

**Trabajo concreto:**
- Añadir `celery_beat` como servicio separado en Railway (o usar beat embed del worker)
- Configurar `CELERY_BEAT_SCHEDULE` en `core/celery_app.py`
- Sistema de notificaciones (Resend para email, o push si hay PWA)

### 3.4 Filtros avanzados
- Por provincia (Barcelona, Girona, Tarragona, Lleida)
- Slider de rango de importe
- Slider de días hasta deadline
- Por tipo de organismo (ayuntamientos / consells / Generalitat / universidades)
- Por código CPV

**Trabajo concreto:**
- Extender el endpoint `GET /licitaciones` con los parámetros
- UI de barra de filtros colapsable en el radar
- Guardar los filtros favoritos del usuario en `empresas.filtros_radar` (JSONB)

---

## Priorización recomendada

No hacer Fase 2 y Fase 3 en secuencia estricta. Sugerencia por valor aportado:

1. **Filtros avanzados** (2h) — el usuario saca valor hoy mismo, sin tocar el semáforo
2. **Semáforo real: CPV ↔ clasificación** (medio día) — el corazón del producto
3. **Ingesta automática diaria** (1h) — que funcione solo, sin botón manual
4. **Categoría ROLECE por importe** (medio día) — afina el semáforo
5. **Factor histórico / afinidad** (medio día) — ordena dentro del verde
6. **Detalle con análisis IA** (1 día) — depende de M4/M5 avanzados
7. **Pipeline kanban** (1 día) — valioso solo cuando haya volumen de licitaciones gestionadas

---

## Dependencias
- **M3 Solvencia** — clasificaciones activas + certificados validados (ya en producción)
- Dataset `ybgg-dgi6` de la Generalitat de Catalunya (ya integrado)
- M4 BC3 y M5 Memorias para el apartado 3.2 (pendientes)

## Notas técnicas
- El modelo `Licitacion` ya tiene `raw_data` JSONB donde se guardan `lloc_execucio`, `nom_ambit`, `codi_nuts`, `numero_lot`, etc. No hace falta migración para explotar esos campos.
- El campo `url_placsp` debería renombrarse a `url_publicacio` en una iteración futura (cosmético, no bloquea nada).
- Si en algún momento queremos licitaciones de toda España y no solo Catalunya, habría que investigar los nuevos endpoints de la PLACSP nacional o añadir una segunda fuente en `workers/ingesta_placsp.py`.
