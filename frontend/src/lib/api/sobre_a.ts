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

export interface SobreAPresentacion {
  id: string;
  empresa_id: string;
  licitacion_id: string;
  archivo_filename: string;
  subido_at: string;
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

  list: async (
    empresa_id: string,
    expediente?: string,
  ): Promise<SobreAListItem[]> => {
    const qs = new URLSearchParams({ empresa_id });
    if (expediente) qs.set("expediente", expediente);
    const res = await fetch(`${API_BASE}/api/v1/sobre-a?${qs.toString()}`);
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

  /** URL para descargar el snapshot como .docx (browser dispara la descarga). */
  docxUrl: (snapshotId: string): string =>
    `${API_BASE}/api/v1/sobre-a/${snapshotId}/docx`,

  // ─── Presentación final (PDF firmado) ─────────────────────────────────

  presentadoGet: async (
    expediente: string,
    empresa_id: string,
  ): Promise<SobreAPresentacion | null> => {
    const res = await fetch(
      `${API_BASE}/api/v1/sobre-a/${encodeURIComponent(
        expediente,
      )}/presentado?empresa_id=${empresa_id}`,
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  presentadoSubir: async (
    expediente: string,
    empresa_id: string,
    pdf: File,
  ): Promise<SobreAPresentacion> => {
    const fd = new FormData();
    fd.append("pdf", pdf);
    const res = await fetch(
      `${API_BASE}/api/v1/sobre-a/${encodeURIComponent(
        expediente,
      )}/presentado?empresa_id=${empresa_id}`,
      { method: "POST", body: fd },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  presentadoBorrar: async (
    expediente: string,
    empresa_id: string,
  ): Promise<void> => {
    const res = await fetch(
      `${API_BASE}/api/v1/sobre-a/${encodeURIComponent(
        expediente,
      )}/presentado?empresa_id=${empresa_id}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(await readError(res));
  },

  presentadoPdfUrl: (expediente: string, empresa_id: string): string =>
    `${API_BASE}/api/v1/sobre-a/${encodeURIComponent(
      expediente,
    )}/presentado/pdf?empresa_id=${empresa_id}`,
};
