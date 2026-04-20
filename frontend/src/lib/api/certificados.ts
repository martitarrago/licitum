const API_BASE = "";

export type EstadoCertificado =
  | "pendiente_revision"
  | "procesando"
  | "validado"
  | "rechazado";

export interface ExtractedData {
  importe_adjudicacion: number | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  organismo: string | null;
  cpv_codes: string[];
  clasificacion_grupo: string | null;
  clasificacion_subgrupo: string | null;
  numero_expediente: string | null;
  confianza_extraccion: number;
  /** Confianza por campo — opcional, para cuando el backend lo soporte */
  confianza_campos?: Partial<Record<string, number>>;
}

export interface CertificadoObraListItem {
  id: string;
  empresa_id: string;
  titulo: string;
  organismo: string;
  importe_adjudicacion: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_expediente: string;
  cpv_codes: string[];
  clasificacion_grupo: string | null;
  clasificacion_subgrupo: string | null;
  pdf_url: string;
  estado: EstadoCertificado;
  created_at: string;
  updated_at: string;
}

export interface CertificadoObraRead extends CertificadoObraListItem {
  extracted_data: Partial<ExtractedData>;
}

export interface PatchCertificadoPayload {
  titulo?: string;
  organismo?: string;
  importe_adjudicacion?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  numero_expediente?: string;
  cpv_codes?: string[];
  clasificacion_grupo?: string | null;
  clasificacion_subgrupo?: string | null;
  extracted_data?: Partial<ExtractedData>;
}

export interface ListCertificadosParams {
  empresa_id?: string;
  estado?: EstadoCertificado;
  clasificacion_grupo?: string;
  limit?: number;
  offset?: number;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function uploadXhr(
  formData: FormData,
  onProgress: (pct: number) => void,
): Promise<CertificadoObraRead> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/v1/solvencia/certificados`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText) as CertificadoObraRead);
      } else {
        reject(new Error(`${xhr.status}: ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.send(formData);
  });
}

export const certificadosApi = {
  list: (params?: ListCertificadosParams) => {
    const qs = new URLSearchParams();
    if (params?.empresa_id) qs.set("empresa_id", params.empresa_id);
    if (params?.estado) qs.set("estado", params.estado);
    if (params?.clasificacion_grupo) qs.set("clasificacion_grupo", params.clasificacion_grupo);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch<CertificadoObraListItem[]>(`/api/v1/solvencia/certificados${query}`);
  },

  get: (id: string) =>
    apiFetch<CertificadoObraRead>(`/api/v1/solvencia/certificados/${id}`),

  upload: (formData: FormData, onProgress: (pct: number) => void) =>
    uploadXhr(formData, onProgress),

  patch: (id: string, data: PatchCertificadoPayload) =>
    apiFetch<CertificadoObraRead>(`/api/v1/solvencia/certificados/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  validar: (id: string) =>
    apiFetch<CertificadoObraRead>(
      `/api/v1/solvencia/certificados/${id}/validar`,
      { method: "POST" }
    ),

  rechazar: (id: string) =>
    apiFetch<CertificadoObraRead>(
      `/api/v1/solvencia/certificados/${id}/rechazar`,
      { method: "POST" }
    ),
};
