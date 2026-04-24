# M4 — Estudio económico (BC3)

## Propósito
Resuelve uno de los trabajos más tediosos y críticos: convertir el presupuesto de la administración en algo con lo que puedas trabajar y comparar.

Cuando la administración publica una licitación, incluye un presupuesto con todas las partidas (metros de hormigón, kilos de acero, horas de maquinaria…) en PDF. Para preparar tu oferta económica necesitas ese mismo desglose en formato editable.

**Extractor:** sube el PDF, el sistema detecta las tablas, las normaliza y entrega el presupuesto en BC3 (estándar del sector) y Excel. El usuario trabaja directamente en su software de presupuestos habitual.

**Análisis de costes:** compara el precio unitario de la administración para cada partida con lo que tú has cobrado históricamente. Identifica las partidas donde vas a perder dinero si ofertas al precio de la administración — antes de que firmes.

**Análisis de Pareto:** señala las 5-10 partidas que concentran el 80% del presupuesto, para no perder tiempo refinando partidas que no mueven la aguja.

## Estado
🔲 Pendiente de construir

## Dependencias
- Formato BC3 (spec del sector)
- Histórico propio de precios unitarios (puede nutrirse de M3 + datos introducidos por el usuario)

## Notas de diseño
- La extracción de tablas de PDF es el reto técnico principal — evaluar `camelot`, `pdfplumber.extract_tables` o LLM con OCR
- El output BC3 debe ser válido para importar en Presto/Arquímedes
