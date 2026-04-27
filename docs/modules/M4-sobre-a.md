# M4 — Sobre A (DEUC + Declaración Responsable)

## Propósito
El Sobre A es la documentación administrativa que se presenta con cualquier licitación: acredita capacidad jurídica, representación, solvencia económica/técnica y declara que la empresa cumple los requisitos del pliego. El documento central es el **DEUC** (Documento Europeo Único de Contratación) — un XML estándar de la UE.

Rellenar el DEUC manualmente lleva 30-60 minutos por licitación. Este módulo lo automatiza con los datos del M2 Empresa: en menos de 60 segundos, el cliente descarga el XML válido + un PDF firmable + la declaración responsable adaptada al órgano.

**Diferenciador Catalunya:** si la empresa está inscrita en RELIC, el DEUC se reduce a "consta en RELIC nº X" + firma. Esa simplificación es la palanca de venta para constructoras catalanas pequeñas — un competidor nacional no la replica sin un equipo regional dedicado.

## Estado — base ✅ MVP funcional

Construido en el sprint del 2026-04-27:
- Migración 0014 con `sobre_a_generaciones` (PK UUID, FK a empresa+licitación, snapshot JSONB de los datos del momento, HTML completo, flag `usa_relic`, índice DESC en `created_at`)
- Modelo + Pydantic schemas (Generar / ListItem / Read)
- Servicio `app/services/deuc_generator.py`:
  - HTML puro generado en Python (sin Jinja2 — el venv del proyecto no tiene pip y la complejidad no lo justifica; documentado en el módulo)
  - `html.escape()` aplicado a todo input variable contra XSS
  - Print stylesheet inline (A4, márgenes 2cm, serif Times, editorial)
  - Bloque RELIC condicional: si la empresa tiene `empresa_relic` y `prohibicio=false` → renderiza versión ultra-simplificada con base legal art. 159.4 LCSP + número registral; si no → declaración detallada con clasificaciones (manuales + RELIC) y volumen anual
  - 8 declaraciones LCSP estándar + numeración dinámica según versión
  - Sección extra para `docs_extra_sobre_a` cuando el M3 ha extraído documentación adicional exigida
  - Snapshot completo guardado en JSONB para auditoría
- 4 endpoints `/api/v1/sobre-a/*`: POST `/{exp}/generar` (encola sin Celery, render síncrono), GET listing, GET detail con HTML, DELETE
- Frontend:
  - `lib/api/sobre_a.ts` — client con generar/list/get/delete
  - Componente reusable `GenerarSobreABoton` con estado loading + redirección post-generar
  - `/sobre-a` listing con badge RELIC, fecha, acciones (ver/borrar)
  - `/sobre-a/[id]` preview con `<iframe srcDoc>` + botón "Imprimir / guardar como PDF" (browser native `window.print()`)
  - Integración Radar: botón "Generar Sobre A" entre "Analizar pliego" y "Añadir al pipeline"
  - Sidebar: Sobre A pasa a `available: true`

Tested E2E con empresa demo (TARRACO sync con 28 clasificaciones): genera versión RELIC ultra-simplificada (`usa_relic=true`), 6.3 KB de HTML, snapshot persistido con todos los datos.

## Entradas
- Datos del **M2 Empresa**: razón social, CIF, sede, representante con poder, IAE, cuentas anuales, clasificaciones ROLECE, certificados de obra, RELIC, certificados Hacienda/SS al corriente, pólizas
- Datos del **M3 Pliegos** (cuando hay análisis): expediente, organismo, lote, criterios específicos extraídos del PCAP que requieran declaración no estándar
- Vía manual: el cliente puede crear un Sobre A desde el detalle de una licitación del M1, aunque el M3 no haya corrido (modo "DEUC genérico")

## Subset DEUC mínimo (cubre 95% de pliegos catalanes)

El DEUC oficial tiene ~200 campos teóricos en el XSD, la mayoría condicionales. Para v1 cubrimos los ~30 que aparecen en pliegos catalanes reales:

**Bloque `Contexto`** — versión, fecha, expediente, lote.
**Bloque `ContractingParty`** — datos del organismo (de `licitaciones.organismo` del M1).
**Bloque `EconomicOperatorParty`** — datos de la empresa (de M2).
**Bloque `Criterion`** — declaraciones obligatorias (todos "Sí cumplo"):
- No condena penal firme
- Al corriente con Hacienda
- Al corriente con Seguridad Social
- No quiebra ni concurso
- No falsedad en documentación previa
- ~15 declaraciones estándar LCSP

**DEUC ultra-simplificado si la empresa consta en RELIC:** marcar "consta en RELIC" en los criterios de solvencia y omitir declaración detallada (bloque permitido por procedimiento abierto simplificado en Catalunya, justificación en LCSP art. 159 + normativa autonómica).

## Salida
- DEUC en **XML oficial** (importable directamente en `contractaciopublica.cat` y PSCP)
- DEUC en **PDF human-readable** para revisión y firma
- **Declaración responsable** adaptada (plantilla por tipo de órgano: ayuntamiento, consell comarcal, Generalitat, etc.)
- **Compromiso UTE** si aplica (M2 permite registrar UTEs como sub-entidad)
- Empaquetado como ZIP con `Content-Disposition: attachment; filename=SobreA_{expediente}.zip`

## UI propuesta
Botón "Generar Sobre A" en el detalle de licitación (M1 + M3):
- Si M2 está completo y empresa en RELIC → descarga directa (XML + PDF + decl. responsable como ZIP)
- Si M2 está completo pero sin RELIC → descarga directa con DEUC completo
- Si M2 incompleto → mensaje + lista de campos faltantes con link a `/empresa`

Página `/sobre-a` con histórico de Sobres A generados (filtro por estado, por licitación, por fecha) — auditoría simple.

Modal de previsualización del PDF antes de descargar (revisión final del cliente, regla CLAUDE.md "el sistema propone, el usuario confirma").

## Trabajo concreto

### Backend
- `app/services/deuc_generator.py` con templates Jinja2:
  - `templates/deuc.xml.j2` — XML oficial
  - `templates/deuc.pdf.j2` (vía WeasyPrint o ReportLab) — PDF lectura
  - `templates/declaracion_responsable_*.j2` — variantes por órgano (genérica, ayuntamiento, consell, Generalitat)
- Endpoint `POST /api/v1/sobre-a/{expediente:path}/generar`:
  - Carga licitación (M1) + empresa (M2)
  - Verifica completitud — si faltan campos, devuelve 422 con lista
  - Renderiza XML + PDF + decl. responsable
  - Devuelve ZIP
- Validar XSD oficial UE pre-deploy. Sin esto, el XML puede rechazarse en PSCP.
- Tabla `sobre_a_generaciones(licitacion_id, empresa_id, generado_at, contenido_zip_url, hash_datos_empresa)` — auditoría simple. El hash detecta si los datos de M2 cambiaron entre generaciones.

### Frontend
- Página `/sobre-a` (lista histórica)
- Integración en detalle de licitación — botón en pantalla de M1/M3
- Modal de previsualización del PDF antes de descargar

## Reglas críticas
- **El sistema propone, el usuario firma.** Sin bypass — regla CLAUDE.md aplicada al Sobre A.
- **Validación XSD obligatoria** antes del primer cliente real (library `xmlschema` con el XSD oficial de la UE).
- **Caracteres especiales** (acentos, ñ, ç catalán) deben ir CDATA-correctos en XML — usar `xml.sax.saxutils.escape` con autoescape Jinja2 desactivado para tener control fino.
- **Nunca sobrescribir un Sobre A previamente firmado** — generación nueva crea registro nuevo en histórico.

## Dependencias
- **M2 Empresa** — fuente de todos los datos
- **M1 Radar** + **M3 Pliegos** — origen del expediente
- Schema oficial DEUC: https://ec.europa.eu/tools/espd
- LCSP art. 140 (declaración responsable) y normativa autonómica catalana sobre procedimiento abierto simplificado (LCSP art. 159 + Decret de la Generalitat)

## Pendiente — quedaron fuera del sprint MVP

### Próximas iteraciones (corto plazo)
- **DEUC en formato XML oficial UE (XSD-validado)** — hoy generamos solo HTML/PDF imprimible. El XML estructurado es necesario para subida directa a `contractaciopublica.cat` en procedimientos abiertos no simplificados. Requiere instalar `xmlschema`, descargar XSD oficial UE de `https://ec.europa.eu/tools/espd` y construir el XML con escapado CDATA correcto para acentos catalanes (ñ, ç). Aplazado porque (1) procedimiento abierto simplificado catalán acepta declaración responsable HTML/PDF, (2) la mayoría de PYMEs catalanas pequeñas firman en papel/PDF y suben.
- **Plantillas declaración responsable por órgano** — hoy una sola plantilla genérica (LCSP estándar). Crear variantes específicas por tipo de órgano: Generalitat, ayuntamiento, consell comarcal, diputació, universidad, etc. — cada uno tiene cláusulas o redacciones diferentes. Empezar con feedback de pilotos.
- **Generación Sobre C desde calculadora M5** — la M5 calculadora ya muestra importe + baja + fórmula, pero no genera el documento. Reusa la infra de templates HTML+iframe+print de aquí. Anotado en `M5-calculadora.md`.
- **Validación cruzada con M2 antes de generar** — si faltan campos críticos (representante NIF, dirección completa) bloquear la generación y redirigir a `/empresa/perfil`. Hoy se genera con campos vacíos y se ven huecos.
- **Plantilla compromiso UTE** — cuando el cliente registre UTEs en M2, generar el Sobre A con datos de los socios.

### Post-MVP
- **Firma digital integrada** (FNMT, Cl@ge, AutoFirma) — hoy el cliente firma fuera con su lector. Integrarlo dentro es post-MVP de complejidad media.
- **Validación cruzada con datos del PSCP** — antes de generar, verificar que el expediente sigue activo (evita generar para licitaciones anuladas/cerradas).
- **Sobre A multi-licitación batch** — generar varios Sobres A de golpe para licitaciones similares (útil para empresas que presentan a 5-10 por semana).
- **Notificaciones** cuando un Sobre A lleva >7 días sin "marcarse como presentado" en M6 — aviso de que se quedó en el tintero.
- **Migrar a Jinja2** — cuando el venv del proyecto pueda instalar dependencias (resolver el `pip` ausente actual). El generador es lo bastante grande como para que templates separados mejoren mantenibilidad.
