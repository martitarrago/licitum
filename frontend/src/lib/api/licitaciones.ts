const API_BASE = "";

export type SemaforoType = "verde" | "amarillo" | "rojo" | "gris";

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
  created_at: string;
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

export interface ListLicitacionesParams {
  semaforo?: SemaforoType | null;
  tipo_contrato?: string | null;
  q?: string | null;
  page?: number;
  page_size?: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const licitacionesApi = {
  list(params: ListLicitacionesParams = {}): Promise<LicitacionListResponse> {
    const qs = new URLSearchParams();
    if (params.semaforo) qs.set("semaforo", params.semaforo);
    if (params.tipo_contrato) qs.set("tipo_contrato", params.tipo_contrato);
    if (params.q) qs.set("q", params.q);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    const query = qs.toString() ? `?${qs}` : "";
    return request(`/api/v1/licitaciones${query}`);
  },

  triggerIngesta(): Promise<IngestaTriggerResponse> {
    return request("/api/v1/licitaciones/ingestar", { method: "POST" });
  },
};
