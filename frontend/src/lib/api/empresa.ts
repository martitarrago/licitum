const API_BASE = "";

export type TamanoPyme = "micro" | "pequena" | "mediana" | "grande";

export interface Empresa {
  id: string;
  nombre: string;
  cif: string;
  email: string;
  telefono: string | null;
  iae: string | null;
  cnae: string | null;
  tamano_pyme: TamanoPyme | null;
  direccion_calle: string | null;
  direccion_codigo_postal: string | null;
  direccion_ciudad: string | null;
  direccion_provincia: string | null;
  direccion_pais: string | null;
  representante_nombre: string | null;
  representante_nif: string | null;
  representante_cargo: string | null;
  poder_notario: string | null;
  poder_fecha_escritura: string | null;
  poder_protocolo: string | null;
  poder_registro_mercantil: string | null;
  ccc_seguridad_social: string | null;
  volumen_negocio_n: string | null;
  volumen_negocio_n1: string | null;
  volumen_negocio_n2: string | null;
  plantilla_media: number | null;
  created_at: string;
  updated_at: string;
}

export type EmpresaPatch = Partial<{
  nombre: string;
  cif: string;
  email: string;
  telefono: string | null;
  iae: string | null;
  cnae: string | null;
  tamano_pyme: TamanoPyme | null;
  direccion_calle: string | null;
  direccion_codigo_postal: string | null;
  direccion_ciudad: string | null;
  direccion_provincia: string | null;
  direccion_pais: string | null;
  representante_nombre: string | null;
  representante_nif: string | null;
  representante_cargo: string | null;
  poder_notario: string | null;
  poder_fecha_escritura: string | null;
  poder_protocolo: string | null;
  poder_registro_mercantil: string | null;
  ccc_seguridad_social: string | null;
  volumen_negocio_n: number | null;
  volumen_negocio_n1: number | null;
  volumen_negocio_n2: number | null;
  plantilla_media: number | null;
}>;

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

export const empresaApi = {
  get: async (id: string): Promise<Empresa> => {
    const res = await fetch(`${API_BASE}/api/v1/empresas/${id}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  patch: async (id: string, data: EmpresaPatch): Promise<Empresa> => {
    const res = await fetch(`${API_BASE}/api/v1/empresas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },
};

export const TAMANO_PYME_LABELS: Record<TamanoPyme, string> = {
  micro: "Microempresa (<10 empleados)",
  pequena: "Pequeña (<50 empleados)",
  mediana: "Mediana (<250 empleados)",
  grande: "Grande (≥250 empleados)",
};
