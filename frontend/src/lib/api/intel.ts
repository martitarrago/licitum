// API client para `/api/v1/intel/*` — motor de ganabilidad.
//
// Backend spec: docs/data-science/architecture.md sección 7.

const API_BASE = "";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type Confidence = "alta" | "media" | "baja" | "n/a";
export type DataQuality = "completa" | "parcial" | "faltante";

export interface SignalBreakdown {
  name: string;
  value: number;          // 0-1
  weight: number;         // 0-1
  contribution: number;   // value * weight * 100
  explanation: string;
  data_quality: DataQuality;
  data: Record<string, unknown>;
}

export interface HardFilter {
  name: string;
  fail: boolean;
  reason: string;
}

export interface ScoreCard {
  licitacion_id: string;
  score: number;
  confidence: Confidence;
  data_completeness_pct: number;
  expediente: string;
  titulo: string | null;
  organismo: string | null;
  organismo_id: string | null;
  importe_licitacion: number | null;
  fecha_limite: string | null;
  cpv_codes: string[];
  provincias: string[];
  semaforo: "verde" | "amarillo" | "rojo" | "gris";
  highlight: string | null;
}

export interface FeedItem extends ScoreCard {
  descartada: boolean;
  reason_descarte: string | null;
}

export interface ScoreDetail {
  score: number;
  confidence: Confidence;
  descartada: boolean;
  reason_descarte: string | null;
  data_completeness_pct: number;
  breakdown: SignalBreakdown[];
  hard_filters: HardFilter[];
  computed_at: string | null;
  licitacion: {
    expediente: string;
    titulo: string | null;
    organismo: string | null;
    importe_licitacion: number | null;
    fecha_limite: string | null;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ${r.statusText} en ${path}`);
  }
  return r.json();
}

function toQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

// ─── API ─────────────────────────────────────────────────────────────────────

export const intelApi = {
  /** Top N licitaciones para una empresa, no descartadas, ordenadas por score DESC. */
  topGanables: async (params: {
    empresa_id: string;
    limit?: number;
    min_score?: number;
  }): Promise<{ items: ScoreCard[]; count: number }> => {
    const q = toQuery({ ...params, limit: params.limit ?? 10, min_score: params.min_score ?? 0 });
    return fetchJSON(`/api/v1/intel/top-ganables?${q}`);
  },

  /** Feed paginado con score; sort por descartada ASC + score DESC. */
  feed: async (params: {
    empresa_id: string;
    min_score?: number;
    include_descartadas?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{
    items: FeedItem[];
    count: number;
    total: number;
    offset: number;
    limit: number;
  }> => {
    const q = toQuery({
      ...params,
      min_score: params.min_score ?? 0,
      include_descartadas: params.include_descartadas ?? false,
      limit: params.limit ?? 24,
      offset: params.offset ?? 0,
    });
    return fetchJSON(`/api/v1/intel/feed?${q}`);
  },

  /** Detalle del score con breakdown completo + hard filters. */
  scoreDetail: async (
    licitacion_id: string,
    empresa_id: string,
  ): Promise<ScoreDetail> => {
    const q = toQuery({ empresa_id });
    return fetchJSON(`/api/v1/intel/licitaciones/${licitacion_id}/score?${q}`);
  },
};
