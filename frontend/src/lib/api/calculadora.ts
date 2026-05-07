const API_BASE = "";

export interface TemerariaInfo {
  threshold_pct: number;
  metodo: string;
  confianza: "alta" | "media" | "baja";
  n_ofertas_supuesto: number;
}

export interface IntelInfo {
  n_obs: number;
  baja_avg_pct?: number | null;
  baja_median_pct?: number | null;
  baja_p90_pct?: number | null;
  ofertes_avg?: number | null;
}

export type PuntoLabel =
  | "conservadora"
  | "competitiva"
  | "saciedad"
  | "techo_legal";

export type ThresholdFuente = "pcap" | "lcsp_149" | "fallback";

export interface PuntoReferencia {
  label: PuntoLabel;
  pct: number;
  importe: number | null;
  es_default: boolean;
  es_temerario: boolean;
  descripcion: string;
}

export interface RecomendacionInfo {
  pct_sugerido: number | null;
  pct_sugerido_label: PuntoLabel | null;
  referencias: PuntoReferencia[];
  techo_temerario_pct: number | null;
  techo_temerario_fuente: ThresholdFuente | null;
  peso_precio_pct: number | null;
  razonamiento: string;
  advertencias: string[];
  confianza: "alta" | "media" | "baja" | "ninguna";
  // Legacy — mantenido para compat hasta migrar todo el panel.
  rango_optimo_min_pct: number | null;
  rango_optimo_max_pct: number | null;
}

export interface ContextoCalculadora {
  expediente: string;
  titulo: string | null;
  organismo: string | null;
  presupuesto_base: number | null;
  iva_pct: number | null;
  formula_tipo: string | null;
  formula_extracto: string | null;
  pct_criterios_objetivos: number | null;
  pct_criterios_subjetivos: number | null;
  baja_temeraria_extracto: string | null;
  umbral_saciedad_pct: number | null;
  plazo_ejecucion_meses: number | null;
  intel: IntelInfo;
  // null cuando no hay base ex-ante para estimar (sin ofertes, sin media).
  temeraria_estimada: TemerariaInfo | null;
  recomendacion: RecomendacionInfo;
}

export interface CalculoResultado {
  importe_ofertado: number;
  importe_iva: number | null;
  importe_total: number | null;
  puntos_estimados: number | null;
  puntos_max_referencia: number | null;
  diff_vs_baja_media: number | null;
  entra_en_temeraria: boolean;
  temeraria: TemerariaInfo | null;
  nivel_riesgo: "seguro" | "atencion" | "temerario" | "no_estimable";
  nota_riesgo: string;
}

export interface OfertaListItem {
  id: string;
  empresa_id: string;
  licitacion_id: string;
  expediente: string;
  presupuesto_base: string;
  baja_pct: string;
  importe_ofertado: string;
  entra_en_temeraria: boolean;
  temeraria_threshold_pct: string | null;
  created_at: string;
}

export interface OfertaRead extends OfertaListItem {
  html: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos_snapshot: Record<string, any>;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body === "object" && body !== null && "detail" in body) {
      return String(body.detail);
    }
    return JSON.stringify(body);
  } catch {
    return res.statusText;
  }
}

export const calculadoraApi = {
  contexto: async (expediente: string): Promise<ContextoCalculadora> => {
    const res = await fetch(
      `${API_BASE}/api/v1/oferta-economica/licitacion/${encodeURIComponent(
        expediente,
      )}/contexto`,
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  calcular: async (
    expediente: string,
    baja_pct: number,
    overrides?: { presupuesto_base?: number; iva_pct?: number },
  ): Promise<CalculoResultado> => {
    const res = await fetch(
      `${API_BASE}/api/v1/oferta-economica/licitacion/${encodeURIComponent(
        expediente,
      )}/calcular`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baja_pct, ...overrides }),
      },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  generar: async (
    expediente: string,
    empresa_id: string,
    baja_pct: number,
  ): Promise<OfertaRead> => {
    const res = await fetch(
      `${API_BASE}/api/v1/oferta-economica/licitacion/${encodeURIComponent(
        expediente,
      )}/generar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id, baja_pct }),
      },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  list: async (
    empresa_id: string,
    expediente?: string,
  ): Promise<OfertaListItem[]> => {
    const qs = new URLSearchParams({ empresa_id });
    if (expediente) qs.set("expediente", expediente);
    const res = await fetch(
      `${API_BASE}/api/v1/oferta-economica?${qs.toString()}`,
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  get: async (id: string): Promise<OfertaRead> => {
    const res = await fetch(`${API_BASE}/api/v1/oferta-economica/${id}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/v1/oferta-economica/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await readError(res));
  },

  docxUrl: (id: string): string =>
    `${API_BASE}/api/v1/oferta-economica/${id}/docx`,
};
