const API_BASE = "";

export interface FavoritoState {
  favorito: boolean;
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

export const favoritosApi = {
  // empresa_id se deriva del JWT en el backend; las firmas reciben el ID
  // sólo para mantener compatibilidad con los callsites — se ignora.
  marcar: async (expediente: string, _empresa_id: string): Promise<FavoritoState> => {
    const res = await fetch(
      `${API_BASE}/api/v1/favoritos/${encodeURIComponent(expediente)}`,
      { method: "PUT" },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  quitar: async (expediente: string, _empresa_id: string): Promise<FavoritoState> => {
    const res = await fetch(
      `${API_BASE}/api/v1/favoritos/${encodeURIComponent(expediente)}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },
};
