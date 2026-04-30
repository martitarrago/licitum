const API_BASE = "";

export type EstadoAnalisis = "pendiente" | "procesando" | "completado" | "fallido";

export interface BanderaRoja {
  tipo: string;
  descripcion: string;
}

export interface PliegoExtracted {
  // Económico
  presupuesto_base_sin_iva?: number | null;
  iva_porcentaje?: number | null;
  valor_estimado_contrato?: number | null;
  // Plazo
  plazo_ejecucion_meses?: number | null;
  fecha_limite_presentacion?: string | null;
  fecha_apertura_sobres?: string | null;
  fecha_visita_obra?: string | null;
  // Solvencia
  clasificacion_grupo?: string | null;
  clasificacion_subgrupo?: string | null;
  clasificacion_categoria?: number | null;
  solvencia_economica_volumen_anual?: number | null;
  solvencia_tecnica_obras_similares_importe?: number | null;
  solvencia_tecnica_anos_referencia?: number | null;
  solvencia_tecnica_numero_obras?: number | null;
  // Valoración
  formula_economica_extracto?: string | null;
  formula_tipo?: string | null;
  pct_criterios_subjetivos?: number | null;
  pct_criterios_objetivos?: number | null;
  baja_temeraria_extracto?: string | null;
  umbral_saciedad_pct?: number | null;
  mejoras_descripcion?: string | null;
  // Garantías
  garantia_provisional_pct?: number | null;
  garantia_definitiva_pct?: number | null;
  // Sobre A + banderas + resumen
  docs_extra_sobre_a?: string[];
  banderas_rojas?: BanderaRoja[];
  resumen_ejecutivo?: string;
  idioma_detectado?: "es" | "ca";
  confianza_global?: number;
}

export interface PliegoAnalisis {
  licitacion_id: string;
  pdf_url: string | null;
  estado: EstadoAnalisis;
  extracted_data: PliegoExtracted;
  idioma_detectado: string | null;
  confianza_global: string | null;
  error_mensaje: string | null;
  procesado_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Veredicto = "ir" | "ir_con_riesgo" | "no_ir" | "incompleto";

export type EstadoEncaje = "cumple" | "riesgo" | "no_cumple" | "sin_datos";

export interface EncajeItem {
  requisito: string;
  exigido: string;
  empresa: string;
  estado: EstadoEncaje;
}

export interface Recomendacion {
  veredicto: Veredicto;
  titulo: string;
  razon_principal: string;
  razones_a_favor: string[];
  razones_riesgo: string[];
  razones_no: string[];
  encaje: EncajeItem[];
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

export interface PliegoListItem {
  licitacion_id: string;
  expediente: string;
  titulo: string | null;
  organismo: string | null;
  importe_licitacion: string | null;
  fecha_limite: string | null;
  estado: EstadoAnalisis;
  idioma_detectado: string | null;
  confianza_global: string | null;
  procesado_at: string | null;
  created_at: string;
  veredicto_recomendado: string | null;
  banderas_rojas_count: number | null;
}

export const pliegosApi = {
  /** GET listing — todos los pliegos con análisis IA (cache global). */
  list: async (): Promise<PliegoListItem[]> => {
    const res = await fetch(`${API_BASE}/api/v1/pliegos`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  /** GET — devuelve null si no hay análisis aún (404). */
  get: async (expediente: string): Promise<PliegoAnalisis | null> => {
    const res = await fetch(`${API_BASE}/api/v1/pliegos/${expediente}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  analizar: async (expediente: string): Promise<PliegoAnalisis> => {
    const res = await fetch(`${API_BASE}/api/v1/pliegos/${expediente}/analizar`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  upload: async (expediente: string, pdf: File): Promise<PliegoAnalisis> => {
    const fd = new FormData();
    fd.append("pdf", pdf);
    const res = await fetch(`${API_BASE}/api/v1/pliegos/${expediente}/upload`, {
      method: "POST",
      body: fd,
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  reextraer: async (expediente: string): Promise<PliegoAnalisis> => {
    const res = await fetch(
      `${API_BASE}/api/v1/pliegos/${expediente}/reextraer`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  recomendacion: async (
    expediente: string,
    empresa_id: string,
  ): Promise<Recomendacion> => {
    const res = await fetch(
      `${API_BASE}/api/v1/pliegos/${expediente}/recomendacion?empresa_id=${empresa_id}`,
    );
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },

  delete: async (expediente: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/api/v1/pliegos/${expediente}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await readError(res));
  },
};

export const FORMULA_TIPO_LABELS: Record<string, string> = {
  lineal: "Lineal directa",
  proporcional_inversa: "Proporcional inversa (con baja media)",
  lineal_con_saciedad: "Lineal con umbral de saciedad",
  cuadratica: "Cuadrática",
  otra: "Otra",
  no_detectado: "No detectada",
};

export const BANDERA_TIPO_LABELS: Record<string, string> = {
  plazo_corto: "Plazo corto",
  presupuesto_bajo: "Presupuesto bajo",
  criterios_ambiguos: "Criterios ambiguos",
  mejoras_dirigidas: "Mejoras dirigidas",
  solvencia_alta: "Solvencia desproporcionada",
  visita_urgente: "Visita urgente",
  otra: "Otra",
};
