# Licitum — Design System

Referencia definitiva del sistema de diseño. Antes de crear cualquier
componente nuevo: leer este fichero + revisar `/frontend/src/components/ui/`.
No inventar estilos nuevos — extender los existentes.

---

## 1. Feeling y principios

- **Feeling:** editorial y limpio — B&N con acento naranja. Marca = negro.
- **Usuario:** jefe de obra o administrativo, 40–55 años, PYME 5–50 empleados
  de construcción (contexto catalán). Lenguaje `es-ES`.
- **Densidad útil sin agobio.** Dashboards con mucha información,
  pero el ojo debe localizar lo crítico en <1 segundo.
- **Información más importante siempre con doble cue visual**
  (posición + color; icono + texto). Nunca confiar solo en el color
  para transmitir estado.

---

## 2. Color

Todo el color vive en `frontend/tailwind.config.ts`. Nunca hardcodear hex
en componentes — usar siempre los tokens.

### 2.1 Primary — tinta negra (zinc)

Marca. `#18181B` como base (zinc-900). Botones, activos, marca.

| Token | Hex | Uso |
|---|---|---|
| `primary-50` | `#FAFAFA` | Fondos muy claros |
| `primary-100` | `#F4F4F5` | Fondos sutiles |
| `primary-200` | `#E4E4E7` | Estados secundarios |
| `primary-300` | `#D4D4D8` | Bordes suaves |
| `primary-400` | `#A1A1AA` | Texto deshabilitado |
| `primary-500` | `#18181B` | **Base** — botones, iconos activos |
| `primary-700` | `#09090B` | Hover de botones |
| `primary-900` | `#09090B` | Negro profundo |

**Regla de botones:** `bg-foreground text-surface` (invierte automáticamente en dark mode — negro en light, blanco en dark).

### 2.2 Accent — ámbar naranja

Acento de marca. **Máximo 1 aparición por pantalla** — logo dot y franja activa de sidebar únicamente. Nunca en botones ni como color dominante.

| Token | Hex | Uso |
|---|---|---|
| `accent-50` | `#FFFBEB` | Fondos muy tintados |
| `accent-100` | `#FEF3C7` | Badges informativos neutros |
| `accent-500` | `#F59E0B` | **Base** — CTAs secundarios, highlights |
| `accent-700` | `#B45309` | Hover del accent |
| `accent-900` | `#78350F` | Texto sobre fondo accent claro |

### 2.3 Neutrales — zinc (grises puros)

Base `zinc` de Tailwind — grises puros sin tinte (casa con la marca negra).
No usar `stone`, `slate` ni grises cálidos en componentes nuevos.

`neutral-50` `#FAFAFA` → `neutral-950` `#09090B` (escala completa 50–950).

### 2.4 Semáforo de solvencia — FIJOS, DECISIÓN CERRADA

Colores de producto. No cambiar sin confirmación del product owner.

| Token | Hex | Semántica |
|---|---|---|
| `success` | `#16A34A` | Verde — cumple solvencia |
| `warning` | `#EA580C` | Ámbar-naranja — solvencia ajustada |
| `danger`  | `#DC2626` | Rojo — no cumple solvencia |

También se usan como:
- `success` → estados positivos generales (guardado OK, validación correcta)
- `warning` → avisos no bloqueantes, fechas urgentes (≤7 días)
- `danger` → errores bloqueantes, cerrar/eliminar destructivo

### 2.5 Tokens semánticos — cambian en dark mode

Resuelven vía CSS variables en `globals.css`. Usar **siempre estos** para
superficies y textos; nunca `neutral-*` directamente en componentes.

| Token | Light | Dark | Uso |
|---|---|---|---|
| `surface` | `#FFFFFF` | `#0A0A0A` | Fondo de página |
| `surface-raised` | `#FAFAFA` | `#121212` | Cards, modales, dropdowns |
| `border` | `#E5E5E5` | `#262626` | Bordes y rings |
| `muted` | `#F5F5F5` | `#1A1A1A` | Fondos secundarios, chips |
| `muted-foreground` | `#707070` | `#999999` | Texto secundario, labels |
| `foreground` | `#171717` | `#F2F2F2` | Texto principal |

**Patrón de botón primario:** `bg-foreground text-surface` — invierte solo en light/dark automáticamente.

### 2.6 Uso de alpha con los tokens del semáforo

Patrón de badge / highlight con los colores del semáforo:

```
bg-{color}/10          → fondo tintado sutil (light mode)
dark:bg-{color}/20     → un poco más fuerte en dark para que respire
ring-{color}/25        → borde/ring del mismo color
text-{color}           → solo para iconos y elementos no-textuales
```

**Regla crítica del badge:** el texto del badge SIEMPRE va en
`text-muted-foreground`. Nunca en `text-success/warning/danger`. El color
lo aporta el icono + bg + ring. Así el badge se integra en el dashboard
sin gritar.

---

## 3. Tipografía

### 3.1 Familia

**Inter**, cargada vía `next/font/google` en `src/app/layout.tsx`.
Expuesta como `var(--font-inter)` y disponible como `font-sans`.

Razones: coincide con Notion (referente), legibilidad inmejorable en
tamaños pequeños (crítico para tablas), números tabulares nativos.

### 3.2 OpenType features

Activados globalmente en `<body>` (ver `globals.css`):

- `cv11` — `a` de una sola planta (forma más moderna y legible)
- `ss01` — disambigua `I / l / 1` (crítico en tablas de cifras y CPVs)

### 3.3 Números tabulares

**Obligatorio** en cualquier cifra que se apile verticalmente (importes,
fechas, días, porcentajes). Tres formas válidas:

```html
<td> ... </td>                     <!-- automático en <table> -->
<span class="tabular-nums"> ... </span>
<span class="font-variant-numeric: tabular-nums"> ... </span>
```

### 3.4 Escala y pesos usados

| Rol | Clases Tailwind |
|---|---|
| Título card | `text-base font-semibold leading-snug` |
| Título sección | `text-2xl font-semibold` |
| Dato numérico destacado | `text-lg font-semibold tabular-nums` |
| Body | `text-sm` (default) |
| Metadato / organismo | `text-sm text-muted-foreground` |
| Label de campo | `text-[11px] font-medium uppercase tracking-wider text-muted-foreground` |
| Chip / CPV | `text-xs font-mono text-muted-foreground` |
| Micro-copy (días restantes) | `text-xs tabular-nums` |

---

## 4. Iconografía

- **Librería única: `lucide-react`.** No instalar otros packs de iconos.
- Importar siempre por nombre, nunca con `*`:
  ```tsx
  import { CheckCircle2, Building2 } from "lucide-react";
  ```
- Tamaños estándar:
  - `h-3 w-3` (12px) — dentro de chips pequeños o labels
  - `h-3.5 w-3.5` (14px) — badges, inline con texto `text-sm`
  - `h-4 w-4` (16px) — botones, títulos de sección
- `aria-hidden="true"` en iconos puramente decorativos (la mayoría).
- El color lo gestiona el contenedor vía `currentColor`. Si el icono debe
  tener color distinto al texto adyacente, aplicar clase directa:
  `<Icon className="h-4 w-4 text-success" />`.

---

## 5. Dark mode

- **Estrategia:** class-based. Se activa añadiendo `.dark` al `<html>`.
  `darkMode: "class"` en `tailwind.config.ts`.
- **Los colores cambian solo vía los tokens semánticos** (`surface`,
  `border`, `muted`, `muted-foreground`, `foreground`). El resto
  (`primary`, `accent`, `success/warning/danger`) son fijos y se adaptan
  vía opacidad.
- **La calidez se mantiene en dark.** Los neutrales oscuros tienen el
  mismo tinte beige (hue 30°) que los claros — nunca navy frío.
- Al crear componente: si usas `bg-white` o `text-black` directamente,
  está mal. Usa `bg-surface-raised` y `text-foreground`.

---

## 6. Layout, espaciado y forma

### 6.1 Radius

| Elemento | Clase |
|---|---|
| Card, modal, panel grande | `rounded-xl` (12px) |
| Input, botón | `rounded-lg` (8px) — cuando se cree el botón |
| Chip / tag pequeño | `rounded-md` (6px) |
| Badge pill, avatar | `rounded-full` |

### 6.2 Elevación

- **Preferir `ring-1 ring-border` sobre `border`.** El ring no ocupa
  espacio del layout y se ve más limpio en cards.
- **Sombras:** `shadow-sm` por defecto, `hover:shadow-md` para cards
  interactivas. No usar sombras más pesadas.
- **Transiciones:** `transition-shadow` (y `transition-colors` si cambia
  de color). Evitar `transition-all` — caro y con side effects.

### 6.3 Espaciado dentro de cards

| Zona | Clase |
|---|---|
| Padding card | `p-5` (20px) |
| Gap entre secciones de la card | `gap-4` |
| Gap entre elementos de una sección | `space-y-1.5` a `space-y-2` |
| Separador de sección | `border-t border-border pt-4` |

### 6.4 Grid de cards

- Mobile: 1 columna
- Tablet: 2 columnas
- Desktop: 3 columnas
- Gap entre cards: `gap-5`

```tsx
<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
```

---

## 7. Localización (es-ES)

Todos los formateadores como `const` a nivel de módulo (instanciar una
vez, no dentro del render).

```ts
// Importes — euros, sin decimales
const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// Fechas largas
const fechaFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
```

Patrón para "días restantes" (ver `LicitacionCard`):
- `< 0` → "Cerrada"
- `0` → "Hoy"
- `1` → "Mañana"
- `> 1` → "En N días"

---

## 8. Patrones de componente

### 8.1 Card (referencia: `LicitacionCard.tsx`)

```
┌─[franja color]──────────────────────────┐
│                                          │
│  [Badge con estado]                      │
│                                          │
│  Título grande                           │
│  Metadato + icono                        │
│  ─────────────────────                   │
│  LABEL      │  LABEL                     │
│  Dato grande│  Dato grande + hint        │
│                                          │
│  [chip] [chip] [chip]                    │
└──────────────────────────────────────────┘
```

Reglas:
- `<article>` semántico.
- Franja superior de `w-2` hasta la 40% de su anchura en color sólido para el estado más
  importante (siempre visible sin leer).
- Badge con icono coloreado + label en `text-muted-foreground`.
- Separador horizontal entre cabecera y datos clave
  (`border-t border-border pt-4`).
- Datos numéricos en `tabular-nums`.
- Metadata (CPVs, tags) al final, en `font-mono text-xs` sobre `bg-muted`.

### 8.2 Badge de estado

```tsx
<div
  className={`
    inline-flex items-center gap-1.5
    rounded-full px-3 py-1
    text-xs font-semibold text-muted-foreground
    ring-1 ring-inset
    bg-{color}/10 ring-{color}/25 dark:bg-{color}/20
  `}
  role="status"
>
  <Icon className="h-3.5 w-3.5 text-{color}" aria-hidden="true" />
  Label en texto muted
</div>
```

### 8.3 Label pequeño en caps

Para encabezar campos de datos (Importe, Fecha límite, etc):

```tsx
<div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
  Importe
</div>
```

### 8.4 Chip / tag de metadata

Para códigos, CPVs, referencias:

```tsx
<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
  <Tag className="h-3 w-3" aria-hidden="true" />
  45212200-8
</span>
```

### 8.5 Truncación de texto

- Títulos multi-línea: `line-clamp-2` (máximo 2 líneas, ellipsis)
- Una sola línea en contenedor flex: `truncate` + `flex-shrink-0`
  en los hermanos fijos (iconos)

---

## 9. Regla crítica de producto

> **NUNCA guardar datos extraídos de PDF sin confirmación explícita
> del usuario.** El sistema propone. El usuario confirma. Sin bypass.

Traducido a UI: cualquier componente que muestre datos extraídos por IA
debe tener un estado visual de "propuesta pendiente de validación" claramente
diferenciado de "dato guardado". No se ha construido aún — diseñar cuando
toque el módulo de extracción.

---

## 10. Accesibilidad

- `<article>`, `<section>`, `<header>`, `<main>` semánticos.
- `role="status"` en badges de estado dinámico.
- `aria-hidden="true"` en iconos decorativos.
- `lang="es"` en `<html>`.
- Contraste: los tokens semánticos están calibrados para WCAG AA en ambos
  modos. Los colores del semáforo sobre `bg-surface` también pasan AA.
- Focus states: pendientes de definir cuando se creen inputs/botones.

---

## 11. Ficheros de referencia

| Fichero | Qué contiene |
|---|---|
| `frontend/tailwind.config.ts` | Paleta completa, tokens, fuentes |
| `frontend/src/app/globals.css` | CSS vars, dark mode, features tipográficas |
| `frontend/src/app/layout.tsx` | Carga de Inter, lang, metadata |
| `frontend/src/components/ui/LicitacionCard.tsx` | Componente de referencia canónico |
| `frontend/src/app/preview/page.tsx` | Scratchpad visual (solo dev) |
| `CLAUDE.md` (raíz) | Contexto de producto + decisiones cerradas |

---

## 12. Do / Don't

### ✅ Do
- Usar tokens semánticos (`bg-surface`, `text-foreground`) siempre.
- Soportar dark mode desde el primer commit del componente.
- Tabular-nums en cualquier cifra apilable.
- Doble cue visual para estados críticos (posición + color + texto/icono).
- `lucide-react` para todo icono.
- `<article>`/`<section>` semánticos, `aria-hidden` en iconos decorativos.

### ❌ Don't
- Hex hardcoded fuera de `tailwind.config.ts`.
- Colores cálidos (`stone`, warm grays) — la base es zinc puro.
- Azul o cualquier color de marca ajeno al sistema (solo negro + naranja acento).
- Naranja en más de un elemento por pantalla.
- Texto del badge en color del semáforo — siempre `text-muted-foreground`.
- Iconos de otros packs (Heroicons, React-Icons, Font Awesome…).
- `transition-all`.
- Formatters de `Intl` dentro del render — declararlos a nivel módulo.
- Crear componente nuevo sin revisar `components/ui/` y este fichero.
- Modificar los hex del semáforo sin confirmación del PO.
