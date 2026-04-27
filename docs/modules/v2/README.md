# Módulos fuera del MVP

Estos módulos están planificados pero **fuera del scope MVP**. Se construyen tras validar el MVP con clientes piloto, en orden a definir según feedback.

## Por qué cada uno está aquí

- **M4-bc3.md** — Extractor de presupuestos a BC3. Compite con Presto/TCQ — no es nuestra batalla en v1. v2: integración por BC3, no editor propio.
- **M5-memorias.md** — Redactor de Sobre B (memoria técnica). Es la **killer feature** del producto, pero tiene problema de arranque en frío (necesita librería de memorias previas como set de entrenamiento) y mucho riesgo de retraso. v2 prioritario, palanca de upgrade de plan.
- **M6-competencia.md** — Histórico de bajas + simulador de puntos. Necesita 6-12 meses de datos reales de adjudicaciones procesadas. Año 2.
- **M8-historico.md** — Aprendizaje de actas de resolución. Cierra el ciclo del producto, alimenta M6. Año 2.
- **avales.md** — Caja de avales. Solo aplica al 15-25% de licitaciones que se ganan, modelo mental distinto (post-adjudicación). Construir tras MVP cuando haya base de clientes ganando obras.

## Numeración

Los archivos conservan el número antiguo (M4, M5, M6, M8) por trazabilidad histórica con commits previos. Cuando se reactiven, recibirán nueva numeración o nombre semántico según el plan v2 — la numeración del MVP (M1-M6 actuales) no se ve afectada.

## Dashboard antiguo

`M1-dashboard.md` se eliminó: el dashboard como pantalla independiente con KPIs ya no es módulo en el MVP. La home page la cubre [M6 Tracker](../M6-tracker.md) con vista resumen + KPIs simples + listas accionables.

## Antiguo M7 Admin

`M7-admin.md` contenía dos cosas: DEUC y Caja de Avales. Se separaron:
- DEUC (+ declaración responsable) → promovido a [M4 Sobre A](../M4-sobre-a.md) en el MVP
- Caja de Avales → movida aquí (`avales.md`) por estar fuera del MVP
