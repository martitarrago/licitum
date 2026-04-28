const API_BASE = "";

export type RolPersonal =
  | "jefe_obra"
  | "encargado"
  | "tecnico_prl"
  | "tecnico_calidad"
  | "tecnico_ma"
  | "ingeniero"
  | "arquitecto"
  | "otros";

export interface PersonalEmpresa {
  id: string;
  empresa_id: string;
  nombre_completo: string;
  dni: string | null;
  rol: RolPersonal;
  titulacion: string | null;
  anios_experiencia: number | null;
  cv_pdf_url: string | null;
  certificados_formacion: unknown[] | null;
  obras_participadas: string[] | null;
  activo: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalCreatePayload {
  empresa_id: string;
  nombre_completo: string;
  dni?: string | null;
  rol: RolPersonal;
  titulacion?: string | null;
  anios_experiencia?: number | null;
  cv_pdf_url?: string | null;
  certificados_formacion?: unknown[] | null;
  obras_participadas?: string[] | null;
  activo?: boolean;
  notas?: string | null;
}

export interface PersonalPatchPayload {
  nombre_completo?: string;
  dni?: string | null;
  rol?: RolPersonal;
  titulacion?: string | null;
  anios_experiencia?: number | null;
  cv_pdf_url?: string | null;
  certificados_formacion?: unknown[] | null;
  obras_participadas?: string[] | null;
  activo?: boolean;
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

export const personalApi = {
  list: (empresa_id: string, params?: { rol?: RolPersonal; activo?: boolean }) => {
    const qs = new URLSearchParams({ empresa_id });
    if (params?.rol) qs.set("rol", params.rol);
    if (params?.activo !== undefined) qs.set("activo", String(params.activo));
    return apiFetch<PersonalEmpresa[]>(`/api/v1/empresa/personal?${qs}`);
  },

  create: (data: PersonalCreatePayload) =>
    apiFetch<PersonalEmpresa>("/api/v1/empresa/personal", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  patch: (id: string, data: PersonalPatchPayload) =>
    apiFetch<PersonalEmpresa>(`/api/v1/empresa/personal/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/v1/empresa/personal/${id}`, { method: "DELETE" }),
};

export const ROL_PERSONAL_LABELS: Record<RolPersonal, string> = {
  jefe_obra: "Jefe/a de obra",
  encargado: "Encargado/a",
  tecnico_prl: "Técnico PRL",
  tecnico_calidad: "Técnico calidad",
  tecnico_ma: "Técnico medioambiente",
  ingeniero: "Ingeniero/a",
  arquitecto: "Arquitecto/a",
  otros: "Otros",
};

export const ROL_PERSONAL_OPTIONS: { value: RolPersonal; label: string }[] = (
  Object.entries(ROL_PERSONAL_LABELS) as [RolPersonal, string][]
).map(([value, label]) => ({ value, label }));
