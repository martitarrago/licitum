const API_BASE = "";

export type TipoDocumento =
  | "hacienda_corriente"
  | "ss_corriente"
  | "poliza_rc"
  | "poliza_todo_riesgo"
  | "iso_9001"
  | "iso_14001"
  | "iso_45001"
  | "rea_construccion"
  | "plantilla_tc2"
  | "otros";

export type EstadoDocumento = "vigente" | "a_caducar" | "caducado";

export interface DocumentoEmpresa {
  id: string;
  empresa_id: string;
  tipo: TipoDocumento;
  titulo: string | null;
  pdf_url: string | null;
  fecha_emision: string | null;
  fecha_caducidad: string | null;
  notas: string | null;
  estado: EstadoDocumento;
  dias_a_caducidad: number | null;
  created_at: string;
  updated_at: string;
}

export interface ResumenSaludDocumental {
  total: number;
  vigentes: number;
  a_caducar: number;
  caducados: number;
  proximos_a_caducar: DocumentoEmpresa[];
}

export interface DocumentoCreatePayload {
  empresa_id: string;
  tipo: TipoDocumento;
  titulo?: string;
  fecha_emision?: string;
  fecha_caducidad?: string;
  notas?: string;
}

export interface DocumentoPatchPayload {
  tipo?: TipoDocumento;
  titulo?: string | null;
  fecha_emision?: string | null;
  fecha_caducidad?: string | null;
  notas?: string | null;
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

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(await readError(res));
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const documentosApi = {
  list: (empresa_id: string, tipo?: TipoDocumento) => {
    const qs = new URLSearchParams({ empresa_id });
    if (tipo) qs.set("tipo", tipo);
    return apiFetch<DocumentoEmpresa[]>(`/api/v1/empresa/documentos?${qs}`);
  },

  resumenSalud: (empresa_id: string) =>
    apiFetch<ResumenSaludDocumental>(
      `/api/v1/empresa/documentos/resumen-salud?empresa_id=${empresa_id}`,
    ),

  createManual: (data: DocumentoCreatePayload) =>
    apiFetch<DocumentoEmpresa>("/api/v1/empresa/documentos/manual", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  uploadConPdf: async (
    empresa_id: string,
    payload: Omit<DocumentoCreatePayload, "empresa_id">,
    pdf: File,
  ): Promise<DocumentoEmpresa> => {
    const fd = new FormData();
    fd.append("empresa_id", empresa_id);
    fd.append("tipo", payload.tipo);
    if (payload.titulo) fd.append("titulo", payload.titulo);
    if (payload.fecha_emision) fd.append("fecha_emision", payload.fecha_emision);
    if (payload.fecha_caducidad)
      fd.append("fecha_caducidad", payload.fecha_caducidad);
    if (payload.notas) fd.append("notas", payload.notas);
    fd.append("pdf", pdf);
    const res = await fetch(`${API_BASE}/api/v1/empresa/documentos`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  patch: (id: string, data: DocumentoPatchPayload) =>
    apiFetch<DocumentoEmpresa>(`/api/v1/empresa/documentos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/v1/empresa/documentos/${id}`, { method: "DELETE" }),
};

export const TIPO_DOCUMENTO_LABELS: Record<TipoDocumento, string> = {
  hacienda_corriente: "Hacienda al corriente",
  ss_corriente: "Seguridad Social al corriente",
  poliza_rc: "Póliza RC profesional",
  poliza_todo_riesgo: "Póliza todo riesgo construcción",
  iso_9001: "ISO 9001 (Calidad)",
  iso_14001: "ISO 14001 (Medioambiente)",
  iso_45001: "ISO 45001 (Seguridad)",
  rea_construccion: "REA Construcción",
  plantilla_tc2: "Plantilla (TC2)",
  otros: "Otros",
};

export const TIPO_DOCUMENTO_OPTIONS: { value: TipoDocumento; label: string }[] = (
  Object.entries(TIPO_DOCUMENTO_LABELS) as [TipoDocumento, string][]
).map(([value, label]) => ({ value, label }));
