const API_BASE = "";

export type EstadoAceptacion = "acepta" | "selectivo" | "no_acepta";
export type PrioridadTerritorio = "preferida" | "ok" | "evitar";
export type PrioridadCpv = "core" | "secundario" | "no_interesa";

export interface PreferenciaTerritorio {
  id?: string;
  comarca_codigo: string | null;
  provincia_codigo: string | null;
  prioridad: PrioridadTerritorio;
}

export interface PreferenciaCpv {
  id?: string;
  cpv_division: string;
  prioridad: PrioridadCpv;
}

export interface EmpresaPreferencias {
  id: string;
  empresa_id: string;
  obras_simultaneas_max: number | null;
  obras_simultaneas_actual: number | null;
  presupuesto_min_interes: string | null;
  presupuesto_max_interes: string | null;
  apetito_ute: boolean;
  estado_aceptacion: EstadoAceptacion;
  notas: string | null;
  territorios: (PreferenciaTerritorio & { id: string })[];
  cpvs: (PreferenciaCpv & { id: string })[];
  created_at: string;
  updated_at: string;
}

export interface PreferenciasUpsertPayload {
  obras_simultaneas_max: number | null;
  obras_simultaneas_actual: number | null;
  presupuesto_min_interes: number | null;
  presupuesto_max_interes: number | null;
  apetito_ute: boolean;
  estado_aceptacion: EstadoAceptacion;
  notas: string | null;
  territorios: PreferenciaTerritorio[];
  cpvs: PreferenciaCpv[];
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body === "object" && body !== null && "detail" in body) {
      return JSON.stringify(body.detail);
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

export const preferenciasApi = {
  get: (empresa_id: string) =>
    apiFetch<EmpresaPreferencias | null>(
      `/api/v1/empresa/preferencias?empresa_id=${empresa_id}`,
    ),

  upsert: (empresa_id: string, data: PreferenciasUpsertPayload) =>
    apiFetch<EmpresaPreferencias>(
      `/api/v1/empresa/preferencias?empresa_id=${empresa_id}`,
      { method: "PUT", body: JSON.stringify(data) },
    ),
};

export const ESTADO_ACEPTACION_LABELS: Record<EstadoAceptacion, string> = {
  acepta: "Acepta propuestas",
  selectivo: "Selectivo",
  no_acepta: "No acepta",
};

export const PRIORIDAD_TERRITORIO_LABELS: Record<PrioridadTerritorio, string> = {
  preferida: "Preferida",
  ok: "OK",
  evitar: "Evitar",
};

export const PRIORIDAD_CPV_LABELS: Record<PrioridadCpv, string> = {
  core: "Core",
  secundario: "Secundario",
  no_interesa: "No interesa",
};

// Provincias de España (código INE 2 dígitos).
export const PROVINCIAS: { codigo: string; nombre: string }[] = [
  { codigo: "01", nombre: "Álava" },
  { codigo: "02", nombre: "Albacete" },
  { codigo: "03", nombre: "Alicante" },
  { codigo: "04", nombre: "Almería" },
  { codigo: "05", nombre: "Ávila" },
  { codigo: "06", nombre: "Badajoz" },
  { codigo: "07", nombre: "Baleares" },
  { codigo: "08", nombre: "Barcelona" },
  { codigo: "09", nombre: "Burgos" },
  { codigo: "10", nombre: "Cáceres" },
  { codigo: "11", nombre: "Cádiz" },
  { codigo: "12", nombre: "Castellón" },
  { codigo: "13", nombre: "Ciudad Real" },
  { codigo: "14", nombre: "Córdoba" },
  { codigo: "15", nombre: "A Coruña" },
  { codigo: "16", nombre: "Cuenca" },
  { codigo: "17", nombre: "Girona" },
  { codigo: "18", nombre: "Granada" },
  { codigo: "19", nombre: "Guadalajara" },
  { codigo: "20", nombre: "Guipúzcoa" },
  { codigo: "21", nombre: "Huelva" },
  { codigo: "22", nombre: "Huesca" },
  { codigo: "23", nombre: "Jaén" },
  { codigo: "24", nombre: "León" },
  { codigo: "25", nombre: "Lleida" },
  { codigo: "26", nombre: "La Rioja" },
  { codigo: "27", nombre: "Lugo" },
  { codigo: "28", nombre: "Madrid" },
  { codigo: "29", nombre: "Málaga" },
  { codigo: "30", nombre: "Murcia" },
  { codigo: "31", nombre: "Navarra" },
  { codigo: "32", nombre: "Ourense" },
  { codigo: "33", nombre: "Asturias" },
  { codigo: "34", nombre: "Palencia" },
  { codigo: "35", nombre: "Las Palmas" },
  { codigo: "36", nombre: "Pontevedra" },
  { codigo: "37", nombre: "Salamanca" },
  { codigo: "38", nombre: "Santa Cruz de Tenerife" },
  { codigo: "39", nombre: "Cantabria" },
  { codigo: "40", nombre: "Segovia" },
  { codigo: "41", nombre: "Sevilla" },
  { codigo: "42", nombre: "Soria" },
  { codigo: "43", nombre: "Tarragona" },
  { codigo: "44", nombre: "Teruel" },
  { codigo: "45", nombre: "Toledo" },
  { codigo: "46", nombre: "Valencia" },
  { codigo: "47", nombre: "Valladolid" },
  { codigo: "48", nombre: "Vizcaya" },
  { codigo: "49", nombre: "Zamora" },
  { codigo: "50", nombre: "Zaragoza" },
  { codigo: "51", nombre: "Ceuta" },
  { codigo: "52", nombre: "Melilla" },
];

// CPV divisiones (2 dígitos) más relevantes en construcción + servicios
// asociados. Lista corta para el wizard inicial; se puede extender.
export const CPV_DIVISIONES: { codigo: string; nombre: string }[] = [
  { codigo: "44", nombre: "44 — Estructuras y materiales de construcción" },
  { codigo: "45", nombre: "45 — Trabajos de construcción" },
  { codigo: "50", nombre: "50 — Servicios de reparación y mantenimiento" },
  { codigo: "71", nombre: "71 — Arquitectura, ingeniería y servicios técnicos" },
  { codigo: "77", nombre: "77 — Agricultura, jardinería y silvicultura" },
  { codigo: "90", nombre: "90 — Servicios de medioambiente" },
];
