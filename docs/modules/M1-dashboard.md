# M1 — Dashboard

## Propósito
Pantalla de "buenos días". El usuario llega por la mañana y en 10 segundos sabe el estado de su empresa:

- Cuánta solvencia le queda disponible para optar a más obras
- Qué licitaciones tiene en marcha con fecha límite próxima
- Nuevas licitaciones compatibles
- Cuánto dinero tiene inmovilizado en avales bancarios
- Si su tasa de éxito está mejorando o empeorando

## Estado
🔲 Pendiente de construir (solo existe la ruta `/dashboard` vacía y el enlace activo en el sidebar)

## Dependencias
- **M3 Solvencia** — para el KPI de solvencia disponible
- **M2 Radar IA** — para licitaciones compatibles
- **M7 Admin** — para avales inmovilizados
- **M8 Histórico** — para la tasa de éxito

## Notas de diseño
- Vista densa pero ordenada — máximo 4-5 KPIs visibles sin scroll
- Diferenciación clara entre "lo que tengo que hacer hoy" vs "cómo va la empresa"
