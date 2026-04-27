# M5 — Redactor de Memorias (Sobre B)

## Propósito
Genera memorias (sobre A, sobre B, sobre C) **específicas para cada obra** usando los requisitos del pliego técnico como contexto. No es una plantilla genérica:

- Si el pliego dice que la obra está en un entorno urbano con restricciones de horario nocturno, la metodología generada tiene en cuenta esa restricción.
- Si requiere trabajos en altura, el plan de seguridad enfatiza los protocolos correspondientes.

## Estado
🔲 Pendiente de construir

## Investigación previa necesaria
- Estructura y contenido típico de los **sobres A, B y C** en contratación pública española
- Criterios de valoración habituales en pliegos para cada sobre
- Qué apartados son obligatorios vs opcionales
- Ejemplos de memorias ganadoras vs memorias rechazadas

## Dependencias
- **M3 Solvencia** — datos de la empresa (obras similares, medios materiales, equipo técnico)
- Pliego de la licitación en PDF (entrada del usuario)

## Notas de diseño
- Temperatura 0.3 para la generación (no 0 — queremos algo de variabilidad estilística)
- El usuario revisa y edita cada apartado antes de exportar
- Exportar a Word (.docx) manteniendo estilos
