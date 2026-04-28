# M2 — Empresa (perfil único que alimenta match + Sobres)

## Propósito

M2 es el **archivo único** del que tira Licitum cuando:

1. **Filtra y rankea licitaciones** en el motor de match (Top 5 ganables vs N compatibles).
2. **Genera el Sobre A** (DEUC, declaración responsable, compromiso UTE).
3. **Redacta el Sobre B** (memoria técnica con personal, maquinaria, obras de referencia, sistemas de gestión).
4. **Firma el Sobre C** (cabecera de oferta económica).

La regla que decide si un dato entra o no: **¿alimenta el match o alguno de los tres sobres?** Si la respuesta es no, fuera.

## Por qué importa más de lo que parece

- **Match malo = dolor cliente.** Si volumen, clasificación, capacidad simultánea o preferencias están vacíos o mal, el motor recomienda licitaciones que la empresa no puede o no quiere ejecutar. Pierde confianza inmediatamente.
- **Sobre A incompleto = oferta inválida.** Sin representante legal con cargo + datos del poder, el DEUC no se puede firmar.
- **Sobre B genérico = pricing premium imposible.** El killer feature del producto es generar memoria técnica adaptada al pliego usando personal + maquinaria + obras propias. Sin esos datos, la IA escupe boilerplate.
- **10 días post-adjudicación.** Si Hacienda/SS/pólizas están caducados, la empresa pierde la obra ya ganada con penalización del 3% del presupuesto base (LCSP). M2 al día = obra ganada se queda ganada.

---

## Matriz cruzada — qué dato sirve a qué uso

Esta tabla es la fuente de verdad. Antes de añadir un campo a M2, debe encajar en alguna columna útil.

| Dato | Match | Sobre A | Sobre B | Sobre C |
|---|:-:|:-:|:-:|:-:|
| Razón social, CIF, email, teléfono, dirección | – | ✓ | cabecera | cabecera |
| IAE + CNAE | – | DEUC | – | – |
| Tamaño PYME | filtro reservados | DEUC II.A | – | – |
| Representante + cargo + datos del poder | – | DEUC II.B + firma | firma | firma |
| CCC Seguridad Social | – | algunos pliegos | – | – |
| Volumen negocio últimos 3 ejercicios | **filtro hard** | DEUC IV.B.1a | – | – |
| Plantilla media | filtro suave | si solv. téc. lo pide | recursos humanos | – |
| Certificados de obra | **core** — anualidad media + CPVs + territorios | relación obras IV.C.1a | obras de referencia narradas | – |
| Clasificación ROLECE + RELIC | **filtro hard** | atajo solvencia | – | – |
| Hacienda + SS + pólizas vigentes | – | declaración + post-adj. | – | – |
| Personal técnico (jefes obra, técnicos PRL…) | match suave | – | **core** | – |
| Maquinaria propia/vinculada | match suave | – | **core** | – |
| Sistemas de gestión (ISOs + planes propios) | match suave | si solv. téc. lo pide | memoria | – |
| Capacidad operativa simultánea | **filtro hard** | – | disponibilidad | – |
| Preferencias (territorio, CPV, presupuesto, UTE) | **ranking** | – | – | – |

Tres tipos de dato:
- **Filtros hard** (binarios) — si fallan, fuera del match
- **Match suave** (ranking) — empujan score arriba o abajo
- **Generación de sobre** — alimentan la redacción IA

---

## Estructura del módulo — 5 pestañas

```
empresa/
├── identidad        → Sobre A (quién firma)
├── solvencia        → Sobre A + filtro hard del match
├── recursos         → Sobre B + match suave           [NUEVO]
├── documentación    → vivo, lo que caduca y tira la obra
└── preferencias     → ranking del match               [NUEVO]
```

Cada pestaña responde a una pregunta única del usuario. Si una pestaña responde a dos preguntas distintas, mal partido.

### 1. Identidad — *quién firma*

- **Identificación:** razón social, CIF, email, teléfono, IAE, CNAE, tamaño PYME
- **Dirección fiscal:** calle, CP, ciudad, provincia (país siempre ES en el MVP)
- **Representante legal:** nombre, NIF, cargo
- **Datos del poder** (NUEVO): notario otorgante, fecha de escritura, número de protocolo, registro mercantil donde se inscribió. Sin esto, el DEUC sale incompleto.
- **CCC Seguridad Social** (NUEVO): código de cuenta de cotización principal. Algunos pliegos lo piden.

### 2. Solvencia — *qué he hecho y cuánto facturo*

- **Solvencia económica declarada:** volumen de negocio últimos 3 ejercicios. Editable. Tooltip: *"esto NO se calcula con tus certificados de obra; es la facturación total de cuentas anuales"*. Botón futuro **autocompletar desde CIF (Insight View)**.
- **Solvencia técnica calculada** (NUEVO en UI, ya hay endpoint): KPI grande con `anualidad_media` derivada de los certificados, desglose por grupo ROLECE, mejor año, total obras. Cuando exista M3 (analizador pliegos), cruzar contra exigencia del PCAP.
- **Clasificación oficial:**
  - ROLECE manual (ya implementado)
  - RELIC sincronizado (ya implementado, sync diario por `n_registral`)
- **Certificados de obra** (ya implementado): listado con filtros, IA de extracción, entrada manual, marca de obras de referencia destacadas.

### 3. Recursos — *qué llevo a la obra*  [NUEVO]

Sin esta pestaña, el Sobre B se redacta a mano. Es la pieza que habilita el killer feature.

#### 3.1 Personal técnico

```
personal_empresa
  id, empresa_id, nombre_completo, dni
  rol enum (jefe_obra, encargado, tecnico_prl, tecnico_calidad,
            tecnico_ma, ingeniero, arquitecto, otros)
  titulacion varchar
  anios_experiencia int
  cv_pdf_url varchar opcional
  certificados_formacion jsonb     -- "PRL 60h", "recurso preventivo", etc.
  obras_participadas uuid[]        -- FK a certificados_obra
  activo bool
  + TimestampMixin + SoftDeleteMixin
```

UI: tabla con CRUD, modal de alta. Worker IA opcional para extraer titulación + años + cursos desde CV en PDF (reusa pipeline `workers/extraccion_pdf.py`).

#### 3.2 Maquinaria

```
maquinaria_empresa
  id, empresa_id, tipo, marca, modelo, anio
  matricula varchar opcional
  propiedad enum (propia, leasing, alquiler_largo_plazo)
  itv_caducidad date opcional
  notas text opcional
  + TimestampMixin + SoftDeleteMixin
```

UI: tabla simple con CRUD. Sin IA (el inventario lo escribe el cliente, está en su contabilidad).

#### 3.3 Sistemas de gestión

```
sistemas_gestion_empresa
  id, empresa_id
  tipo enum (iso_9001, iso_14001, iso_45001, ehs_propio,
             plan_calidad_propio, plan_ma_propio, plan_seguridad_propio,
             cae_construccion, otros)
  pdf_url varchar opcional
  fecha_emision date opcional
  fecha_caducidad date opcional        -- ISOs caducan, planes propios no
  entidad_certificadora varchar
  alcance text
  + TimestampMixin + SoftDeleteMixin
```

Convive con `documentos_empresa` pero es entidad separada porque el Sobre B necesita *describir* el sistema (alcance, certificadora) además de presentarlo. Si se acabara fusionando, mejor en v2.

#### 3.4 Obras de referencia narradas

No es tabla nueva. Reutiliza `certificados_obra` añadiendo dos columnas:

```
ALTER TABLE certificados_obra ADD COLUMN destacado_sobre_b BOOLEAN DEFAULT FALSE;
ALTER TABLE certificados_obra ADD COLUMN narrativa TEXT;  -- 200-500 palabras
```

UI: en `/empresa/recursos` un bloque "Obras de referencia destacadas" muestra los certificados con `destacado_sobre_b = true`. Botón "redactar narrativa" abre editor con prompt asistido (qué hiciste / retos / equipo / resultados / fotos opcionales).

#### 3.5 Subcontratistas habituales (opcional, post-pilotos)

Lo bloqueamos hasta validar. Si los pilotos lo piden, se añade.

### 4. Documentación — *vivo, lo que caduca*

Ya implementada. La dejamos como está, con la salvedad de que las pestañas anteriores (`certificados`, `clasificaciones`, `relic`) se mueven a `solvencia`.

- Hacienda al corriente
- SS al corriente
- Pólizas RC + Todo Riesgo
- ISOs + REA + TC2 (opcionales según pliego)
- Semáforo de salud documental + countdown
- Avisos M7 cuando una licitación entra en `documentación_previa`

### 5. Preferencias — *qué me interesa*  [NUEVO]

Esto **no se deduce** de los certificados ni de RELIC. Es metadata declarativa que el motor de match usa para rankear (no para filtrar).

```
empresa_preferencias                                 -- 1:1 con empresas
  empresa_id uuid PK FK
  obras_simultaneas_max smallint                     -- techo histórico (ej. 4)
  obras_simultaneas_actual smallint                  -- vivo (ej. 2)
  presupuesto_min_interes numeric(14,2)              -- por debajo no me interesa
  presupuesto_max_interes numeric(14,2)              -- por encima no me cabe (ni en UTE)
  apetito_ute boolean default false
  estado_aceptacion enum (acepta, selectivo, no_acepta) default 'acepta'
  notas text

empresa_preferencias_territorio                      -- N por empresa
  empresa_id uuid FK
  comarca_codigo varchar(16) opcional                -- INE comarca (Catalunya)
  provincia_codigo varchar(2) opcional               -- INE provincia (resto España)
  prioridad enum (preferida, ok, evitar)
  PRIMARY KEY (empresa_id, COALESCE(comarca_codigo, provincia_codigo))

empresa_preferencias_cpv                             -- N por empresa
  empresa_id uuid FK
  cpv_division varchar(2)                            -- 2 dígitos (CPV division)
  prioridad enum (core, secundario, no_interesa)
  PRIMARY KEY (empresa_id, cpv_division)
```

UI: 5 preguntas en wizard de onboarding + página editable después.
1. ¿Cuántas obras llevas en paralelo como máximo?
2. ¿Cuántas tienes ahora mismo?
3. ¿Presupuesto mínimo y máximo que te interesa por obra?
4. ¿En qué comarcas/provincias quieres trabajar (preferidas/ok/evitar)?
5. ¿Qué tipos de obra (CPV) son tu core, secundario, no interesa?
6. ¿Aceptas UTE?
7. Estado actual: ¿abierto a propuestas, selectivo, no aceptas nada nuevo?

**Importante para el match.** El estado de aceptación es un toggle en la home — un cliente que cierra trimestre puede ponerlo en "selectivo" sin tocar el resto del perfil.

---

## Cruce con el data layer PSCP — perfil derivado automático

El data layer (Phase 1, ver `docs/data-science/architecture.md`) construye `agg_empresa_perfil`, una materialized view que agrega para cada CIF las adjudicaciones históricas en Catalunya:

```sql
agg_empresa_perfil:
  cif, denominacio_canonica
  n_adjudicaciones, n_obres
  baja_avg                     -- estilo de ofertar de la empresa
  volumen_total                -- facturado al sector público
  organs_freq                  -- órganos donde ha ganado
  cpvs_freq                    -- CPVs trabajados oficialmente
  primera_adj, ultima_adj
```

**Qué significa para M2:** cuando una empresa se registra en Licitum con su CIF, el sistema cruza automáticamente contra `pscp_empresa.cif`. Si hay match, **el perfil se enriquece sin pedir nada al cliente**:

- Ya sabemos en qué órganos compite (sin que lo declare en preferencias)
- Ya sabemos su baja típica (entrada al M6 Calculadora)
- Ya sabemos sus CPVs reales (no los que cree que son)
- Ya sabemos su volumen adjudicado al sector público (≠ volumen total declarado)

Implementación M2:
- Añadir endpoint `GET /api/v1/empresa/{empresa_id}/perfil-pscp` que cruza por CIF y devuelve el `agg_empresa_perfil` correspondiente, o `null` si no hay histórico.
- En la UI de Solvencia, panel "Tu histórico en Catalunya" con KPIs derivados + lista de últimas 5 adjudicaciones.
- En Recursos > Obras de referencia, **proponer al cliente importar como certificado** las obras adjudicadas que aparecen en PSCP pero no tiene en M2 (con preview de denominación + órgano + importe).

Esto evita que el cliente teclee 50 obras a mano si ya están en PSCP.

---

## Onboarding (cuando exista auth real)

4 pasos, ~30-45 min para una empresa con RELIC, ~60 min sin.

| Paso | Acción | Datos que entran | Tiempo |
|---|---|---|---|
| 1 | CIF → Insight View (cuando se integre) | identidad + dirección + administradores + volumen | 2 min |
| 2 | Nº registral RELIC → Socrata sync | clasificaciones oficiales | 1 min |
| 3 | Drag & drop ZIP de PDFs (certificados obra + Hacienda + SS + pólizas + CVs personal) | extracción IA en paralelo | 15-30 min revisión |
| 4 | Wizard preferencias (7 preguntas) | match metadata | 5 min |

El paso 3 es el cuello de botella. Mientras se procesa, el cliente puede pasar al 4. Al volver al 3, revisa con UX de revisor (ya existe para certificados, replicar para personal y documentos administrativos).

**Cruce automático con PSCP** ocurre en background tras el paso 1, sin acción del cliente. Cuando termina el onboarding, ya hay perfil enriquecido para el match.

---

## Estado actual

### En producción ✅

- Backend: Railway (API + worker Celery)
- Frontend: Vercel (`/empresa/*`)
- Modelos: `empresas`, `certificados_obra`, `clasificaciones_rolece`, `empresas_relic`, `clasificaciones_relic`, `documentos_empresa`
- Migraciones: `0001` a `0017`
- Empresa demo: `id=00000000-0000-0000-0000-000000000001`

#### Endpoints implementados

```
/api/v1/empresa/certificados/*              CRUD + IA + resumen-solvencia
/api/v1/empresa/clasificaciones/*           CRUD ROLECE manual
/api/v1/empresa/relic/*                     sync RELIC + read-only de clasificaciones
/api/v1/empresa/documentos/*                CRUD + resumen-salud
/api/v1/empresa                             GET/PATCH datos básicos
```

#### Páginas frontend

```
/empresa/perfil          → datos identificativos + dirección + representante + volumen
/empresa/certificados    → listado + revisor + entrada manual
/empresa/clasificaciones → CRUD ROLECE
/empresa/relic           → sync + listado
/empresa/documentos      → CRUD + semáforo
```

### Cambios estructurales pendientes con esta redacción

1. **Reorganizar a 5 pestañas:**
   - `/empresa/perfil` → renombrar a `/empresa/identidad`
   - `/empresa/clasificaciones` + `/empresa/relic` + `/empresa/certificados` → fusionar bajo `/empresa/solvencia` con sub-secciones
   - Crear `/empresa/recursos` (stub, luego personal + maquinaria + sistemas + obras destacadas)
   - `/empresa/documentos` → renombrar a `/empresa/documentacion`
   - Crear `/empresa/preferencias` (stub, luego wizard + edición)

2. **Modelos nuevos** (migración `0018_empresa_recursos_preferencias`):
   - `personal_empresa`
   - `maquinaria_empresa`
   - `sistemas_gestion_empresa`
   - `empresa_preferencias` (1:1 con `empresas`)
   - `empresa_preferencias_territorio` (N:1)
   - `empresa_preferencias_cpv` (N:1)
   - Añadir a `certificados_obra`: `destacado_sobre_b BOOLEAN`, `narrativa TEXT`

3. **Endpoints CRUD nuevos:**
   - `/api/v1/empresa/personal/*`
   - `/api/v1/empresa/maquinaria/*`
   - `/api/v1/empresa/sistemas-gestion/*`
   - `/api/v1/empresa/preferencias` (compuesto: GET/PATCH del bloque + listas anidadas)
   - `/api/v1/empresa/{id}/perfil-pscp` (read-only, cruce con `agg_empresa_perfil`)

4. **Datos del poder y CCC en `empresas`:**
   ```
   poder_notario varchar(255)
   poder_fecha_escritura date
   poder_protocolo varchar(64)
   poder_registro_mercantil varchar(255)
   ccc_seguridad_social varchar(32)
   ```

---

## Roadmap por sprints

| Sprint | Bloque | Justificación |
|---|---|---|
| 1 | Migración `0018` + reorganización a 5 pestañas + endpoints CRUD nuevos | scaffolding sin lógica IA — desbloquea todo lo demás |
| 2 | KPI calculado de solvencia técnica visible en pestaña Solvencia + cruce con `agg_empresa_perfil` | aprovecha lo que ya existe en backend |
| 3 | Wizard de preferencias (UX) + matching engine que las consume | sin esto el match es incompleto |
| 4 | Personal técnico (CRUD + IA extracción CV) + Maquinaria (CRUD) + Sistemas (CRUD) | habilita Sobre B (M5) |
| 5 | Datos del poder + CCC + Insight View autocompletar | completa Sobre A |
| 6 | (opcional) Worker IA para fechas en documentos administrativos | nice to have, post-pilotos |

**Bloqueo de pilotos antes del sprint 4:** mostrar a 3-5 PYMEs catalanas un Sobre B mock generado con perfil sintético y validar si justifican rellenar Personal + Maquinaria. Si no, repensamos granularidad antes de construir.

---

## Reglas de implementación

- **Todo soft delete** con `deleted_at`. Las altas/bajas de personal y maquinaria son frecuentes.
- **CRUD asíncrono** con `AsyncSession` y patrón de los endpoints existentes (`/empresa/documentos` como referencia).
- **Pydantic v2** con `from_attributes=True` y `model_config`.
- **No mockear el cruce con `agg_empresa_perfil`** — si todavía no hay datos, devolver `null` y dejar que el frontend pinte estado vacío. Lo peor sería sembrar fake data que después haya que limpiar.
- **No tocar el endpoint `/empresa/certificados/resumen-solvencia`** — funciona y es la base del KPI calculado. Solo lo reusamos desde la nueva UI.
- **Workers IA opcionales** (extracción de CV, extracción de fechas en docs administrativos) **no entran en el sprint 1**. Primero scaffold, luego IA.

---

## Decisiones cerradas

- Pestañas son **5**, no 3. Cada una con propósito único, no overlap.
- **Subcontratistas habituales** queda fuera del MVP, valida con pilotos.
- **Plantilla media** y **país de dirección** se quedan en el modelo (los pliegos los piden) pero el form esconde país (hardcode ES) y plantilla pasa a ser opcional con tooltip "solo si el pliego lo exige".
- **Datos del poder** entran al MVP — sin ellos el DEUC no se firma.
- **CCC SS** entra al MVP — ahorra una vuelta cuando un pliego lo pide.
- **Insight View** queda **post-pilotos**: bonito pero coste por consulta y no bloqueante.

## Decisiones abiertas

1. ¿`sistemas_gestion_empresa` se fusiona con `documentos_empresa` (mismo concepto: PDF + caducidad + tipo) o queda separado por tener `alcance` y `entidad_certificadora` propios? **Decisión actual: separado** (más datos descriptivos para Sobre B), revisar en v2.
2. ¿`preferencias_territorio` usa comarca INE (Catalunya) o NUTS3? **Decisión actual: comarca + provincia, doble llave nullable** — acomoda Catalunya y resto España.
3. ¿Cruce con `agg_empresa_perfil` se hace por CIF o por nombre+localidad cuando el CIF no aparece en PSCP? Phase 1 solo CIF; nombre+localidad post-piloto.
