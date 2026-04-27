# v2 — Caja de Avales

## Estado
**Fuera del MVP.** Solo aplica al 15-25% de licitaciones que se ganan, modelo mental distinto (post-adjudicación). Se construye después del MVP cuando haya base de clientes ganando obras y feedback real sobre el dolor del control de devoluciones.

En el MVP, la **garantía definitiva** se gestiona como un hito dentro del estado "documentación previa adjudicación" del [M6 Tracker](../M6-tracker.md) — el cliente sube el documento manualmente, sin módulo dedicado.

## Propósito (preservado del antiguo M7)
Resuelve un problema financiero serio que muchas PYMES gestionan mal: el control de las garantías bancarias.

Cuando te adjudican una obra, tienes que depositar un aval bancario equivalente al **5% del contrato** (LCSP art. 107.1). Ese dinero queda inmovilizado hasta que termina la obra y el organismo lo libera (típicamente 12 meses después de la recepción de obra, LCSP art. 111). El problema es que muchas empresas no reclaman la devolución a tiempo porque nadie controla las fechas — dinero olvidado en el banco.

Este módulo **calcula cuándo corresponde pedir cada devolución** y avisa automáticamente, liberando liquidez.

## Modelo `Aval` (planificado)
```
empresa_id           uuid FK
licitacion_id        uuid FK opcional (puede ser aval pre-Licitum)
titulo               text
organismo            varchar(255)
importe              numeric(14,2)         — el aval depositado
importe_obra         numeric(14,2) opcional — para calcular el 5% automático
fecha_constitucion   date                  — cuándo se depositó
fecha_recepcion_obra date opcional         — acta de recepción
fecha_fin_garantia   date opcional         — devolución estimada/real
estado               enum                  — activo / en_devolucion / devuelto / perdido
entidad_bancaria     varchar(128)
numero_aval          varchar(64)
pdf_url              varchar(1024) opcional — archivo del aval en R2
notas                text
+ TimestampMixin + SoftDeleteMixin
```

## Cálculo de fecha de devolución (heurística LCSP art. 111)
- Si hay `fecha_recepcion_obra` → `fecha_fin_garantia = fecha_recepcion_obra + 12 meses` (default editable)
- Sin recepción → estimación: `fecha_constitucion + 24 meses` (asume 12m de obra + 12m de garantía típica)
- El usuario puede sobrescribir manualmente siempre

## Estados y alertas visuales
- `activo` y `dias_a_devolucion < 30` → **amarillo** "se acerca devolución"
- `activo` y `dias_a_devolucion < 0` → **naranja** "ya deberías reclamar"
- `en_devolucion` → estado intermedio (manual)
- `devuelto` → cerrado, ocultable de la vista por defecto
- `perdido` → casos especiales, contabilizable

## Trabajo concreto (cuando se construya)

**Backend:**
- Migración Alembic: tabla `avales` + enum `estado_aval`
- Modelo SQLAlchemy + Schemas Pydantic
- CRUD endpoints `/api/v1/avales` (GET list con filtros por estado, POST, PATCH, DELETE soft)
- Endpoint `GET /avales/resumen` → `{ total_inmovilizado, num_activos, proximo_vencimiento }`
- Helper `calcular_fecha_devolucion(constitucion, recepcion?) -> date`

**Frontend:**
- Página `/avales` con:
  - Header con KPI grande: "Total inmovilizado: X €"
  - Filtro por estado (activos / todos / devueltos)
  - Tabla compacta: organismo, importe, fechas, días restantes, estado
  - Modal "Añadir aval" con formulario manual (todos los campos editables)
  - Modal "Editar aval"
  - Acciones rápidas: marcar "en devolución" / "devuelto"
- Indicador visual de proximidad usando colores apagados (success/warning/danger)

## Integraciones futuras
- **OCR de cartas de aval bancarias.** Reusa el worker M2 (`pdfplumber` + Claude `tool_use`).
- **Auto-creación de aval** cuando una licitación pasa a estado `adjudicada` en M6 Tracker.
- **Notificaciones email** cuando un aval se acerca a devolución (depende de auth real + agente de avisos del MVP).
- **Integración bancaria** para reclamar la devolución directamente (out of scope a medio plazo).

## Dependencias
- **M2 Empresa** — datos del titular
- **M6 Tracker** — disparo automático cuando se gana adjudicación
- LCSP art. 107.1 (constitución 5%) y art. 111 (devolución, plazo de garantía)
