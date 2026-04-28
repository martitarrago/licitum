const API_BASE = "";

export type TipoSistemaGestion =
  | "iso_9001"
  | "iso_14001"
  | "iso_45001"
  | "ehs_propio"
  | "plan_calidad_propio"
  | "plan_ma_propio"
  | "plan_seguridad_propio"
  | "cae_construccion"
  | "otros";

export interface SistemaGestionEmpresa {
  id: string;
  empresa_id: string;
  tipo: TipoSistemaGestion;
  pdf_url: string | null;
  fecha_emision: string | null;
  fecha_caducidad: string | null;
  entidad_certificadora: string | null;
  alcance: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface SistemaGestionCreatePayload {
  empresa_id: string;
  tipo: TipoSistemaGestion;
  pdf_url?: string | null;
  fecha_emision?: string | null;
  fecha_caducidad?: string | null;
  entidad_certificadora?: string | null;
  alcance?: string | null;
  notas?: string | null;
}

export interface SistemaGestionPatchPayload {
  tipo?: TipoSistemaGestion;
  pdf_url?: string | null;
  fecha_emision?: string | null;
  fecha_caducidad?: string | null;
  entidad_certificadora?: string | null;
  alcance?: string | null;
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

export const sistemasGestionApi = {
  list: (empresa_id: string, tipo?: TipoSistemaGestion) => {
    const qs = new URLSearchParams({ empresa_id });
    if (tipo) qs.set("tipo", tipo);
    return apiFetch<SistemaGestionEmpresa[]>(
      `/api/v1/empresa/sistemas-gestion?${qs}`,
    );
  },

  create: (data: SistemaGestionCreatePayload) =>
    apiFetch<SistemaGestionEmpresa>("/api/v1/empresa/sistemas-gestion", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  patch: (id: string, data: SistemaGestionPatchPayload) =>
    apiFetch<SistemaGestionEmpresa>(
      `/api/v1/empresa/sistemas-gestion/${id}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),

  delete: (id: string) =>
    apiFetch<void>(`/api/v1/empresa/sistemas-gestion/${id}`, {
      method: "DELETE",
    }),
};

export const TIPO_SISTEMA_LABELS: Record<TipoSistemaGestion, string> = {
  iso_9001: "ISO 9001 (Calidad)",
  iso_14001: "ISO 14001 (Medioambiente)",
  iso_45001: "ISO 45001 (Seguridad)",
  ehs_propio: "EHS propio",
  plan_calidad_propio: "Plan de calidad propio",
  plan_ma_propio: "Plan medioambiental propio",
  plan_seguridad_propio: "Plan de seguridad propio",
  cae_construccion: "CAE construcción",
  otros: "Otros",
};

export const TIPO_SISTEMA_OPTIONS: { value: TipoSistemaGestion; label: string }[] = (
  Object.entries(TIPO_SISTEMA_LABELS) as [TipoSistemaGestion, string][]
).map(([value, label]) => ({ value, label }));
