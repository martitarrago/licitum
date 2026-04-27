const API_BASE = "";

export interface SobreAListItem {
  id: string;
  empresa_id: string;
  licitacion_id: string;
  expediente: string;
  usa_relic: boolean;
  created_at: string;
  updated_at: string;
}

export interface SobreARead extends SobreAListItem {
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

export const sobreAApi = {
  generar: async (expediente: string, empresa_id: string): Promise<SobreARead> => {
    const res = await fetch(
      `${API_BASE}/api/v1/sobre-a/${expediente}/generar`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id }),
      },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  list: async (empresa_id: string): Promise<SobreAListItem[]> => {
    const res = await fetch(
      `${API_BASE}/api/v1/sobre-a?empresa_id=${empresa_id}`,
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  get: async (id: string): Promise<SobreARead> => {
    const res = await fetch(`${API_BASE}/api/v1/sobre-a/${id}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/v1/sobre-a/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await readError(res));
  },
};
