# M1 — Dashboard

## Propósito
Pantalla de "buenos días". El usuario llega por la mañana y en 10 segundos sabe el estado de su empresa:

- Cuánta solvencia le queda disponible para optar a más obras
- Qué licitaciones tiene en marcha con fecha límite próxima
- Nuevas licitaciones compatibles
- Cuánto dinero tiene inmovilizado en avales bancarios
- Si su tasa de éxito está mejorando o empeorando

## Estado
🟡 **Esqueleto implementado** (2026-04-27) — los KPIs y listas que dependen de M3/M2 están operativos.
Los KPIs y secciones que dependen de M7 y M8 están renderizados como **tarjetas "pendiente"** (icono atenuado + chip `pronto`) hasta que esos módulos existan.

## Estructura visual

```
┌─────────────────────────────────────────────────────────┐
│  Hero editorial                                          │
│  "Buenos días/tardes/noches" · Empresa · fecha larga     │
└─────────────────────────────────────────────────────────┘

┌─────────────┬─────────────┬─────────────┬───────────────┐
│ Solvencia   │ Oportunid.  │ Avales      │ Tasa éxito    │
│ anual       │ activas     │ inmoviliz.  │               │
│ (M3 ✅)     │ (M2 ✅)     │ (M7 ⏳)     │ (M8 ⏳)       │
└─────────────┴─────────────┴─────────────┴───────────────┘

┌─────────────────────────────────────────────────────────┐
│  Reparto del Radar por semáforo (gráfico, M2 ✅)        │
│  ▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱  barra apilada                    │
│  · cumples · ajustada · no cumples (cards-leyenda)      │
└─────────────────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────┐
│ Cierran esta semana          │ Nuevas oportunidades     │
│ verdes · plazo ≤14 días      │ verde · alta afinidad    │
│ (M2 ✅)                      │ (M2 ✅)                  │
└──────────────────────────────┴──────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Solvencia por grupo ROLECE  (M3 ✅)                    │
└─────────────────────────────────────────────────────────┘
```

## Dependencias y contrato de datos

### M3 Solvencia ✅ — implementado
Endpoint: `GET /api/v1/solvencia/certificados/resumen-solvencia?empresa_id={id}`
Devuelve `ResumenSolvencia { anualidad_media, anualidad_pico, anio_pico, total_obras, por_grupo[] }`.

KPI consumido: **Anualidad media** (LCSP art. 88 — determina el techo de licitación).

### M2 Radar ✅ — implementado
Endpoint: `GET /api/v1/licitaciones?...`
Para el dashboard usamos cuatro consultas:
- **Cierran esta semana**: `semaforo=verde&plazo_max_dias=14` ordenado por fecha límite asc, `page_size=5`
- **Nuevas oportunidades**: `semaforo=verde` ordenado por defecto del backend (afinidad desc), `page_size=5`
- **Distribución de semáforo** (gráfico): tres queries `page_size=1` (verde / amarillo / rojo) — sólo se usa el campo `total` de la respuesta. Alimenta la barra apilada y las tres cards-leyenda clicables que llevan al Radar pre-filtrado.

> ⚠️ Hoy no existe parámetro `sort` ni `order_by` en la API — el ordenamiento viene del backend.
> El backend ya ordena por `score_afinidad DESC` cuando se filtra por verde. Si en el futuro
> queremos forzar orden, añadir `?sort=fecha_limite_asc|afinidad_desc` en `licitaciones.py`.

### M7 Administración ⏳ — placeholder
Cuando exista el módulo, sustituir el tile "Avales inmovilizados" por:
- KPI: **importe total de avales activos** (suma de `aval.importe` donde `aval.estado = activo`)
- Hint: `N avales activos`
- Endpoint propuesto: `GET /api/v1/admin/avales/resumen?empresa_id={id}`
  → `{ total_inmovilizado: number, num_activos: number, proximo_vencimiento: date | null }`

### M8 Histórico ⏳ — placeholder
Cuando exista el módulo, sustituir el tile "Tasa de éxito" por:
- KPI: **% adjudicaciones / presentadas (últimos 12 meses)**
- Hint: delta vs. periodo anterior (`+3 pts` / `−2 pts`)
- Endpoint propuesto: `GET /api/v1/historico/tasa-exito?empresa_id={id}&periodo=12m`
  → `{ tasa_actual: number, tasa_anterior: number, presentadas: number, adjudicadas: number }`

## Notas de diseño
- Hero usa `font-serif` (Fraunces) sólo en el saludo — único toque editorial fuera de la regla común.
- Container y paddings alineados con M2/M3: `mx-auto w-full max-w-7xl px-4 py-8 sm:px-6`. Cards en `rounded-2xl bg-surface-raised ring-1 ring-border` (mismo patrón que `SolvenciaResumen`).
- Sin acento naranja en esta pantalla (regla: máximo 1 aparición/pantalla, ya está en sidebar).
- KPIs pendientes: card normal + icono atenuado + chip `pronto · M7` (mismo lenguaje que sidebar).
  No mostrar números falsos ni "—" sin contexto.
- Gráfico `DistribucionSemaforo` (barra apilada de 3 colores del semáforo + 3 cards-leyenda con conteo y %). Las cards-leyenda son `<Link>` que llevan al Radar pre-filtrado por color — convierten el gráfico en herramienta de navegación.
- Densidad: 4 KPIs visibles sin scroll en desktop. Las dos listas usan `LicitacionRow` (fila compacta), no la card completa, para que entren 5 elementos por columna sin saturar.
- Estados vacíos por sección: "Aún no hay…" + CTA al módulo correspondiente.

## Ficheros
- `frontend/src/app/dashboard/page.tsx` — página
- `frontend/src/components/ui/LicitacionRow.tsx` — fila compacta de licitación (creada para este módulo)
- `frontend/src/components/solvencia/SolvenciaResumen.tsx` — KPIs + desglose ROLECE (reutilizado de M3)
