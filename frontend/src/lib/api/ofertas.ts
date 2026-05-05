const API_BASE = "";

export interface OfertaItem {
  licitacion_id: string;
  expediente: string;
  titulo: string | null;
  organismo: string | null;
  importe_licitacion: string | null;
  fecha_limite: string | null;
  fecha_publicacion: string | null;
  estado: string | null;
  estado_actualizado_at: string | null;
  declaracion_generada: boolean;
  declaracion_versiones: number;
  economica_generada: boolean;
  economica_versiones: number;
  presentado: boolean;
  presentado_at: string | null;
  presupuesto_base: string | null;
  pct_criterios_subjetivos: string | null;
  pliego_analizado: boolean;
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

export const ofertasApi = {
  list: async (
    empresa_id: string,
    ocultar_rechazadas = false,
  ): Promise<OfertaItem[]> => {
    const qs = new URLSearchParams({ empresa_id });
    if (ocultar_rechazadas) qs.set("ocultar_rechazadas", "true");
    const res = await fetch(`${API_BASE}/api/v1/ofertas?${qs.toString()}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  },
};

/** Decide qué pestañas mostrar para una oferta basándose en los datos
 *  del pliego (presupuesto + % criterios subjetivos). Esto refleja la
 *  realidad legal del procedimiento — declaración + económica siempre,
 *  memoria técnica solo cuando hay juicio de valor.
 */
export type OfertaTab = "declaracion" | "economica" | "tecnica";

export interface TabsDecision {
  tabs: OfertaTab[];
  /** Mensaje contextual sobre por qué hay 2 o 3 pestañas. */
  motivo: string;
}

export function decidirTabs(item: {
  presupuesto_base: string | null;
  pct_criterios_subjetivos: string | null;
  pliego_analizado: boolean;
}): TabsDecision {
  // Sin análisis IA del pliego → mostramos las 3 con aviso para que el
  // usuario revise el PCAP manualmente.
  if (!item.pliego_analizado) {
    return {
      tabs: ["declaracion", "economica", "tecnica"],
      motivo:
        "El pliego aún no se ha analizado con IA. Mostramos las tres por seguridad — revisa el PCAP para confirmar qué exige tu licitación.",
    };
  }

  const subj = item.pct_criterios_subjetivos
    ? parseFloat(item.pct_criterios_subjetivos)
    : 0;

  if (subj > 0) {
    return {
      tabs: ["declaracion", "economica", "tecnica"],
      motivo: `Este pliego tiene un ${subj.toFixed(0)}% de criterios de juicio de valor. Necesitarás aportar memoria técnica además de la oferta económica.`,
    };
  }

  return {
    tabs: ["declaracion", "economica"],
    motivo:
      "Este pliego se valora íntegramente por fórmulas automáticas (sin juicio de valor). Solo necesitas la declaración responsable y la oferta económica.",
  };
}
