# M6 — Tracker (pipeline operativo)

## Propósito
Es el **home del producto**. La pantalla que el cliente abre cada mañana. Vista kanban con el estado de cada licitación a través de **todos** los momentos del ciclo público — incluyendo los que tienen **reloj legal corriendo** y donde una PYME pierde obras ya ganadas por papeleo.

Estados con plazo legal (en rojo):
- **Subsanación Sobre A** — 3 días hábiles para responder un requerimiento de la mesa
- **Documentación previa adjudicación** — 10 días hábiles tras adjudicación provisional para presentar Hacienda + SS + pólizas + garantía definitiva. Si no se cumple, pierdes la obra **y** te penalizan con el 3% del presupuesto base (LCSP art. 150)

Esto es lo que diferencia a Licitum de un buscador de licitaciones: el Tracker te avisa cuando hay un reloj corriendo, no solo cuando hay una oportunidad nueva.

## Estado — base ✅ MVP funcional

Construido en el sprint del 2026-04-27:
- Migración 0013 con tabla `licitacion_estado_empresa` (UUID PK + `UniqueConstraint(empresa_id, licitacion_id)`, índices en `empresa_id`, `estado` y `deadline_actual`)
- Modelo SQLAlchemy + schemas Pydantic con `EstadoTracker` Literal de 10 valores
- Auto-deadline al transicionar a estados con reloj legal: `en_subsanacion` → +5 días calendar (~3 hábiles), `documentacion_previa` → +14 días calendar (~10 hábiles); el usuario puede sobreescribir
- 5 endpoints `/api/v1/tracker/*`: GET/PUT/DELETE `estado`, GET feed con filtros, GET `resumen` agregado
- Optimización clave (heredada del antiguo M2 "Punto 7"): solo se crea fila al interactuar; sin fila = estado implícito "ninguno"
- Frontend: API client `tracker.ts` con labels, orden, sets de "reloj legal" y "activos", tonos visuales por estado
- Componente `EstadoSelector` reusable: botón "Añadir al pipeline" si no hay estado, badge+dropdown con los 10 estados + "Sacar del pipeline" si hay
- Página `/tracker` con kanban de 10 columnas (scroll horizontal) — cada card muestra expediente, título, organismo, importe, deadline con countdown color-coded (rojo ≤3d, amarillo ≤7d)
- Las 2 columnas con reloj legal marcadas con icono ⓘ y título en color danger
- Integración Radar: `EstadoSelector` en la barra de acciones del detalle de licitación
- Sidebar: nuevo entry "Pipeline" → `/tracker` junto a "Inicio" en el grupo top

Tested E2E con 4 licitaciones reales: 4 estados creados, auto-deadlines correctos (en_subsanacion 2026-05-02 = today+5d, documentacion_previa 2026-05-11 = today+14d), feed ordenado por deadline asc nulls last, resumen agregado correcto (4 activas, 1 deadline en ventana de 7d).

## Estados modelados
```
en preparación → presentada → [en subsanación (3d hábiles)] →
en resolución → [documentación previa (10d hábiles)] →
ganada / perdida / excluida
```

8 estados (simplificado desde 10). Estados con reloj legal marcados con countdown amber; rojo solo cuando el plazo está vencido. Terminales diferenciados: `ganada` (verde), `perdida` (zinc), `excluida` (rosa — exclusión en Mesa, error documental propio).

**Decisiones de simplificación vs. v1:**
- `apertura_sobres` + `adjudicacion_provisional` → fusionados en `en_resolucion` (ambos eran espera pasiva sin acción del usuario)
- `adjudicada` + `formalizada` → colapsados en `ganada` (formalización ocurre fuera del producto)
- `rechazada` → renombrado `excluida` (semánticamente correcto: exclusión en Mesa de Sobre A)

## Modelo de datos

Tabla `licitacion_estado_empresa` (multi-tenant desde el principio aunque hoy solo haya empresa demo):
```
empresa_id            uuid FK   — se queda bien para auth real
licitacion_id         uuid FK
estado                String(32) — los 8 estados del ciclo (no PG enum → sin migración al cambiar)
deadline_actual       date      — fecha del próximo reloj legal (nullable)
nota                  text      — opcional
estado_actualizado_at timestamptz
+ TimestampMixin
UniqueConstraint(empresa_id, licitacion_id)
```

**Optimización clave (heredada del antiguo M2):** *no creamos una fila por licitación* — solo cuando el usuario interactúa con ella por primera vez. **Si no hay fila, la licitación está en M1 pero no en el pipeline.** Esto evita inflar la tabla con 1.300+ filas vacías en cada ingesta.

## Vistas

### Kanban (default)
- Columnas: en preparación / presentada / en subsanación / en resolución / documentación previa / ganada / perdida / excluida
- Cards: nombre licitación, organismo, deadline próximo (con countdown si <7 días), iconos de tareas pendientes
- Drag & drop entre columnas (manual — sin automatismos en MVP)
- Filtros: por organismo, por importe, por estado activo
- Empty state por columna: "Aún no has marcado ninguna licitación como…"

### Lista
- Tabla filtrable + ordenable. Útil cuando el volumen >20 licitaciones activas
- Reutilizar `LicitacionRow` patterns

### Calendar
- Mes / semana
- Marca todos los deadlines: presentación, subsanación, documentación previa, formalización
- Click en evento → ficha de licitación

### Home (dashboard simplificado)
La página inicial del producto al hacer login. Reemplaza el dashboard antiguo (M1 en el backlog viejo). Resumen de:
- 1 KPI grande: nº licitaciones activas
- Bloque "Plazos críticos esta semana" — listado con countdown
- Bloque "Documentación que caduca este mes" (puente al M2)
- Bloque "Nuevas oportunidades verdes" (puente al M1)

## Avisos automáticos (transversal)
- **Email diario configurable:** *"3 nuevas licitaciones encajan contigo. 1 deadline crítico esta semana (subsanación de Ajuntament de Mataró). 2 documentos caducan este mes."*
- **Push notifications** (cuando haya app o PWA): solo para deadlines <72h
- **Alertas in-app:** badge en el icono del Tracker en sidebar cuando hay deadline activo

Sin auth real (`EMPRESA_DEMO_ID`) los avisos email no salen al exterior — son log-only en dev. Cuando exista auth, integrar Resend / Postmark / Mailgun (decidir en su momento).

## Endpoints
- `PUT /api/v1/tracker/{expediente:path}/estado` — body `{ estado, nota?, deadline_actual? }` — upsert del par (empresa, licitacion)
- `DELETE /api/v1/tracker/{expediente:path}/estado` — saca del pipeline (borra la fila; vuelve al estado implícito)
- `GET /api/v1/tracker?estado=...&empresa_id=...` — feed con filtros multi-estado
- `GET /api/v1/tracker/deadlines?dias=7` — para bloques de "plazos críticos"
- `GET /api/v1/tracker/resumen` — KPIs para la home

Por defecto, el feed **oculta** las licitaciones en `perdida` y `rechazada` salvo que el filtro las incluya explícitamente.

## Integración con otros módulos
- **M1 Radar:** botón "guardar" en una licitación → la pone en estado `en preparación`
- **M3 Pliegos:** al cerrar análisis con veredicto "ir" → opción de guardar → estado `en preparación`
- **M4 Sobre A:** al generar Sobre A → no cambia estado automáticamente (el cliente debe presentar fuera del sistema). Cuando confirme presentación → `presentada`.
- **M5 Calculadora:** al generar Sobre C → opción de marcar como `presentada` con un click

## Reglas de scope
- **Cambios manuales en MVP.** Sin automatismos del tipo "se detecta presentada cuando subes X" o "ganada al detectar la adjudicación oficial". Esos automatismos llegan con M8 Histórico (v2). El cliente clica.
- **Multi-empresa por cuenta es v2.** En MVP, 1 cuenta = 1 empresa = 1 pipeline.
- **Sin SLA en avisos.** Best-effort. Si Redis cae, el Beat de Celery se recupera al volver. No prometemos avisos al segundo.

## Pendiente — quedaron fuera del sprint MVP

### Próximas iteraciones (corto plazo)
- **Integración con `/dashboard`** — añadir bloque "Plazos críticos esta semana" + counts por estado en la home. Reusa `GET /tracker/resumen`. La home actual tiene KPIs pero no datos del pipeline; tras esto el dashboard se convierte en home tracker-céntrico.
- **Vista lista** alternativa al kanban — útil cuando volumen >20 activas; tabla filtrable + ordenable. Reusa el feed con filtros.
- **Vista calendar** mensual con todos los deadlines (presentación, subsanación, documentación previa, formalización).
- **Pre-rellenar deadline al transicionar** — para `en_preparacion` autosugerir `licitacion.fecha_limite`; para `apertura_sobres` pedir fecha al usuario.
- **Drag & drop kanban** — `dnd-kit` (estándar moderno). Confirmar instalación con el usuario antes de añadir librería UI.
- **Notas inline editables** — hoy se envía la nota en el PUT pero no hay UI para editarla.

### Avisos email (depende de auth real)
Tres trigger points anotados también en M2-empresa.md:
1. Documento administrativo caducando 30/7 días antes
2. Adjudicación provisional → email con docs M2 que caducan + lista de exigidos según LCSP
3. Resumen diario configurable con nuevas verdes + deadlines críticos + docs caducando

### Post-MVP
- **Auto-detección de cambio de estado** desde scraping de adjudicación oficial (`contractaciopublica.cat` / BOE). Extender el worker `ingesta_pscp` para detectar resoluciones y proponer transición al usuario (manteniendo confirmación manual).
- **Notificaciones SMS** para deadlines <24h (extra-coste pero alto valor). Twilio o similar.
- **Asignación a usuario** dentro de una empresa (cuando haya multi-usuario).
- **Vista timeline / Gantt** de obras en ejecución (cuando se gestione más allá de adjudicación).
- **Integración con calendarios** (Google Calendar, Outlook) para sincronizar deadlines.
- **Calendario laboral por CCAA** para que `auto-deadline` use días hábiles reales, no aproximación calendar.

## Dependencias
- **M1 Radar** ✅ — origen de las licitaciones (importadas o creadas manualmente)
- **M2 Empresa** — datos para emails y para verificar documentación que caduca
- **M3 / M4 / M5** — disparan transiciones de estado al cerrar etapas

## Notas de implementación
- Reutilizar el patrón optimización del antiguo M2 "Punto 7": no crear filas vacías
- Frontend kanban con `dnd-kit` o `react-beautiful-dnd` (revisar regla CLAUDE.md "no instalar librerías UI sin preguntar" antes de instalar — `dnd-kit` es el estándar moderno)
- Filtro por defecto excluye `perdida` y `rechazada` (toggle para mostrarlas)
- Estimación: 8-12h para todo el módulo (modelo + migración + endpoints + 4 vistas + email diario básico)
