# M2 — Radar IA (Feed PLACSP)

## Propósito
Módulo que justifica la suscripción por sí solo. La PLACSP publica cientos de licitaciones por semana; revisarlas manualmente es inviable (un administrativo puede perder 2h/día solo en eso).

El Radar **filtra ese ruido automáticamente**. Solo muestra licitaciones con semáforo verde o amarillo: aquellas para las que técnicamente la empresa puede optar según su clasificación oficial y solvencia económica acreditada. Las rojas directamente no aparecen.

La diferencia con un buscador por CPV es que **el semáforo cruza tres variables**:
1. Si tiene la clasificación correcta (cruce con M3 clasificaciones)
2. Si el importe de la obra cabe dentro de su solvencia disponible (cruce con M3 certificados)
3. Si el tipo de obra se parece a lo que ha hecho antes (embeddings sobre histórico)

Eso convierte un feed genérico en una **bandeja de entrada de oportunidades reales**.

## Estado
🔲 Pendiente de construir

## Dependencias
- **M3 Solvencia** — clasificaciones activas + solvencia por grupo ROLECE (ya en producción)
- Conexión a PLACSP (scraping o API pública)
- pgvector para similitud semántica por CPV / descripción

## Notas de diseño
- Cada licitación se ve como card con semáforo grande, importe, plazo, organismo
- El usuario debe poder "archivar" o "marcar interés" desde el listado
- Los CPV del histórico propio alimentan los embeddings
