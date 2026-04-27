# M6 — Vigilante de competencia

## Propósito
Antes de decidir a cuánto ofertas económicamente, necesitas saber a cuánto va a ofertar la competencia. **Eso no es adivinanza: hay patrones.**

- Hay empresas que en el área metropolitana de Barcelona bajan siempre entre un 12% y un 15%.
- Hay organismos donde la competencia es más agresiva que en otros.
- Hay tipos de obra donde los márgenes del sector están muy ajustados.

**Histórico de bajas:** construye esa base de datos automáticamente consumiendo los datos públicos de adjudicaciones pasadas. Con el tiempo, cuando estudias una licitación del Ayuntamiento de Sabadell para pavimentación urbana, puedes ver exactamente a cuánto han bajado los últimos 20 contratos similares en ese organismo.

**Simulador de puntos:** resuelve la pregunta inversa. En lugar de "si bajo un 8%, ¿cuántos puntos económicos consigo?", permite preguntar "¿cuánto tengo que bajar para conseguir 30 puntos económicos?". Lo combina con tu puntuación técnica estimada para decirte si con esa oferta ganarías o no según el histórico de competidores.

Convierte la decisión de la baja económica — que en muchas empresas se toma a intuición — en algo basado en datos.

## Estado
🔲 Pendiente de construir

## Dependencias
- **M8 Histórico** — alimenta las bajas reales de competidores
- Datos públicos de adjudicaciones (PLACSP, BOE, Open Data de administraciones)

## Notas de diseño
- Gráfico de distribución de bajas (histograma) por organismo / tipo de obra
- Simulador bidireccional: baja ↔ puntos ↔ probabilidad de victoria
- Fórmulas de puntuación económica variables según el pliego (lineal, cuadrática, con umbrales)
