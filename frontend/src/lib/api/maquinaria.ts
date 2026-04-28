const API_BASE = "";

export type PropiedadMaquinaria = "propia" | "leasing" | "alquiler_largo_plazo";

export interface MaquinariaEmpresa {
  id: string;
  empresa_id: string;
  tipo: string;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  matricula: string | null;
  propiedad: PropiedadMaquinaria;
  itv_caducidad: string | null;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaquinariaCreatePayload {
  empresa_id: string;
  tipo: string;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  matricula?: string | null;
  propiedad?: PropiedadMaquinaria;
  itv_caducidad?: string | null;
  notas?: string | null;
}

export interface MaquinariaPatchPayload {
  tipo?: string;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  matricula?: string | null;
  propiedad?: PropiedadMaquinaria;
  itv_caducidad?: string | null;
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

export const maquinariaApi = {
  list: (empresa_id: string, propiedad?: PropiedadMaquinaria) => {
    const qs = new URLSearchParams({ empresa_id });
    if (propiedad) qs.set("propiedad", propiedad);
    return apiFetch<MaquinariaEmpresa[]>(`/api/v1/empresa/maquinaria?${qs}`);
  },

  create: (data: MaquinariaCreatePayload) =>
    apiFetch<MaquinariaEmpresa>("/api/v1/empresa/maquinaria", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  patch: (id: string, data: MaquinariaPatchPayload) =>
    apiFetch<MaquinariaEmpresa>(`/api/v1/empresa/maquinaria/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/v1/empresa/maquinaria/${id}`, { method: "DELETE" }),
};

export const PROPIEDAD_LABELS: Record<PropiedadMaquinaria, string> = {
  propia: "Propia",
  leasing: "Leasing",
  alquiler_largo_plazo: "Alquiler largo plazo",
};

export const PROPIEDAD_OPTIONS: { value: PropiedadMaquinaria; label: string }[] = (
  Object.entries(PROPIEDAD_LABELS) as [PropiedadMaquinaria, string][]
).map(([value, label]) => ({ value, label }));
