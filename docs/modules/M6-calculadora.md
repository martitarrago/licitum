# M6 — Calculadora de oferta económica

## Propósito
Cierra el Sobre C (oferta económica) sin que el cliente tenga que adivinar. Vive dentro del workspace `/ofertas/[exp]` como pestaña "Económica", alimentada por la fórmula de valoración y el umbral de baja temeraria que extrajo el M3 + intel histórica del órgano (data layer PSCP).

El cliente mueve un slider (o teclea una baja %) y ve en tiempo real:
- Cuántos puntos económicos saca con esa oferta según la fórmula del PCAP
- Distancia a baja temeraria estimada con datos PSCP reales
- Si supera umbral de saciedad
- Si cae en zona temeraria (necesita justificación obligatoria, LCSP art. 149)
- Diferencial vs baja media histórica del órgano

Resuelve la pregunta inversa también: *"¿cuánto tengo que bajar para sacar 30 puntos económicos?"* y propone una **recomendación inteligente** con rango óptimo.

Convierte una decisión que muchas PYMES toman a intuición en una decisión informada, sin meterse en costes internos (terreno de Presto / TCQ).

## Estado — completo ✅ (última actualización 2026-05-05)

Construido el 2026-05-05 (commit `5128366`). Vive dentro de `/ofertas/[exp]` como pestaña "Económica" — ver `STATUS.md §6`.

### Backend
- Migración 0027 + tabla `oferta_economica_generaciones` (snapshot del cálculo + HTML renderizado, mismo patrón que `sobre_a_generaciones`)
- Servicio `app/services/calculadora_economica.py`:
  - **4 fórmulas LCSP típicas:** lineal, proporcional inversa, lineal con saciedad, cuadrática
  - **Estimación de baja temeraria:** reutiliza `intel/scoring/lcsp.py` (art. 149)
  - **`recomendar_baja`:** rango óptimo + % sugerido cruzando intel del órgano + margen al umbral temerario
- Servicio `app/services/oferta_economica_render.py`:
  - **HTML para preview** en iframe
  - **`.docx` editable** con la proposición económica formal: importe en cifras y letras, declaraciones de aceptación de pliegos, IVA, plazo
  - Conversor de números a letras para el importe legal

### Endpoints `/api/v1/oferta-economica/*` (7)
- `GET /licitacion/{exp}/contexto` — datos del pliego (M3) + intel histórica del órgano (PSCP) + recomendación inteligente
- `POST /licitacion/{exp}/calcular` — cálculo en vivo del slider (debounce 200ms en frontend)
- `POST /licitacion/{exp}/generar` — guarda versión + render HTML
- `GET /` listing
- `GET /{id}` detail
- `GET /{id}/docx` — descarga Word
- `DELETE /{id}`

### Frontend (`EconomicaPanel` en `/ofertas/[exp]`)
- **Lo que pide el pliego:** presupuesto, fórmula, umbral saciedad, cláusula temeraria literal
- **Cómo se mueve la competencia:** baja media histórica del órgano+CPV, P90, ofertas medias, umbral temerario estimado (todo del data layer PSCP)
- **Recomendación inteligente** con rango óptimo + % sugerido + botón "usar oferta sugerida"
- **Slider de baja con cálculo en vivo** (debounce 200ms): muestra importe ofertado, importe IVA, total, puntos económicos estimados según fórmula del pliego, diferencial vs baja media histórica, banner de riesgo (verde/amarillo/rojo según margen al umbral)
- **Markers visuales en el slider:** baja media · umbral temerario
- **Acciones:** guardar versión + descargar última `.docx`
- **Histórico de versiones colapsable** con preview y descarga
- Listado raíz `/calculadora` con todas las versiones generadas (mismo patrón que `/sobre-a`)
- Preview `/oferta-economica/[id]` con iframe + imprimir/PDF

**Mono-lote por ahora** — los pliegos con varios lotes son edge case y se aplazan a iteración futura.

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

### 🔴 Refactor del motor lógico de `recomendar_baja` (PRIORITARIO — diseño cerrado 2026-05-06)

Spec completo en memoria `calculadora_motor_redesign.md`.

**Problema detectado** revisando expediente real 2026/12686M (Ajuntament Badalona, n_obs=4, baja_avg=18.71%, ofertes_avg=2.25): el motor sugería **20.21%** — por encima del umbral temerario LCSP (20%) y demasiado alta para una PYME con margen 8-12%.

**Causa raíz conceptual:** el motor mezcla "techo legal" con "óptimo competitivo" y ancla la sugerencia en `media + 1.5pp`. Pero `baja_avg` es la baja del ADJUDICATARIO (lo que GANÓ), no la oferta media. Sugerirle a una PYME que se suba 1.5pp por encima del que históricamente gana es pedirle margen sin justificación.

**Bugs ya parcheados** (commit `a1ffd93`, deployado):
- Clamp de `pct_sugerido` y `rango_max` bajo `threshold − 2pp`.
- Filtro `n_obs ≥ 10` antes de fiarse de `ofertes_avg` para elegir caso LCSP 149.
- Caso conflicto cuando `media + 1 ≥ techo_seguro`: confianza="baja" + razonamiento explícito.

Esto es PARCHE, no fix conceptual.

**Refactor pendiente — cambios:**

1. **3 puntos de referencia, no 1**:
   - `conservadora` = `baja_median` (lo que típicamente gana)
   - `competitiva` = `baja_p90` (el 10% más agresivos)
   - `techo_legal` = `temeraria_threshold − 2pp`
   - `saciedad` (si la fórmula tiene umbral)
   
   Todos clampados, todos visibles en la UI como marcas en el slider.

2. **Default por reglas multi-factor**:
   - Si `peso_precio < 40%` (memoria pesa más) → conservadora
   - Si `n_obs < 10` → conservadora
   - Si fórmula con saciedad → `min(saciedad, techo)`
   - Si fórmula premia más baja Y `peso_precio ≥ 40%` → competitiva (p90)
   - Si fórmula no detectada → conservadora
   - Caso conflicto (mediana ≥ techo seguro) → techo + advertencia
   - **Nunca recomienda `techo_legal` por defecto.**

3. **Honrar threshold del PCAP**: extraer numérico de `baja_temeraria_extracto` con regex (10%/15%/20%/"media+Xpp"). Si lo encuentra, usa ese threshold en lugar del LCSP por defecto.

4. **Honrar `pct_criterios_objetivos`**: ya extraído, hoy no se usa. Si la memoria pesa más que el precio, no se queman pp de margen sin sentido.

5. **Schema nuevo `Recomendacion`**: `referencias: list[PuntoReferencia]`, `pct_sugerido_label`, `techo_temerario_fuente`, `peso_precio_pct`, `advertencias: list[str]`. Mantener compat con campos viejos derivados.

**Pasos del refactor (1-2 días):**
- A.1 Endpoint expone `baja_median` y `baja_p90` reales (ya en mview, sólo añadir al SELECT y a `IntelOut`).
- A.2 Refactor `recomendar_baja` con schema nuevo.
- A.3 Reglas multi-factor con `pct_criterios_objetivos` y `n_obs`.
- A.4 Regex sobre `baja_temeraria_extracto` para sacar threshold del PCAP.
- A.5 Frontend (PR separado): pintar marcas + zonas de color en slider.
- A.6 M3 (PR separado): mejorar prompt para extraer `umbral_saciedad_pct` y `baja_temeraria_pct` numéricos.

**Futuro (post-MVP):** margen objetivo en M2 Empresa para calcular `baja_max_viable = 1 − coste/presupuesto` y mostrar referencias "no rentables" cuando superan ese techo.

### Próximas iteraciones (corto plazo)
- **Multi-lote** — hoy solo soporta mono-lote. Los pliegos con varios lotes (ver bug del Radar en `M1-radar.md`) requieren modelar oferta por lote en el snapshot.
- **XML estructurado del Sobre C** — hoy generamos `.docx` editable + HTML imprimible. Para subida directa a `contractaciopublica.cat` haría falta XML según el XSD del órgano. Aplazado: el cliente firma en PDF y sube en el portal igual que el Sobre A.
- **Comparativa con histórico propio** — *"tu baja media en obras de Generalitat es 12%; aquí estás proponiendo 18%, ¿estás seguro?"* (depende de tener histórico real de presentaciones del cliente).

### Post-MVP
- **Modo Monte Carlo** — simulación de probabilidad de victoria asumiendo distribución de bajas de competidores. Reusa el data layer PSCP existente (varianza por órgano+CPV).
- **Plantillas justificación temeraria** — generador IA para justificar baja anormal cuando entra en zona roja, basado en estructura de costes declarada.
- **Mejoras compuestas** — calcular puntos compuestos cuando el pliego suma puntos económicos + mejoras + plazo (hoy modelamos solo económicos).
- **Modo UTE** — repartir oferta entre socios y reflejar en el Sobre C.
