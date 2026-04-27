# M8 — Histórico de resultados

## Propósito
Cierra el ciclo de aprendizaje. Cada licitación en la que participas termina con un **acta de resolución** donde la mesa de contratación publica las puntuaciones de todos los licitadores: cuántos puntos técnicos y económicos obtuvo cada empresa y por qué ganó el que ganó.

El módulo extrae esa información automáticamente y la cruza con tu oferta. El resultado es un diagnóstico claro:
- Perdiste **porque fuiste caro** (poca puntuación económica)
- Perdiste **porque tu memoria técnica puntuó menos** que la de la empresa ganadora
- Perdiste **porque los criterios subjetivos** de valoración jugaron en tu contra

Con el tiempo construye una **curva de aprendizaje real**: puedes ver si tu puntuación técnica media está mejorando, en qué tipos de obra eres más competitivo, y qué organismos valoran más la calidad técnica frente al precio.

**Además**, cada acta procesada alimenta directamente el Vigilante de Competencia (M6) con datos de bajas reales, cerrando el círculo de información entre todos los módulos.

## Estado
🔲 Pendiente de construir

## Dependencias
- Extracción de PDF (actas de resolución) — similar pipeline que M3
- **M6 Competencia** — consume los datos de bajas reales que produce M8

## Notas de diseño
- La página del módulo muestra: "Perdiste 12 licitaciones últimos 6 meses. En 7 fuiste caro. En 3 tu memoria técnica puntuó bajo. En 2 ganó alguien por puntos subjetivos."
- Gráfico de evolución de la puntuación técnica media en el tiempo
- Ranking de organismos por tu tasa de éxito
