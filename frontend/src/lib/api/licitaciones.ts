const API_BASE = "";

// ─── Vocabularios cerrados (sincronizados con whitelists del backend) ────────

export type SemaforoType = "verde" | "amarillo" | "rojo" | "gris";

export type Provincia = "barcelona" | "girona" | "lleida" | "tarragona";

export const PROVINCIAS: Provincia[] = ["barcelona", "girona", "lleida", "tarragona"];

export const PROVINCIAS_LABEL: Record<Provincia, string> = {
  barcelona: "Barcelona",
  girona: "Girona",
  lleida: "Lleida",
  tarragona: "Tarragona",
};

export type TipoOrganismo =
  | "ayuntamiento"
  | "diputacio"
  | "consell_comarcal"
  | "universidad"
  | "generalitat"
  | "otros";

export const TIPOS_ORGANISMO: TipoOrganismo[] = [
  "ayuntamiento",
  "diputacio",
  "consell_comarcal",
  "universidad",
  "generalitat",
  "otros",
];

export const TIPOS_ORGANISMO_LABEL: Record<TipoOrganismo, string> = {
  ayuntamiento: "Ayuntamientos",
  diputacio: "Diputaciones",
  consell_comarcal: "Consells comarcals",
  universidad: "Universidades",
  generalitat: "Generalitat",
  otros: "Otros (consorcios, fundaciones…)",
};

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface LicitacionRead {
  id: string;
  expediente: string;
  titulo: string | null;
  organismo: string | null;
  importe_licitacion: string | null;
  fecha_publicacion: string | null;
  fecha_limite: string | null;
  cpv_codes: string[];
  tipo_contrato: string | null;
  tipo_procedimiento: string | null;
  clasificacion_requerida: string | null;
  url_placsp: string | null;
  semaforo: SemaforoType;
  semaforo_razon: string | null;
  provincias: Provincia[];
  tipo_organismo: TipoOrganismo | null;
  score_afinidad: string | null;
  /** Puntuación 0-100 del motor de ganabilidad. null si aún no scoreada. */
  score: number | null;
  /** true si el motor descartó por hard-filter (clasificación, etc.). */
  descartada: boolean | null;
  /** Estado del análisis IA del pliego (M3 Phase 2). */
  pliego_estado: PliegoEstado | null;
  /** Veredicto del recomendacion_evaluator si pliego analizado. */
  pliego_veredicto: PliegoVeredicto | null;
  created_at: string;
}

export type PliegoEstado =
  | "pendiente"
  | "procesando"
  | "completado"
  | "fallido"
  | "documento_no_disponible";

export type PliegoVeredicto = "ir" | "ir_con_riesgo" | "no_ir" | "incompleto";

export interface LicitacionDetail extends LicitacionRead {
  organismo_id: string | null;
  importe_presupuesto_base: string | null;
  raw_data: {
    fuente?: string;
    tipus_contracte_cat?: string | null;
    nom_ambit?: string | null;
    nom_departament_ens?: string | null;
    lloc_execucio?: string | null;
    codi_nuts?: string | null;
    durada_contracte?: string | null;
    tipus_tramitacio?: string | null;
    valor_estimat_contracte?: string | null;
    numero_lot?: string | null;
    descripcio_lot?: string | null;
    [k: string]: unknown;
  };
}

export interface LicitacionListResponse {
  items: LicitacionRead[];
  total: number;
  page: number;
  page_size: number;
}

export interface IngestaTriggerResponse {
  task_id: string;
  message: string;
}

// ─── Query params ────────────────────────────────────────────────────────────

export type OrderBy =
  | "score"
  | "score_asc"
  | "fecha_limite_asc"
  | "fecha_limite_desc"
  | "importe_desc"
  | "importe_asc"
  | "publicacion_desc"
  | "publicacion_asc";

export interface ListLicitacionesParams {
  semaforo?: SemaforoType | null;
  tipo_contrato?: string | null;
  provincia?: Provincia[] | null;
  tipo_organismo?: TipoOrganismo[] | null;
  importe_min?: number | null;
  importe_max?: number | null;
  plazo_min_dias?: number | null;
  plazo_max_dias?: number | null;
  cpv_prefix?: string | null;
  q?: string | null;
  order_by?: OrderBy | null;
  empresa_id?: string | null;
  incluye_descartadas?: boolean | null;
  min_score?: number | null;
  max_score?: number | null;
  page?: number;
  page_size?: number;
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function buildQS(params: ListLicitacionesParams): string {
  const qs = new URLSearchParams();
  if (params.semaforo) qs.set("semaforo", params.semaforo);
  if (params.tipo_contrato) qs.set("tipo_contrato", params.tipo_contrato);
  if (params.provincia && params.provincia.length > 0) {
    for (const p of params.provincia) qs.append("provincia", p);
  }
  if (params.tipo_organismo && params.tipo_organismo.length > 0) {
    for (const t of params.tipo_organismo) qs.append("tipo_organismo", t);
  }
  if (params.importe_min != null) qs.set("importe_min", String(params.importe_min));
  if (params.importe_max != null) qs.set("importe_max", String(params.importe_max));
  if (params.plazo_min_dias != null) qs.set("plazo_min_dias", String(params.plazo_min_dias));
  if (params.plazo_max_dias != null) qs.set("plazo_max_dias", String(params.plazo_max_dias));
  if (params.cpv_prefix) qs.set("cpv_prefix", params.cpv_prefix);
  if (params.q) qs.set("q", params.q);
  if (params.order_by) qs.set("order_by", params.order_by);
  if (params.empresa_id) qs.set("empresa_id", params.empresa_id);
  if (params.incluye_descartadas != null) qs.set("incluye_descartadas", String(params.incluye_descartadas));
  if (params.min_score != null) qs.set("min_score", String(params.min_score));
  if (params.max_score != null) qs.set("max_score", String(params.max_score));
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  return qs.toString();
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const licitacionesApi = {
  list(params: ListLicitacionesParams = {}): Promise<LicitacionListResponse> {
    const qs = buildQS(params);
    return apiFetch(`/api/v1/licitaciones${qs ? `?${qs}` : ""}`);
  },

  get(expediente: string): Promise<LicitacionDetail> {
    return apiFetch(`/api/v1/licitaciones/${encodeURIComponent(expediente)}`);
  },

  triggerIngesta(): Promise<IngestaTriggerResponse> {
    return apiFetch("/api/v1/licitaciones/ingestar", { method: "POST" });
  },

  triggerRecalcularSemaforo(): Promise<IngestaTriggerResponse> {
    return apiFetch("/api/v1/licitaciones/recalcular-semaforo", { method: "POST" });
  },
};
