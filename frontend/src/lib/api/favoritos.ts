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
  marcar: async (
    expediente: string,
    empresa_id: string,
  ): Promise<FavoritoState> => {
    const res = await fetch(
      `${API_BASE}/api/v1/favoritos/${encodeURIComponent(expediente)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id }),
      },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  quitar: async (
    expediente: string,
    empresa_id: string,
  ): Promise<FavoritoState> => {
    const res = await fetch(
      `${API_BASE}/api/v1/favoritos/${encodeURIComponent(expediente)}?empresa_id=${empresa_id}`,
      { method: "DELETE" },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },
};
