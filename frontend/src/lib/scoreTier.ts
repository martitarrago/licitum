// Tiers visuales del score 0-100. Fuente única de verdad — usado por
// ScoreChip, LicitacionCard, LicitacionRow y el detalle del Radar.
//
// Umbrales (recalibrados tras el suavizado de buckets continuos):
//   ≥80  excelente  azul    (avg viable ~67, max ~85; ≥80 deja ~10 azules)
//   ≥65  buena      verde
//   ≥50  raso       ámbar
//   <50  no_apta    rojo

export type ScoreTier = "excelente" | "buena" | "raso" | "no_apta";

export interface ScoreTierStyle {
  tier: ScoreTier;
  label: string;
  /** Fondo sólido — para franjas y barras (`bg-info`). */
  bg: string;
  /** Fondo translúcido — para chips (`bg-info/10`). */
  bgSoft: string;
  /** Ring translúcido para chips (`ring-info/30`). */
  ring: string;
  /** Color de texto (`text-info`). */
  text: string;
}

const STYLES: Record<ScoreTier, ScoreTierStyle> = {
  excelente: { tier: "excelente", label: "Excelente",     bg: "bg-info",    bgSoft: "bg-info/10",    ring: "ring-info/30",    text: "text-info"    },
  buena:     { tier: "buena",     label: "Buena",         bg: "bg-success", bgSoft: "bg-success/10", ring: "ring-success/30", text: "text-success" },
  raso:      { tier: "raso",      label: "Aprobada raso", bg: "bg-warning", bgSoft: "bg-warning/10", ring: "ring-warning/30", text: "text-warning" },
  no_apta:   { tier: "no_apta",   label: "No apta",       bg: "bg-danger",  bgSoft: "bg-danger/10",  ring: "ring-danger/30",  text: "text-danger"  },
};

export function scoreTier(score: number): ScoreTierStyle {
  if (score >= 80) return STYLES.excelente;
  if (score >= 65) return STYLES.buena;
  if (score >= 50) return STYLES.raso;
  return STYLES.no_apta;
}

/** Versión tolerante a null/undefined — útil para callers que reciben un score opcional. */
export function scoreTierOrNull(score: number | null | undefined): ScoreTierStyle | null {
  if (typeof score !== "number") return null;
  return scoreTier(score);
}
