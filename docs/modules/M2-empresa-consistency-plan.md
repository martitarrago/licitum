# M2 Empresa — Plan de consistencia (2026-04-29)

Plan ordenado para resolver inconsistencias detectadas en la sección "Mi empresa".
Cubre datos, motor de scoring, M3 pliegos, copy y layout. Cada fase es entregable
independiente — pausable entre fases.

**Convención de propietarios**: ⚙ = sesión de motor de scoring · 🎨 = sesión de
M2/frontend/copy. Algunas fases son mixtas y requieren coordinación explícita.

---

## Diagnóstico — inconsistencias detectadas

### A. Datos / fuentes de verdad
1. **Volumen anual: dos cifras con el mismo nombre.** `anualidad_media`
   (calculada desde certificados, técnica art. 88) vs `volumen_negocio_n/n1/n2`
   (manual, económica art. 87). El copy ya está parcialmente arreglado tras
   2026-04-29.
2. **Clasificaciones: ROLECE manual + RELIC automático sin reconciliación.** Dos
   pestañas con datos potencialmente solapados; sin merge ni prioridad
   declarada. El motor usa el semáforo precalculado del Radar — no es obvio en
   UI ni en datos qué fuente lo construye.
3. **Label engañoso "Desglose por grupo ROLECE"** en `SolvenciaResumen.tsx:138`.
   No es ROLECE oficial: es agrupación de `importe_adjudicacion` de
   certificados por `clasificacion_grupo` propio del certificado.
4. **`direccion_provincia` libre en `/empresa/perfil` vs centroid catalán
   uppercase en motor.** `_PROVINCIA_CENTROID` (`empresa_context.py:286`) solo
   mapea BARCELONA/GIRONA/LLEIDA/TARRAGONA. Si el usuario escribe "Barcelona"
   (lowercase) o "Bcn", la señal geográfica del scoring colapsa a 0.5
   silenciosamente.
5. **Geografía con dos fuentes de verdad.** Distancia del scoring usa
   `direccion_provincia` (perfil); preferencias de territorio
   (`/empresa/preferencias`) declaran qué provincias prefiere. Pueden no
   coincidir y la UI no avisa.

### B. M2 ↔ motor ↔ M3
6. **Motor NO consume `volumen_negocio_n/n1/n2`.** Pero
   `recomendacion_evaluator.py:107-126` (M3 pliegos) sí. Resultado: Radar y M3
   pueden dar veredictos contradictorios sobre la misma empresa.
7. **`compute_empresa_context_hash` (`empresa_context.py:216`) no incluye
   volúmenes ni `plantilla_media`.** Cambios en perfil no invalidan los scores
   cacheados. Inocuo hoy (no se usan); bug latente cuando entren.
8. **`tamano_pyme` se edita en perfil pero scoring no lo usa.** Campo huérfano
   sin destino claro.
9. **Bug `_anualidad_media`** (`empresa_context.py:118-125`) — lee
   `importe_anualizado`/`importe` que no existen en `CertificadoObra`. Campo
   real es `importe_adjudicacion` (visto en `certificados.py:296`). Resultado:
   `anualidad_media` siempre `None` → hard filter de solvencia siempre pasa.
   Además, fórmula no unificada con `/resumen-solvencia` (`max` vs `total/5`).

### C. Layout / UX
10. **Headers desiguales entre subsecciones** de "Mi empresa":
    | Ruta | h1 visible | Dónde |
    |---|---|---|
    | `/empresa/solvencia/*` | "solvencia" display-h | layout |
    | `/empresa/recursos/*` | "recursos" display-h | layout |
    | `/empresa/preferencias` | "preferencias" display-h | page |
    | `/empresa/perfil` | **ninguno** | — |
    | `/empresa/documentos` | **ninguno** | — |
11. **Sidebar dice "Identidad"** pero `/empresa/perfil` cubre identificación +
    dirección + representante + poder + SS + volumen de negocio + plantilla.
    Nombre del menú no refleja el contenido.
12. **`/empresa/perfil` es scroll lineal de 7 secciones**, sin TOC ni sticky
    nav. Datos del poder se editan una vez en la vida; volumen de negocio cada
    año.
13. **`/empresa/preferencias` mete su h1 en page**, no en layout
    (inconsistencia técnica menor).
14. **`/empresa/recursos` (Resumen) muestra 4 KPIs con `—` permanente** —
    pseudo-empty state que parece roto.
15. **Tabs de `/empresa/solvencia` no se entienden si llegas frío.** Resumen |
    Certificados | Clasificaciones | RELIC — falta intro de qué hace cada uno.

### D. Contradicciones de copy
16. **`/empresa/solvencia` layout** dice "Filtro hard del motor de match
    (clasificación + volumen)". El motor no usa el volumen del perfil. Promesa
    rota.
17. **`/empresa/preferencias` header** dice "Es el ranking del motor de match
    (no los filtros hard)". Pero dentro: capacidad operativa, presupuesto y
    estado_aceptacion son hard filters. Contradicción.
18. **`/empresa/recursos`** se vende como input del Sobre B (M5), aún no
    existe. Deuda visible — aceptable si dura poco.

---

## Plan de ejecución

### Fase 1 — Bugs silenciosos del motor ⚙

**Por qué primero**: el motor está dando scores incorrectos hoy y nadie lo nota.

- [x] **1.1** Fix `_anualidad_media` (commit `302463a`). Usa
      `importe_adjudicacion`, aplica `porcentaje_ute`, fórmula unificada
      `total/5` con `/resumen-solvencia`.
- [x] **1.2** Hash incluye `volumen_negocio_n/n1/n2` + `plantilla_media`
      (commit `3d86cca`). Cambios en perfil M2 invalidan scores cacheados.
- [x] **1.3** Decisión: `tamano_pyme` queda como atributo descriptivo del
      modelo (perfil/dashboards) pero NO entra al `EmpresaStaticProfile` ni al
      motor — es derivado de volumen+plantilla, duplicaría info y crearía
      ruido en bordes (commit `3d86cca`).

**Resultado**: motor coherente con datos reales de empresa.

---

### Fase 2 — Inputs que rompen el motor sin avisar 🎨 + ⚙

**Por qué**: hoy el usuario escribe "Bcn" y el scoring colapsa la señal
geográfica a 0.5 sin decírselo.

- [x] **2.1** 🎨 `direccion_provincia` → dropdown CustomSelect con código
      provincia (frontend `/empresa/perfil`). Cuando el usuario elige una
      provincia, se setean simultáneamente `direccion_provincia_codigo` (INE)
      y `direccion_provincia` (label) para no romper el DEUC.
- [x] **2.2** 🎨 Backend: migración `0022_empresa_provincia_codigo.py` —
      añade `direccion_provincia_codigo` (varchar(2), nullable) con backfill
      desde el texto libre (mapeo case-insensitive con variantes). Modelo +
      schema + API actualizados. Ya aplicada en local; queda pendiente
      ejecutarla en Railway.
- [x] **2.3** Motor lee `direccion_provincia_codigo` (commit `3d86cca`).
      `_PROVINCIA_CENTROID` migrado a códigos INE ("08"/"17"/"25"/"43"…).
      `_evaluar_geografia` y `EmpresaStaticProfile` usan códigos.
- [ ] **2.4** 🎨 Banner suave en `/empresa/preferencias` cuando la sede no
      aparece como territorio "preferida"/"ok": *"Tu sede está en Tarragona
      pero no la has marcado como territorio preferido — ¿es intencional?"*
      Pendiente — depende de UX más fina; no bloqueante.

**Resultado**: el motor recibe geografía consistente; el usuario no introduce
datos rotos en silencio.

---

### Fase 3 — Veredictos contradictorios M3 ↔ motor 🎨 + ⚙

**Por qué**: hoy un mismo pliego puede dar score alto en Radar y "no_ir" en M3.
Confunde y mata confianza.

- [x] **3.1** Decisión: opción **A** — motor adopta volumen de negocio como
      hard filter económico. M3 y motor leen la misma fuente.
- [x] **3.2** Implementado en commit `3d86cca`. Motor + M3 evaluator
      consistentes sobre solvencia económica.

**Resultado**: Radar y M3 hablan el mismo idioma sobre la misma licitación.

---

### Fase 4 — Copy contradictorio (rápido, alto ROI) 🎨

**Por qué**: 15 minutos elimina 3 mentiras en la UI.

- [x] **4.1** `/empresa/solvencia` layout — quitar "(clasificación + volumen)"
      hasta Fase 3. Texto: *"Filtro hard del motor (clasificación) + bloque IV
      del DEUC. El volumen de negocio se declara en Identidad."*
- [x] **4.2** `/empresa/preferencias` header — *"Lo que te interesa y lo que
      aceptas. Mezcla hard filters (capacidad, presupuesto, estado) y soft
      (territorios, CPVs)."*
- [x] **4.3** Tabs de `/empresa/solvencia` — descripción explícita en cada
      subpágina (manuales en clasificaciones, sync en RELIC).

---

### Fase 5 — Layout uniforme entre subsecciones 🎨

**Por qué**: todas las subsecciones de "Mi empresa" deben sentirse del mismo
nivel jerárquico.

- [x] **5.1** Crear `/empresa/perfil/layout.tsx` con h1 "empresa" + descripción
      (paralelo a solvencia/recursos).
- [x] **5.2** Crear `/empresa/documentos/layout.tsx` con h1 "documentación".
- [x] **5.3** Mover h1 de `/empresa/preferencias/page.tsx` a un `layout.tsx`.
- [x] **5.4** Renombrar "Identidad" → "Empresa" en `modules.ts:103`.
- [x] **5.5** `/empresa/recursos` Resumen — KPIs ahora muestran conteo real
      desde APIs (personal/maquinaria/sistemas/destacadas) con CTAs
      contextuales según vacío/poblado.

**Resultado**: navegar entre subsecciones se siente uniforme; sidebar refleja
contenido.

---

### Fase 6 — Reconciliación de fuentes paralelas 🎨

**Por qué**: hoy ROLECE manual y RELIC viven en pestañas separadas; el usuario
no sabe cuál pesa.

- [x] **6.1** Vista unificada en `/empresa/solvencia/clasificaciones`:
      - Tabla manual con columna "Fuente" — muestra badge "Manual" + "RELIC"
        cuando la clasificación está en ambas fuentes (match por
        grupo+subgrupo+categoria).
      - Sección secundaria "Cobertura adicional vía RELIC" lista las
        clasificaciones que están solo en RELIC (sin equivalente manual).
      - Pestaña RELIC mantiene listado como "vista de auditoría tras sync"
        con cross-link a Clasificaciones para gestión.
- [x] **6.2** Renombrar "Desglose por grupo ROLECE" → "Obra ejecutada por
      grupo" en `SolvenciaResumen.tsx`.

**Resultado**: el usuario ve una sola "verdad" de clasificaciones; RELIC es
canal de origen, no duplicado.

---

### Fase 7 — Reestructurar `/empresa/perfil` 🎨

**Por qué**: hoy son 7 secciones en scroll lineal; el usuario que solo quiere
actualizar el volumen anual scrollea 4 pantallas.

- [x] **7.1** Convertir secciones en accordion:
      - Identificación (CIF, IAE, CNAE, tamaño) ✅ open
      - Dirección ✅ open
      - Representante legal y poder (merge de las dos secciones previas) ✅ open
      - Seguridad Social ✅ closed
      - Solvencia económica (vol. negocio + plantilla) ✅ closed
- [x] **7.2** Indicador "% rellenado" por accordion item — dot color-coded
      (success/warning/muted) + porcentaje tabular en cabecera.

**Resultado**: edición focalizada; el usuario sabe qué le falta.

---

### Fase 8 — Onboarding y resumen 🎨 + ⚙

**Por qué**: hoy un cliente nuevo no tiene guía. Memoria del proyecto:
"MVP estrecho primero, magia después" — esto es magia, va al final.

- [x] **8.1** Página `/empresa` (resumen agregado) creada con KPIs cruzados:
      - % perfil completo calculado client-side (mismas reglas que la
        accordion de `/empresa/perfil`) con desglose por sección
      - Card solvencia técnica (anualidad media + nº certificados)
      - Card solvencia económica (vol. negocio máx + plantilla media)
      - Card clasificaciones efectivas (manual + RELIC + a caducar)
      - Card salud documental (% + a caducar/caducados)
      - Card preferencias (estado, presupuesto, territorios, CPV core, UTE)
      - Card recursos (placeholder con CTA a Sobre B M5)
      - Sidebar: nueva entrada "Resumen" → `/empresa` (Identidad vuelve a su
        nombre original al ser hijo de "Resumen").
- [ ] **8.2** Wizard de onboarding — pospuesto. La página `/empresa` ya cubre
      la función de "qué te falta y dónde rellenarlo" con CTAs por card. Si
      pilotos lo piden, retomar.
- [ ] **8.3** Autocompletar desde CIF + nº registral — bloqueado por
      integración Insight View (no existe aún). El copy actual ya lo promete
      como pendiente.

**Resultado**: cliente nuevo tiene perfil al 80% en 10 minutos.

---

## Coordinación entre sesiones

| Fase | ⚙ Scoring | 🎨 M2/frontend | Dependencia |
|---|---|---|---|
| 1 | 1.1, 1.2, 1.3 | — | bloquea 3 |
| 2 | 2.3 | 2.1, 2.2, 2.4 | tras 1 |
| 3 | 3.1, 3.2 (composite) | 3.2 (evaluator) | tras 1, 2 |
| 4 | — | 4.1, 4.2, 4.3 | independiente |
| 5 | — | 5.1-5.5 | independiente |
| 6 | — | 6.1, 6.2 | independiente |
| 7 | — | 7.1, 7.2 | independiente |
| 8 | hash en 1.2 reutilizable | 8.1-8.3 | tras 1-7 |

Las fases 4, 5, 6, 7 son independientes del scoring — pueden hacerse en
paralelo a 1-3.
