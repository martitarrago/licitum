const API_BASE = "";

export interface ClasificacionRelic {
  id: string;
  tipus_cl: string;
  sigles_cl: string;
  grupo: string;
  subgrupo: string | null;
  categoria: number | null;
  subgrup_cl_text: string | null;
  categoria_cl_text: string | null;
  suspensio: boolean;
  data_atorgament: string | null;
}

export interface ProhibicioData {
  ambit_pr?: string;
  data_res_pr?: string;
  data_inici_pr?: string;
  data_fi_pr?: string;
  causa_legal_pr?: string;
}

export interface EmpresaRelic {
  id: string;
  empresa_id: string;
  n_registral: string;
  nom_empresa: string | null;
  prohibicio: boolean;
  prohibicio_data: ProhibicioData | null;
  data_actualitzacio: string | null;
  ultima_sincronizacion: string | null;
  created_at: string;
  updated_at: string;
  clasificaciones_relic: ClasificacionRelic[];
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body === "object" && body !== null && "detail" in body) {
      return String(body.detail);
    }
    return JSON.stringify(body);
  } catch {
    return await res.text().catch(() => res.statusText);
  }
}

export const relicApi = {
  /** GET — devuelve null si la empresa no tiene inscripción RELIC sincronizada (404). */
  get: async (empresa_id: string): Promise<EmpresaRelic | null> => {
    const res = await fetch(
      `${API_BASE}/api/v1/empresa/relic?empresa_id=${empresa_id}`,
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as EmpresaRelic;
  },

  sincronizar: async (
    empresa_id: string,
    n_registral: string,
  ): Promise<EmpresaRelic> => {
    const res = await fetch(`${API_BASE}/api/v1/empresa/relic/sincronizar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id, n_registral }),
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as EmpresaRelic;
  },

  desconectar: async (empresa_id: string): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/api/v1/empresa/relic?empresa_id=${empresa_id}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) throw new Error(await readError(res));
  },
};
