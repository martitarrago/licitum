const API_BASE = "";

export interface SyncStatus {
  /** ISO timestamp del último ingesta_pscp exitoso (proxy: MAX(licitacion.created_at)). */
  last_licitacion_at: string | null;
  /** ISO timestamp del último recálculo de scores para esta empresa. */
  last_score_at: string | null;
}

export const systemApi = {
  syncStatus: async (empresaId?: string): Promise<SyncStatus> => {
    const url = empresaId
      ? `${API_BASE}/api/v1/system/sync-status?empresa_id=${empresaId}`
      : `${API_BASE}/api/v1/system/sync-status`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sync-status ${res.status}`);
    return res.json();
  },
};
