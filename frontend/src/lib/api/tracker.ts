const API_BASE = "";

export type EstadoTracker =
  | "en_preparacion"
  | "presentada"
  | "en_subsanacion"
  | "en_resolucion"
  | "documentacion_previa"
  | "ganada"
  | "perdida"
  | "excluida";

export const ESTADO_LABELS: Record<EstadoTracker, string> = {
  en_preparacion: "En preparación",
  presentada: "Presentada",
  en_subsanacion: "En subsanación",
  en_resolucion: "En resolución",
  documentacion_previa: "Documentación previa",
  ganada: "Ganada",
  perdida: "Perdida",
  excluida: "Excluida",
};

export const ESTADOS_ORDEN: EstadoTracker[] = [
  "en_preparacion",
  "presentada",
  "en_subsanacion",
  "en_resolucion",
  "documentacion_previa",
  "ganada",
  "perdida",
  "excluida",
];

/** Estados con plazo legal (subsanación 3d, documentación previa 10d). */
export const ESTADOS_RELOJ_LEGAL = new Set<EstadoTracker>([
  "en_subsanacion",
  "documentacion_previa",
]);

/** Estados que cuentan como "activos" en el pipeline (no terminales). */
export const ESTADOS_ACTIVOS = new Set<EstadoTracker>([
  "en_preparacion",
  "presentada",
  "en_subsanacion",
  "en_resolucion",
  "documentacion_previa",
]);

export type EstadoTono = "default" | "success" | "warning" | "danger" | "muted";

export const ESTADO_TONO: Record<EstadoTracker, EstadoTono> = {
  en_preparacion: "default",
  presentada: "default",
  en_subsanacion: "warning",
  en_resolucion: "default",
  documentacion_previa: "warning",
  ganada: "success",
  perdida: "muted",
  excluida: "muted",
};

export interface EstadoBasicoRead {
  id: string;
  empresa_id: string;
  licitacion_id: string;
  estado: string;
  deadline_actual: string | null;
  nota: string | null;
  estado_actualizado_at: string;
  created_at: string;
  updated_at: string;
}

export interface TrackerFeedItem extends EstadoBasicoRead {
  expediente: string;
  titulo: string | null;
  organismo: string | null;
  importe_licitacion: string | null;
  fecha_limite_pliego: string | null;
}

export interface ResumenEstado {
  estado: string;
  count: number;
}

export interface TrackerResumen {
  total_activas: number;
  por_estado: ResumenEstado[];
  deadlines_semana: TrackerFeedItem[];
}

export interface EstadoUpdatePayload {
  empresa_id: string;
  estado: EstadoTracker;
  deadline_actual?: string | null;
  nota?: string | null;
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

export const trackerApi = {
  getEstado: async (
    expediente: string,
    empresa_id: string,
  ): Promise<EstadoBasicoRead | null> => {
    const res = await fetch(
      `${API_BASE}/api/v1/tracker/${expediente}/estado?empresa_id=${empresa_id}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  upsertEstado: async (
    expediente: string,
    data: EstadoUpdatePayload,
  ): Promise<EstadoBasicoRead> => {
    const res = await fetch(`${API_BASE}/api/v1/tracker/${expediente}/estado`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  borrarEstado: async (
    expediente: string,
    empresa_id: string,
  ): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/api/v1/tracker/${expediente}/estado?empresa_id=${empresa_id}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) throw new Error(await readError(res));
  },

  feed: async (
    empresa_id: string,
    estados?: EstadoTracker[],
  ): Promise<TrackerFeedItem[]> => {
    const qs = new URLSearchParams({ empresa_id });
    if (estados) for (const e of estados) qs.append("estado", e);
    const res = await fetch(`${API_BASE}/api/v1/tracker?${qs}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  resumen: async (
    empresa_id: string,
    dias_alerta = 7,
  ): Promise<TrackerResumen> => {
    const res = await fetch(
      `${API_BASE}/api/v1/tracker/resumen?empresa_id=${empresa_id}&dias_alerta=${dias_alerta}`,
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },
};
