"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PROVINCIAS,
  TIPOS_ORGANISMO,
  type Provincia,
  type SemaforoType,
  type TipoOrganismo,
} from "@/lib/api/licitaciones";

/**
 * Estado del Radar serializado en la URL.
 *
 * Toda la página del Radar lee y escribe sus filtros desde aquí — no hay
 * estado local paralelo. Eso permite:
 *  - compartir un enlace con los mismos filtros aplicados,
 *  - usar el botón atrás del navegador,
 *  - sobrevivir a recargas,
 *  - migrar en el futuro a `empresas.filtros_radar` JSONB sin reescribir UI.
 */
// El usuario controla criterio y dirección por separado en la UI: dropdown
// con criterios + flecha clicable. Internamente lo serializamos a un único
// string para el backend (compatible con OrderBy del API).

export type OrderCriterion = "puntuacion" | "plazo" | "importe" | "publicacion";
export type OrderDir = "asc" | "desc";

export type OrderBy =
  | "score"
  | "score_asc"
  | "fecha_limite_asc"
  | "fecha_limite_desc"
  | "importe_desc"
  | "importe_asc"
  | "publicacion_desc"
  | "publicacion_asc";

export const ORDER_CRITERION_LABEL: Record<OrderCriterion, string> = {
  puntuacion: "Puntuación",
  plazo: "Plazo de presentación",
  importe: "Importe",
  publicacion: "Publicación",
};

export const ORDER_CRITERION_OPTIONS: OrderCriterion[] = [
  "puntuacion",
  "plazo",
  "importe",
  "publicacion",
];

export const ORDER_DEFAULT_DIR: Record<OrderCriterion, OrderDir> = {
  // Naturalmente lo más útil cuando se elige el criterio:
  puntuacion: "desc",  // mejor primero
  plazo: "asc",        // cierra antes
  importe: "desc",     // más caro primero (oportunidades grandes)
  publicacion: "desc", // más recientes
};

/** Serializa (criterio, dir) → string del backend. */
export function composeOrderBy(c: OrderCriterion, d: OrderDir): OrderBy {
  if (c === "puntuacion") return d === "asc" ? "score_asc" : "score";
  if (c === "plazo") return d === "asc" ? "fecha_limite_asc" : "fecha_limite_desc";
  if (c === "importe") return d === "asc" ? "importe_asc" : "importe_desc";
  return d === "asc" ? "publicacion_asc" : "publicacion_desc";
}

/** Inverso: parsea el string del backend a (criterio, dir). */
export function decomposeOrderBy(o: OrderBy): { criterion: OrderCriterion; dir: OrderDir } {
  switch (o) {
    case "score":             return { criterion: "puntuacion", dir: "desc" };
    case "score_asc":         return { criterion: "puntuacion", dir: "asc" };
    case "fecha_limite_asc":  return { criterion: "plazo",      dir: "asc" };
    case "fecha_limite_desc": return { criterion: "plazo",      dir: "desc" };
    case "importe_desc":      return { criterion: "importe",    dir: "desc" };
    case "importe_asc":       return { criterion: "importe",    dir: "asc" };
    case "publicacion_desc":  return { criterion: "publicacion", dir: "desc" };
    case "publicacion_asc":   return { criterion: "publicacion", dir: "asc" };
  }
}

// ─── Tier de puntuación (filtro) ────────────────────────────────────────────

export type Tier = "todas" | "excelente" | "buena" | "raso" | "no_apta";

export const TIER_LABEL: Record<Tier, string> = {
  todas: "Todas",
  excelente: "Excelente",
  buena: "Buena",
  raso: "Aprobada raso",
  no_apta: "No apta",
};

export const TIER_DOT: Record<Tier, string> = {
  todas: "bg-muted-foreground/40",
  excelente: "bg-info",
  buena: "bg-success",
  raso: "bg-warning",
  no_apta: "bg-danger",
};

/** Traduce un tier a (min_score, max_score) para el backend.
 *  Umbrales sincronizados con LicitacionCard.scoreTone — recalibrados tras
 *  suavizado de buckets continuos. */
export function tierToScoreRange(t: Tier): { min: number | null; max: number | null } {
  switch (t) {
    case "excelente": return { min: 80, max: null };
    case "buena":     return { min: 65, max: 79 };
    case "raso":      return { min: 50, max: 64 };
    case "no_apta":   return { min: null, max: 49 };
    default:          return { min: null, max: null };
  }
}

export interface RadarFilters {
  semaforo: SemaforoType | "todos";  // legacy — ya no se renderiza, mantengo por URL backwards-compat
  tier: Tier;
  tipo_contrato: string | null;
  provincia: Provincia[];
  tipo_organismo: TipoOrganismo[];
  importe_min: number | null;
  importe_max: number | null;
  plazo_min_dias: number | null;
  plazo_max_dias: number | null;
  cpv_prefix: string | null;
  q: string;
  /** true → solo licitaciones marcadas como favoritas. */
  solo_favoritos: boolean;
  order_by: OrderBy;
  page: number;
}

const SEMAFOROS_VALIDOS = new Set<RadarFilters["semaforo"]>([
  "todos",
  "verde",
  "amarillo",
  "rojo",
  "gris",
]);
const TIERS_VALIDOS = new Set<Tier>(["todas", "excelente", "buena", "raso", "no_apta"]);
const PROVINCIAS_SET = new Set<Provincia>(PROVINCIAS);
const TIPOS_ORGANISMO_SET = new Set<TipoOrganismo>(TIPOS_ORGANISMO);
const ORDER_BY_SET = new Set<OrderBy>([
  "score", "score_asc",
  "fecha_limite_asc", "fecha_limite_desc",
  "importe_desc", "importe_asc",
  "publicacion_desc", "publicacion_asc",
]);

const DEFAULT_FILTERS: RadarFilters = {
  semaforo: "todos",
  tier: "todas",
  tipo_contrato: null,
  provincia: [],
  tipo_organismo: [],
  importe_min: null,
  importe_max: null,
  plazo_min_dias: null,
  plazo_max_dias: null,
  cpv_prefix: null,
  q: "",
  solo_favoritos: false,
  order_by: "score",
  page: 1,
};

// ─── Parseo URL → estado ─────────────────────────────────────────────────────

function parseInt0(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseEnumList<T extends string>(
  values: string[],
  validSet: Set<T>,
): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const v of values) {
    const k = v.trim().toLowerCase() as T;
    if (validSet.has(k) && !seen.has(k)) {
      out.push(k);
      seen.add(k);
    }
  }
  return out;
}

function parseFiltersFromSearchParams(sp: URLSearchParams): RadarFilters {
  const semaforoRaw = sp.get("semaforo") ?? "todos";
  const semaforo = SEMAFOROS_VALIDOS.has(semaforoRaw as RadarFilters["semaforo"])
    ? (semaforoRaw as RadarFilters["semaforo"])
    : "todos";

  const provincia = parseEnumList(sp.getAll("provincia"), PROVINCIAS_SET);
  const tipo_organismo = parseEnumList(sp.getAll("tipo_organismo"), TIPOS_ORGANISMO_SET);

  const cpvRaw = sp.get("cpv_prefix");
  const cpv_prefix = cpvRaw && /^[0-9-]{1,16}$/.test(cpvRaw) ? cpvRaw : null;

  const page = Math.max(1, parseInt0(sp.get("page")) ?? 1);

  const orderRaw = sp.get("order_by");
  const order_by: OrderBy = orderRaw && ORDER_BY_SET.has(orderRaw as OrderBy)
    ? (orderRaw as OrderBy)
    : "score";

  const tierRaw = sp.get("tier");
  const tier: Tier = tierRaw && TIERS_VALIDOS.has(tierRaw as Tier)
    ? (tierRaw as Tier)
    : "todas";

  return {
    semaforo,
    tier,
    tipo_contrato: sp.get("tipo_contrato") || null,
    provincia,
    tipo_organismo,
    importe_min: parseInt0(sp.get("importe_min")),
    importe_max: parseInt0(sp.get("importe_max")),
    plazo_min_dias: parseInt0(sp.get("plazo_min_dias")),
    plazo_max_dias: parseInt0(sp.get("plazo_max_dias")),
    cpv_prefix,
    q: sp.get("q") ?? "",
    solo_favoritos: sp.get("solo_favoritos") === "1",
    order_by,
    page,
  };
}

// ─── Estado → URL ────────────────────────────────────────────────────────────

function filtersToSearchParams(f: RadarFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.semaforo && f.semaforo !== "todos") sp.set("semaforo", f.semaforo);
  if (f.tier && f.tier !== "todas") sp.set("tier", f.tier);
  if (f.tipo_contrato) sp.set("tipo_contrato", f.tipo_contrato);
  for (const p of f.provincia) sp.append("provincia", p);
  for (const t of f.tipo_organismo) sp.append("tipo_organismo", t);
  if (f.importe_min != null) sp.set("importe_min", String(f.importe_min));
  if (f.importe_max != null) sp.set("importe_max", String(f.importe_max));
  if (f.plazo_min_dias != null) sp.set("plazo_min_dias", String(f.plazo_min_dias));
  if (f.plazo_max_dias != null) sp.set("plazo_max_dias", String(f.plazo_max_dias));
  if (f.cpv_prefix) sp.set("cpv_prefix", f.cpv_prefix);
  if (f.q) sp.set("q", f.q);
  if (f.solo_favoritos) sp.set("solo_favoritos", "1");
  if (f.order_by && f.order_by !== "score") sp.set("order_by", f.order_by);
  if (f.page > 1) sp.set("page", String(f.page));
  return sp;
}

// ─── activeCount: nº de "facetas" no en valor por defecto ─────────────────────

function countActive(f: RadarFilters): number {
  let n = 0;
  if (f.tier !== "todas") n++;
  if (f.tipo_contrato) n++;
  if (f.provincia.length > 0) n++;
  if (f.tipo_organismo.length > 0) n++;
  if (f.importe_min != null || f.importe_max != null) n++;
  if (f.plazo_min_dias != null || f.plazo_max_dias != null) n++;
  if (f.cpv_prefix) n++;
  if (f.q) n++;
  if (f.solo_favoritos) n++;
  return n;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseRadarFiltersReturn {
  filters: RadarFilters;
  setFilter: <K extends keyof RadarFilters>(key: K, value: RadarFilters[K]) => void;
  patchFilters: (patch: Partial<RadarFilters>) => void;
  clearFilters: () => void;
  clearFilter: (key: keyof RadarFilters) => void;
  activeCount: number;
}

export function useRadarFilters(): UseRadarFiltersReturn {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseFiltersFromSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const writeFilters = useCallback(
    (next: RadarFilters) => {
      const qs = filtersToSearchParams(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const patchFilters = useCallback(
    (patch: Partial<RadarFilters>) => {
      // Cualquier cambio que no sea de paginación resetea page=1.
      const resetsPage = !("page" in patch);
      writeFilters({
        ...filters,
        ...patch,
        ...(resetsPage ? { page: 1 } : {}),
      });
    },
    [filters, writeFilters],
  );

  const setFilter = useCallback(
    <K extends keyof RadarFilters>(key: K, value: RadarFilters[K]) => {
      patchFilters({ [key]: value } as Partial<RadarFilters>);
    },
    [patchFilters],
  );

  const clearFilter = useCallback(
    (key: keyof RadarFilters) => {
      patchFilters({ [key]: DEFAULT_FILTERS[key] } as Partial<RadarFilters>);
    },
    [patchFilters],
  );

  const clearFilters = useCallback(() => {
    writeFilters(DEFAULT_FILTERS);
  }, [writeFilters]);

  const activeCount = useMemo(() => countActive(filters), [filters]);

  return { filters, setFilter, patchFilters, clearFilters, clearFilter, activeCount };
}

// Re-export para tests/consumidores externos del default.
export { DEFAULT_FILTERS };
