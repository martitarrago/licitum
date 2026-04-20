const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ClasificacionRolece {
  id: string;
  empresa_id: string;
  grupo: string;
  subgrupo: string;
  categoria: string;
  fecha_obtencion: string;
  fecha_caducidad: string;
  activa: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClasificacionCreate {
  empresa_id: string;
  grupo: string;
  subgrupo: string;
  categoria: string;
  fecha_obtencion: string;
  fecha_caducidad: string;
  activa?: boolean;
}

export interface ClasificacionUpdate {
  grupo?: string;
  subgrupo?: string;
  categoria?: string;
  fecha_obtencion?: string;
  fecha_caducidad?: string;
  activa?: boolean;
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
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const clasificacionesApi = {
  list: (params?: { empresa_id?: string; activa?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.empresa_id) qs.set("empresa_id", params.empresa_id);
    if (params?.activa !== undefined) qs.set("activa", String(params.activa));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch<ClasificacionRolece[]>(`/api/v1/clasificaciones${query}`);
  },

  create: (data: ClasificacionCreate) =>
    apiFetch<ClasificacionRolece>("/api/v1/clasificaciones", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: string, data: ClasificacionUpdate) =>
    apiFetch<ClasificacionRolece>(`/api/v1/clasificaciones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/v1/clasificaciones/${id}`, { method: "DELETE" }),
};
