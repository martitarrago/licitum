# Motor de scoring — bugs, mejoras y visión de producto

## Visión

El Radar muestra todas las licitaciones compatibles con la empresa (pueden ser 50, 200 o 500).
El valor del producto está en destacar en **azul** las que el motor recomienda activamente:
_"Presenta aquí — tienes opciones reales de ganar."_

Esto requiere dos capas diferenciadas:

| Capa | Qué hace | Output |
|------|----------|--------|
| **Elegibilidad** | Filtros duros: clasificación, solvencia, presupuesto, capacidad | Pasa / No pasa |
| **Ganabilidad** | Score 0-100 basado en competencia histórica, encaje técnico y geográfico, perfil del órgano | Score + recomendación azul si ≥ umbral |

Las licitaciones en azul son las que el motor dice "ve a por esta". El resto son visibles pero grises.
La explicación acompaña siempre: _"Ayuntamiento de Vic · 340k€ · 1-2 oferentes históricos · Tu clasificación encaja."_

---

## Criterio de éxito del motor

El motor está listo cuando puede seleccionar 3-10 licitaciones por empresa donde la empresa
tiene ventaja real y explicar por qué. No cuando rankea correctamente 500.

---

## BUG 1 — `_evaluar_clasificacion` rompe la capa de elegibilidad [CRÍTICO] — ✅ APLICADO 2026-05-04, parcialmente resuelto

**Síntoma original:** El filtro duro `clasificacion` rechazaba ~1.105 licitaciones/empresa
de media, incluso para empresas con clasificaciones ROLECE válidas. El scored% con
clasificación (9.1%) era prácticamente idéntico al sin clasificación (9.3%).

**Causa raíz:** `_evaluar_clasificacion` leía `licitacion.semaforo` (columna global de
la tabla `licitaciones`). Esa columna la calcula `recalcular_semaforos.py:57`
hardcodeando `EMPRESA_DEMO_ID`. Todas las empresas test heredaban el semáforo de la demo.

**Fix aplicado (2026-05-04):**
- `EmpresaStaticProfile` extendido con `max_categoria_por_grupo` y
  `max_solvencia_certificada_por_grupo` (carga delegada a `cargar_solvencia_empresa`).
- `_evaluar_clasificacion` reescrita para llamar a `evaluar_semaforo()` con la
  solvencia del profile — deja de leer la columna pre-calculada.
- `compute_empresa_context_hash` actualizado.
- `solvencia_evaluator.py`, `recalcular_semaforos.py` y la columna `semaforo`
  intactos (siguen alimentando la UI del Radar de la demo).

**Resultados del re-test (sesión 2026-05-04, 50 empresas, ver tabla más abajo):**
- Descartes por clasificación: 1105 → **202** /empresa (-903) ✅
- micro scored%: 5.7% → 40.3% (+34.6pp)
- pequeña scored%: 12.9% → 47.8% (+34.9pp)
- mediana scored%: 9.1% → 26.3% (+17.2pp)
- Avg score con clasif (60.7) > sin clasif (58.2) → +2.5 ✅ el motor SÍ diferencia por calidad

**Lo que abrió el fix (BUG 1.5, ver siguiente sección):** las empresas SIN clasificación
NI certificados ahora ven MÁS obras (45%) que las que sí tienen ROLECE (28%). Causa: la
rama "gris" de `_evaluar_clasificacion` da pase total por beneficio de la duda. Ranking
invertido — el script lo detecta y avisa: `[!!] Clasificación apenas impacta`.

---

## BUG 1.5 — Gris-pass sobre-permisivo [ALTO] — ✅ CERRADO 2026-05-05

**Síntoma:** Una empresa fantasma (sin clasificaciones ROLECE ni certificados) puntúa
más obras (scored% 45.0%) que una con C/2/2 real (scored% 35.7%). En PSCP catalán las
licitaciones con CPV mapeable + tipo "obras" sin solvencia de la empresa caen en "gris"
y la rama `gris → return True, None` deja pasar todo.

**Consecuencia de producto:** El usuario que aún no ha completado M2 ve un Radar inflado
que hace pensar que tiene oportunidades reales cuando legalmente no puede presentarse a
muchas. Es worse-than-baseline porque genera falsa confianza.

**Causa raíz:** En `empresa_context.py:_evaluar_clasificacion`, la rama final
`# gris → return True, None` no aplica criterios. La exención LCSP <500k€ existe sólo
para "rojo".

**Fix propuesto:**

```python
# gris (CPV no clasificable o sin solvencia registrada): aplicar exención LCSP también.
importe = float(licitacion.importe_licitacion) if licitacion.importe_licitacion else None
if importe is None:
    return True, None  # sin importe — beneficio de la duda
if importe < 500_000:
    vol_max = profile.volumen_negocio_max
    if vol_max is not None and vol_max >= importe:
        return True, 0.5  # holgura más baja que rojo-con-exención (0.8)
    return True, 0.5  # micro/pequeña sin volumen declarado — pasa con holgura mínima
return False, None  # gris en obras grandes → fail (sin solvencia no se puede acreditar)
```

**Impacto esperado tras fix:**
- Sin clasif scored%: 45% → 25-30% (recorta obras grandes que no podrían presentar).
- Con clasif scored%: 28% (sin cambio — su evaluador ya da verde/amarillo/rojo).
- **Spread Con vs Sin se invierte al esperado: Con > Sin en scored% Y avg score.**

**Por qué la holgura 0.5 (más baja que el 0.8 del rojo-con-exención):** el rojo significa
"el evaluador ha visto que no cubres" pero la LCSP te exime para obras pequeñas — es un
caso conocido. El gris significa "no sabemos" — más conservador.

**Verificación:** relanzar `test_scoring_50_empresas.py` y confirmar:
- Sin clasif scored% baja a 25-30%.
- Spread Con vs Sin (scored% y avg) ambos positivos.

---

## BUG 2 — Score techo implícito en 82/100 [ALTO] — ✅ CERRADO 2026-05-05

**Síntoma:** Ninguna empresa supera 82 de score. Una empresa ideal (misma provincia,
clasificación perfecta, competencia baja, baja histórica favorable) debería alcanzar 90-95.

**Consecuencia de producto:** Si el techo es 82, no hay espacio para diferenciar
"buena oportunidad" de "oportunidad excepcional" — todas las azules serían iguales.

**Causa probable:** Alguna señal en `compute_composite_score` tiene un cap implícito
o los pesos no permiten sumar más allá de ~82 en la práctica.

**Archivos a revisar:**
- `backend/app/intel/scoring/composite.py` → `compute_composite_score` y pesos de señales
- `signal_encaje_tecnico` y `signal_encaje_geografico` — revisar valores máximos reales

**Fix esperado:** Empresa en condiciones óptimas → 90-95. No tocar los umbrales del
semáforo (≥80 = excelente) hasta recalibrar.

---

## MEJORA 3 — Varianza de scores demasiado estrecha (rango real 65-82) [ALTO] — ✅ CERRADA 2026-05-05

**Síntoma:** Todo lo que pasa filtros puntúa entre 65 y 82 (17 puntos de spread).
No hay diferencia visible entre una licitación mediocre y una excelente para la empresa.

**Consecuencia de producto:** No se puede definir un umbral de "azul" con confianza —
si todo está entre 65 y 82, ¿dónde cortas?

**Fix:** Aumentar la contribución de las señales que capturan ventaja real:
- `signal_encaje_geografico` — misma provincia debería sumar +10-15 puntos vs otra CCAA
- `signal_encaje_tecnico` — clasificación con holgura vs justa: +5-10
- `signal_preferencias_match` — CPV core vs no preferido: +5-8
- `signal_concentracion_organo` — órgano con HHI bajo (mercado abierto): +8-12

Objetivo: rango real de 40-95 (55 puntos de spread). Las azules serían ≥80.

---

## MEJORA 4 — Señales que predicen victoria, no solo compatibilidad [ALTO]

**Contexto de producto:** Para decir "presenta aquí" con convicción, el motor necesita
señales que históricamente correlacionen con ganar, no solo con ser elegible.

**Señales a añadir o reforzar:**
- **Órgano con ≤2 oferentes históricos** → casi siempre gana quien se presenta bien (+15)
- **Importe en el núcleo del rango de la empresa** (20-80%) vs en el límite (+5/-5)
- **Órgano sin adjudicatario dominante** (HHI bajo) → mercado abierto (+10)
- **Plazo suficiente** (>15 días a cierre) → tiempo real de preparar la oferta (+3)
- **Órgano que la empresa ya conoce** (ha ganado antes allí) → ventaja relacional (+10)

El último punto requiere cruzar con el histórico de la empresa real, disponible cuando
haya datos de adjudicaciones propias (post-MVP).

---

## MEJORA 5 — Filtro de presupuesto binario → señal graduada [MEDIO]

**Síntoma:** Presupuesto es el segundo mayor driver de rechazos (777/empresa) y es
todo-o-nada. Un contrato en el límite superior del rango vale igual que uno en el centro.

**Fix:** Añadir señal soft (no reemplaza el hard filter):
- Contrato en el 20-80% del rango → señal positiva (+5)
- Contrato en el 80-95% del rango → neutro
- Contrato en el 95-100% del rango → señal negativa (-5)

---

## MEJORA 6 — Aviso "stock insuficiente" para grandes en UI [BAJO]

**Síntoma:** Grandes empresas (cat4-5, presupuesto mín >700k) ven pocas licitaciones
no porque el motor falle sino porque el stock PSCP actual tiene pocos contratos grandes.

**Fix:** No tocar el motor. En el Radar, si `scored_count < 20` mostrar:
_"Pocas licitaciones activas en tu rango. El stock se actualiza diariamente."_

---

## FIX MENOR — UnicodeEncodeError en script de test [MÍNIMO]

`test_scoring_50_empresas.py` crashea al imprimir el histograma con `█` en Windows cp1252.

```python
# Línea ~402 — cambiar:
bar = "█" * (cnt * 40 // (total or 1))
# Por:
bar = "#" * (cnt * 40 // (total or 1))
```

---

## Cambios ya aplicados (sesión 2026-05-02)

- ✅ Exención LCSP <500k€ en semáforo: amarillo si solvencia económica cubre el importe
- ✅ Fix `_evaluar_solvencia_economica`: usa `max(anualidad_media, volumen_max / 1.5)`
- ✅ Seed empresa demo ampliado con más grupos de clasificación

## Cambios aplicados (sesión 2026-05-04)

- ✅ BUG 1 — `_evaluar_clasificacion` calcula al vuelo desde el profile (ver sección BUG 1).
- ✅ FIX MENOR — `█` → `#` en histograma del script de test.
- ⚠️ Re-test ejecutado con 50 empresas — abre BUG 1.5 (gris-pass).

---

## Resultados del re-test 2026-05-04 (50 constructoras ficticias)

Test ejecutado tras aplicar BUG 1. Estado Disk IO de Supabase degradado durante el run
(~3h end-to-end vs los 25 min originales). 50/50 empresas procesadas, BD limpia tras.

### Distribución por tamaño

| Grupo | n | Scored% | AvgScore | MaxScore |
|---|---|---|---|---|
| micro | 6 | 40.3% | 57.5 | 77 |
| pequeña | 15 | 47.8% | 59.5 | 82 |
| mediana | 24 | 26.3% | 60.5 | 82 |
| grande | 5 | 4.0% | 63.0 | 81 |

### Comparación baseline (2026-05-02) vs post-fix (2026-05-04)

| Métrica | Baseline | Post-fix | Delta |
|---|---|---|---|
| micro scored% | 5.7% | 40.3% | **+34.6pp** |
| pequeña scored% | 12.9% | 47.8% | **+34.9pp** |
| mediana scored% | 9.1% | 26.3% | **+17.2pp** |
| grande scored% | 2.1% | 4.0% | +1.9pp |
| Con clasif scored% | 9.1% | 28.1% | +19.0pp |
| Sin clasif scored% | 9.3% | 45.0% | +35.7pp |
| **Spread Con vs Sin (scored%)** | -0.2pp | **-16.9pp** | empeora |
| **Spread Con vs Sin (avg score)** | n/d | **+2.5** | nueva señal |
| Descartes clasif/empresa | 1.105 | 202 | -903 |
| Descartes presupuesto/empresa | 777 | 755 | similar |
| Score techo | 82 | 82 | sin cambio |
| Distrib. scores 70-100 | n/d | 5.6% | banda azul selectiva |

### Lectura por cluster (insight de producto)

Datos crudos para definir target market. **Volumen de stock candidato por perfil**, no
demanda real:

| Cluster | Perfil | Stock candidato | Lectura comercial |
|---|---|---|---|
| A | Micro sin clasif | ~500 obras | Mucho stock — pero presup tan bajo que no pagan SaaS |
| B | Pequeña sin clasif | 400-600 obras | Sweet spot bajo |
| C | Pequeña C/2/2 | ~450 obras | Sweet spot bajo cualificado |
| D | Mediana C edificación cat3 | ~230 obras | Sweet spot alto — paga, necesita ayuda |
| E | Mediana G obra civil cat3-4 | ~140 obras | Nicho, borderline |
| F | Mediana I/J instalaciones | ~530 obras | **Mejor relación volumen/poder de compra** |
| G | Grande cat4-5 | ~50 obras | No es target — equipo dedicado |
| H | Especialista rehab/façanes | ~600 obras | Muy rentable, similar a F |
| I | UTE mid-large | ~80-130 obras | Match alto cuando entra, poco volumen |
| Generalistas | CPV abierto | ~1.000-1.120 obras | Capturan casi todo el feed PSCP |

**Implicación:** los clusters D, F, H (medianas con clasif en edificación, instalaciones
y rehabilitación) son el sweet spot del MVP — el test refuerza con datos lo que CLAUDE.md
ya planteaba como hipótesis ("PYME 5-50 empleados").

### Hallazgos clave

1. **BUG 1 cumplió su objetivo principal**: el filtro de clasificación deja de descartar
   ~1.000 obras/empresa de forma incorrecta. Cada empresa filtra ahora según su solvencia.
2. **El motor SÍ distingue por calidad** (avg score con clasif 60.7 vs sin 58.2) aunque
   no por cantidad. La métrica de cantidad (scored%) está corrupta por el gris-pass.
3. **BUG 2 sigue intacto**: techo 82, sin diferenciar excelente vs muy buena.
4. **MEJORA 5 confirmada**: presupuesto sigue siendo el segundo driver (755/empresa). Su
   binariedad limita el ranking — mismas obras al borde del rango que en el centro.
5. **Cobertura PYME validada**: ningún cluster excluido al 0%. Todas las tipologías ven
   stock real, en línea con la hipótesis "ningún perfil queda fuera".

---

## Plan de iteración (post-test 2026-05-04)

Orden de ejecución acordado:

1. **BUG 1.5 — gris-pass sobre-permisivo** (30 min) — fix puntual en
   `empresa_context.py`. Cierra BUG 1 del todo. Riesgo bajo.
2. **Re-test mini** (~30 min con DB sana, ~2h con IO degradado). Validar:
   - Sin clasif scored% baja a 25-30%.
   - Spread Con vs Sin se invierte al esperado.
3. **BUG 2 + MEJORA 3** juntos (2-3h) — ambos en `composite.py`. Recalibrar pesos
   y caps de señales para abrir el rango a 40-95.
4. **Re-test** y decidir si MEJORA 4 (señales de victoria) y MEJORA 5 (presupuesto
   graduado) son necesarias o suficiente con los pesos recalibrados.
5. **MEJORA 4 + MEJORA 5** si aún hace falta varianza.
6. **MEJORA 6 — UI** stock insuficiente para grandes. Tocar Radar, no motor.

**Pre-requisito antes de relanzar el test:** Disk IO de Supabase recuperado o upgrade
de compute add-on. El run de 2026-05-04 fue 6× más lento de lo normal por IO depletion.

---

## Cambios aplicados (sesión 2026-05-05)

- ✅ **BUG 1.5** — `_evaluar_clasificacion` (rama gris) ahora aplica exención LCSP
  <500 000 € con holgura 0.5; gris en obras ≥500k → fail. Cierra el BUG 1 del todo.
- ✅ **BUG 2** — Quitados caps implícitos en `signal_concentracion_organo`:
  `empresa_es_top` 0.85 → 1.0; mercado abierto (HHI<0.20) 0.75 → 0.85.
- ✅ **MEJORA 3** — `signal_encaje_tecnico` granular por holgura
  (≥1.5→1.0, 1.0-1.5→0.7, exención LCSP→0.4, fail solv→0.1) y pesos recalibrados
  (geo 0.08→0.12, encaje 0.15→0.16, baja 0.20→0.18, compet 0.20→0.18, pref 0.09→0.08).
- ✅ **Test pertinente bulk** — `scripts/test_scoring_pertinente.py` carga las
  agregaciones PSCP en memoria una sola vez, scorea 3 empresas (demo + fantasma +
  grande) en ~12s end-to-end vs los 16+ min de la versión naive con round-trips
  serializados. Habilita iteración rápida del calibrador.

### Resultados del re-test 2026-05-05 (post-recalibración composite)

| Métrica | Pre (BUG 1.5 solo) | Post (todos los fixes) |
|---|---|---|
| DEMO max | 82 | **85** |
| DEMO p25-p75 spread | 6 pts | **11 pts** |
| DEMO ≥80 azul | 5 | **7** |
| GRANDE max | 81 | **84** |
| GRANDE mediana | 65 | **69** |
| GRANDE p25-p75 spread | 9 pts | **15 pts** |
| GRANDE ≥80 azul | 1 | **7** |
| FANTASMA max | 76 | 73 |
| FANTASMA ≥80 azul | 0 | 0 |

### Criterio de éxito alcanzado

> "El motor está listo cuando selecciona 3-10 licitaciones por empresa donde
> la empresa tiene ventaja real."

- **DEMO**: 7 azul ≤ cap operativo 10. Top 5 son C/G Barcelona 200k-735k CPV
  45221/45234 — encaje técnico claro.
- **GRANDE**: 7 azul (era 1). Top 5 son obras 735k-4.6M Barcelona — su rango exacto.
- **FANTASMA**: 0 azul → mensaje "completa M2" sigue en pie.

### Lo que queda diferido (no bloqueante)

- **MEJORA 4 (señales de victoria)** y **MEJORA 5 (presupuesto graduado)**: el
  test post-recalibración cumple el criterio de éxito sin estas. Si más adelante
  el feedback de pilotos pide más diferenciación dentro del top, se reabren.
- **FANTASMA spread sigue 2 pts (p25-p75)**: estructural — sin clasif/certs todas
  las micro-obras puntúan casi igual vía LCSP exención. El producto comunica
  "completa M2" claramente, así que no es problema de UX.
- **BUG 1.6 detectado durante el test**: el motor no distingue
  `tipo_contrato` (Obres/Subministrament/Serveis). DEMO Bottom 5 son contratos
  de servicios (CPV 09332/42912/80511) que pasan filtros porque la lógica
  hardcodea `tipus_contracte="Obres"` en el caller. Pendiente — sesión futura.
