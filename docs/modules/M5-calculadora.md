# M5 — Calculadora de oferta económica

## Propósito
Cierra el Sobre C (oferta económica) sin que el cliente tenga que adivinar. Vive **dentro** del detalle de una licitación, alimentada por la fórmula de valoración y el umbral de baja temeraria que extrajo el M3.

El cliente mueve un slider (o teclea una baja %) y ve en tiempo real:
- Cuántos puntos económicos saca con esa oferta
- Distancia a baja temeraria
- Si supera umbral de saciedad (más bajo no da más puntos)
- Si cae en zona temeraria (necesita justificación obligatoria, LCSP art. 149)

Resuelve la pregunta inversa también: *"¿cuánto tengo que bajar para sacar 30 puntos económicos?"*.

Convierte una decisión que muchas PYMES toman a intuición en una decisión informada, sin meterse en costes internos (terreno de Presto / TCQ).

## Estado — versión ligera ✅ MVP

Construida en el sprint del 2026-04-27 como sub-componente del flujo M3 (vive dentro de `/pliegos/[expediente]`, no es ruta propia):
- Slider de baja % (0-30 visible) + input numérico sincronizado (0-50)
- Cálculo en tiempo real del importe de oferta sin IVA + ahorro sobre presupuesto base
- Parser regex *best-effort* del literal de baja temeraria → si extrae un umbral numérico, muestra zona segura / margen ajustado / zona temeraria con color (success/warning/danger)
- Estimación de puntos económicos cuando `formula_tipo === "lineal_con_saciedad"` y `umbral_saciedad_pct` están extraídos por M3
- Aviso "has alcanzado el umbral de saciedad" cuando aplica
- Estilo invertido (card oscura sobre layout claro) para destacar como herramienta de acción
- Todo client-side sobre el `extracted_data` de M3 — sin endpoints propios, sin estado server-side

Lo que NO hace en MVP: generación de Sobre C en PDF/XML, cálculo exacto de puntos para fórmulas que requieren oferta media de competidores, mejoras compuestas, Monte Carlo. Ver "Pendientes" abajo.

## Lo que NO hace
- **No calcula coste interno** — no compite con Presto / TCQ / Arquímedes (terreno BC3, v2)
- **No predice qué van a ofertar competidores** — eso es M6 Competencia (v2)
- **No firma ni envía** — solo prepara el documento Sobre C

## Entradas
- **Presupuesto base** y **fórmula de valoración** (vienen del M3 Pliegos, parametrizada)
- **Umbral de baja temeraria** (extracto literal del M3 + parametrizado para cálculo)
- **Histórico de bajas** del cliente en obras similares — opcional, hidrata el "típicamente bajas un X% en este tipo de obra" cuando haya datos suficientes (post-MVP cuando M6 Tracker tenga histórico real)

## Salidas en tiempo real
- **Importe de oferta** (€)
- **Baja %** sobre presupuesto base
- **Puntuación económica** estimada (según fórmula del PCAP)
- **Estado de baja temeraria:**
  - VERDE: oferta segura, no se considera anormalmente baja
  - AMARILLO: cerca del umbral (margen <2%) — riesgo de tener que justificar
  - ROJO: en zona temeraria — debe justificar obligatoriamente, riesgo de exclusión
- **Avisos contextuales:**
  - "Estás 8 puntos por debajo del máximo posible — bajar 1.5% más te lo da"
  - "Has llegado al umbral de saciedad — bajar más no aumenta tu puntuación"
  - "Estás en zona temeraria, necesitarás justificación detallada (LCSP art. 149)"

## Salida final
Botón "Generar Sobre C" → produce el documento de oferta firme:
- Importe en letra y número
- Plazo de ejecución (extraído M3 o editable)
- Mejoras cuantificables ofertadas (lista editable, baremo del M3)
- Declaración de conformidad con pliego
- Formato PDF firmable + XML estructurado para PSCP

## Fórmulas soportadas (cobertura inicial)
La fórmula viene literal del PCAP en el M3, pero hay 4-5 patrones que cubren ~80% de pliegos catalanes:

- **Lineal directa:** `puntos = (oferta_min / oferta_propia) × max_puntos`
- **Proporcional inversa con baja media:** ajustada por baja media de licitadores admitidos (calcula in situ asumiendo escenario, o pidiendo dato al cliente)
- **Lineal con umbral de saciedad:** lineal hasta una baja X%, después constante en `max_puntos`
- **Cuadrática:** menos común, presente en algún pliego de Generalitat
- **Lineal con corte en baja temeraria:** sin puntos si caes en zona temeraria

El M3 detecta el patrón y lo parametriza; M5 lo evalúa.

**Caso borde:** si M3 no consigue parametrizar la fórmula automáticamente, M5 muestra modo "manual" — el cliente introduce los parámetros que vea en el PCAP. Aviso visible: "fórmula no detectada automáticamente, verifica los parámetros con el pliego".

## UI propuesta
Dentro del detalle de licitación, pestaña "Oferta económica":
- Header: presupuesto base + plazo + fórmula extraída (extracto literal + visualización del modelo en LaTeX o ASCII)
- Slider grande de baja % (con tics en 5%, 10%, 15%, 20%, 25%, etc.)
- 4 KPIs en tiempo real: importe oferta, puntos económicos, distancia a temeraria, % de máximo posible
- Gráfico: curva puntos vs baja %, con marcadores de tu posición y umbrales (saciedad, temeraria)
- Botón "Generar Sobre C" — solo activo si baja > 0; si en zona temeraria roja, modal de aviso obligando a confirmar la voluntad de justificar

## Trabajo concreto

### Backend
- `app/services/formula_evaluator.py` — registro de patrones de fórmulas con parámetros tipados (Pydantic v2)
- `app/services/baja_temeraria.py` — evaluación según extracto del PCAP. Soporta los umbrales típicos:
  - <25% bajo presupuesto base
  - >10 puntos sobre la media de ofertas
  - Custom según PCAP (extracto literal interpretado por la IA del M3)
- Endpoint `GET /api/v1/calculadora/{expediente:path}` — devuelve presupuesto, fórmula parametrizada, umbral
- Endpoint `POST /api/v1/calculadora/{expediente:path}/simular` — body con baja propuesta, devuelve outputs en tiempo real (cliente puede pollear o usar WebSocket si rendimiento exige; debounce 200ms)
- Endpoint `POST /api/v1/sobre-c/{expediente:path}/generar` — cierra y genera el PDF + XML

### Frontend
- Página integrada en `/pliegos/[expediente]` (no es ruta propia — vive dentro del flujo del M3)
- Cálculo client-side cuando la fórmula es trivial (lineal); server-side si es cuadrática o ajustada por media de ofertas (datos no disponibles localmente)
- Reutilizar `Slider` (a crear, lucide-react no provee — usar Radix Slider con permiso del usuario, según regla CLAUDE.md de no instalar UI sin preguntar)

## Dependencias
- **M3 Pliegos** — fórmula y umbral parametrizados
- **M2 Empresa** — datos para cabecera del Sobre C (CIF, representante, etc.)
- **M6 Tracker** — al generar Sobre C, opción de marcar la licitación como `presentada` con un click

## Pendiente

### Generación del Sobre C 🔲
Lo más cercano a "post-MVP que sí entra pronto". Reusa la infra de templates Jinja2 que planteamos para M4 Sobre A:
- Templates por tipo de órgano (genérico, ayuntamiento, Generalitat, consell, diputació)
- Output PDF firmable + XML estructurado para subir a `contractaciopublica.cat`
- Endpoint `POST /api/v1/sobre-c/{expediente}/generar` body `{ baja_pct, plazo_meses?, mejoras? }`
- Validación del XML contra el XSD del órgano antes del primer cliente real

### Refinar parser de baja temeraria 🔲
El regex client-side cubre patrones típicos castellano + catalán pero puede fallar con frases poco frecuentes. Mejor camino:
- Ampliar `PLIEGO_EXTRACTION_TOOL` (M3) con campos parametrizados: `baja_temeraria_pct_sobre_base` y `baja_temeraria_puntos_sobre_media`
- Pasar la responsabilidad del parsing a Claude (que ya entiende los matices del idioma)
- El frontend usa el campo numérico si existe, cae al regex si no
- Anotado también en `docs/modules/M3-pliegos.md`

### Cálculo exacto de puntos económicos 🔲
Hoy sólo estimamos para `lineal_con_saciedad`. Las fórmulas `lineal directa`, `proporcional_inversa` y `cuadratica` necesitan la **oferta media de competidores admitidos** para evaluarse — datos que no tendremos hasta tener histórico real (M6 v2). Soluciones intermedias:
- Permitir al usuario introducir una "baja media estimada" como parámetro
- Mostrar curva paramétrica (puntos vs baja %) para varios escenarios de competencia (5%, 10%, 15% baja media)

### Otros aplazados
- **Comparativa con histórico propio** — *"tu baja media en obras de Generalitat es 12%; aquí estás proponiendo 18%, ¿estás seguro?"* (depende de tener histórico real de presentaciones en M6)
- **Modo Monte Carlo** — simulación de probabilidad de victoria asumiendo distribución de bajas de competidores (depende M6 Competencia v2)
- **Plantillas justificación temeraria** — generador IA para justificar baja anormal cuando entra en zona roja, basado en estructura de costes declarada
- **Mejoras compuestas** — calcular puntos compuestos cuando el pliego suma puntos económicos + mejoras + plazo (hoy modelamos solo económicos)
- **Modo UTE** — repartir oferta entre socios y reflejar en el Sobre C
