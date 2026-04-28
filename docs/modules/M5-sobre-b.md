# M5 — Sobre B (Memoria técnica)

## Propósito
Generar la memoria técnica específica de cada licitación usando como contexto: requisitos del pliego (M3), perfil de la empresa y obras de referencia (M2), y el conocimiento histórico del órgano contratante extraído del data layer PSCP (qué valoran, qué tipo de memorias ganan, qué adjudicatarios típicos hay).

No es una plantilla genérica. Adaptado al pliego concreto:
- Si el pliego está en entorno urbano con restricción horaria nocturna → la metodología refleja esa restricción.
- Si requiere trabajos en altura → el plan de seguridad enfatiza protocolos correspondientes.
- Si el órgano históricamente valora medioambiente al 25% → la memoria refuerza ese eje.

## Estado
🔲 Pendiente de construir — incluido en MVP desde 2026-04-28 (refactor para incluir Sobre B)

## Diferenciador competitivo
Las herramientas existentes (Plyca, Vortal) son tramitadores, no redactores. La memoria sigue siendo el cuello de botella del jefe de obra: 20-40h por licitación. Si Licitum la baja a 4-6h con calidad ≥ artesanal, es la **killer feature** que justifica precio premium.

## Dependencias
- **M2 Empresa** — datos de la empresa: obras similares ejecutadas, equipo técnico, medios materiales, certificaciones
- **M3 Pliegos** — análisis IA del PCAP+PPT con criterios de valoración extraídos
- **Data layer PSCP** — perfil del órgano (qué valoran), adjudicatarios históricos (referencias relevantes), patrones de memoria ganadora

## Entradas
- Pliego analizado (PCAP+PPT extracted JSON)
- Datos M2 de la empresa (obras, equipo, medios)
- Contexto histórico del órgano (PSCP intel)
- Documentos opcionales del usuario: memorias previas, fichas de obras, CVs

## Salida
- Documento `.docx` editable con apartados estandarizados:
  - Conocimiento del proyecto y entorno
  - Metodología de ejecución
  - Programa de trabajos (Gantt simplificado)
  - Plan de calidad
  - Plan de seguridad y salud
  - Plan medioambiental
  - Equipo humano asignado (CVs anexados)
  - Maquinaria y medios
  - Obras de referencia (citadas con histórico verificable PSCP)
  - Memoria de innovaciones / mejoras propuestas
- Cada apartado revisado y editable por el usuario antes de exportar

## Notas de diseño
- Temperatura 0.3 para generación (variabilidad estilística controlada)
- Output streamed por apartados, no todo de golpe (UX + control de coste)
- Cita explícita de fuente para cada hecho citable (obras de referencia → ID interno PSCP/M2)
- Plantilla por tipología de obra (urbanización, edificación, restauración…) preconfigurada con secciones relevantes
- Soporte catalán nativo en redacción

## Riesgos
- **Arranque en frío:** sin librería de memorias previas, primera versión es genérica. Mitigación: el data layer PSCP da perfil del órgano y permite redacción contextual incluso sin memorias propias.
- **Coste API alto:** 50-150 páginas generadas por memoria a temperatura 0.3 puede ser $2-5/licitación. Mitigación: caching de plantillas por órgano+tipología.
- **Calidad percibida:** jefe de obra senior detectará texto IA si se pasa de genérico. Mitigación: incorporar siempre datos verificables (obras propias citadas, CVs reales del equipo, normativa vigente con referencia).

## Dependencia con Phase 1 PSCP
La calidad del Sobre B mejora drásticamente si el data layer PSCP está poblado:
- Saber que el órgano X valora memoria al 40% vs 20% cambia el énfasis de la redacción
- Saber qué tipo de obras ha adjudicado el órgano permite citar referencias relevantes ("obras similares a las ejecutadas para el mismo órgano por empresa Y, adjudicada en 2024")
- Patrones de memoria ganadora (extraídos en Phase 1.5 si validamos disponibilidad de PDFs adjudicatarios) → in-context examples para Claude

Por eso M5 sólo se activa con sentido tras Phase 1 PSCP completo + Phase 1.5 sample de extracción.
