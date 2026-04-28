# Módulos fuera del MVP

Estos módulos están planificados pero **fuera del scope MVP**. Se construyen tras validar el MVP con clientes piloto, en orden a definir según feedback.

## Por qué cada uno está aquí

- **M4-bc3.md** — Extractor de presupuestos a BC3. Compite con Presto/TCQ — no es nuestra batalla en v1. v2: integración por BC3, no editor propio.
- **M6-competencia.md** — Antiguo módulo de histórico de bajas + simulador de puntos. **Reemplazado por el data layer PSCP** (`docs/data-science/architecture.md`) que cubre todas estas necesidades de forma integrada y alimenta múltiples módulos del MVP. Mantener archivo por trazabilidad histórica.
- **M8-historico.md** — Aprendizaje de actas de resolución. Cierra el ciclo del producto, alimenta el data layer PSCP. Año 2 (tras Phase 1.5 si sample de extracción es viable).
- **avales.md** — Caja de avales. Solo aplica al 15-25% de licitaciones que se ganan, modelo mental distinto (post-adjudicación). Construir tras MVP cuando haya base de clientes ganando obras.

**Movido al MVP en 2026-04-28:**
- M5-memorias.md → `docs/modules/M5-sobre-b.md`. Re-incorporado al MVP porque el data layer PSCP resuelve el problema de arranque en frío (perfil del órgano + adjudicatarios históricos como contexto) y porque es la palanca de pricing premium reconocida.

## Numeración

Los archivos conservan el número antiguo (M4, M6, M8) por trazabilidad histórica con commits previos. Cuando se reactiven, recibirán nueva numeración o nombre semántico según el plan v2 — la numeración del MVP (M1-M7 actuales) no se ve afectada.

## Dashboard antiguo

`M1-dashboard.md` se eliminó: el dashboard como pantalla independiente con KPIs ya no es módulo en el MVP. La home page la cubre [M6 Tracker](../M6-tracker.md) con vista resumen + KPIs simples + listas accionables.

## Antiguo M7 Admin

`M7-admin.md` contenía dos cosas: DEUC y Caja de Avales. Se separaron:
- DEUC (+ declaración responsable) → promovido a [M4 Sobre A](../M4-sobre-a.md) en el MVP
- Caja de Avales → movida aquí (`avales.md`) por estar fuera del MVP
