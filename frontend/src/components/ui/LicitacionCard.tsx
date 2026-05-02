import { scoreTier } from "@/lib/scoreTier";

type Semaforo = "verde" | "amarillo" | "rojo";

type PliegoEstado =
  | "pendiente"
  | "procesando"
  | "completado"
  | "fallido"
  | "documento_no_disponible";

type PliegoVeredicto = "ir" | "ir_con_riesgo" | "no_ir" | "incompleto";

interface LicitacionCardProps {
  titulo: string;
  organismo: string;
  importe: number;
  fechaLimite: Date;
  semaforo: Semaforo;
  cpvs: string[];
  /** Score de ganabilidad 0-100 del motor PSCP+M2. Tiñe la franja superior y se muestra en el extremo superior derecho. */
  score?: number | null;
  /** Estado del análisis IA del pliego (M3 Phase 2 B4). */
  pliegoEstado?: PliegoEstado | null;
  pliegoVeredicto?: PliegoVeredicto | null;
}

const semaforoStripe: Record<Semaforo, string> = {
  verde: "bg-success",
  amarillo: "bg-warning",
  rojo: "bg-danger",
};


// Phase 2 B4 — badge del estado del pliego, debajo del score.
// Cuatro estados visibles + uno transitorio:
//   ✓ analizado y encaja        (estado=completado + veredicto=ir)
//   ⚠ analizado con matices     (estado=completado + veredicto=ir_con_riesgo)
//   ⚪ analizado parcial         (estado=completado + veredicto=incompleto)
//   ⊘ no descargable             (estado=documento_no_disponible)
//   ○ pendiente / analizando     (estado=pendiente | procesando)
//   ! error de análisis          (estado=fallido)
//   null sin entrada todavía     → no renderizar nada
function pliegoBadge(
  estado: PliegoEstado | null | undefined,
  veredicto: PliegoVeredicto | null | undefined,
): { glyph: string; tone: string; title: string } | null {
  if (!estado) return null;
  if (estado === "documento_no_disponible") {
    return { glyph: "⊘", tone: "text-muted-foreground", title: "Pliego no descargable desde PSCP" };
  }
  if (estado === "pendiente" || estado === "procesando") {
    return { glyph: "○", tone: "text-muted-foreground", title: "Pliego pendiente de análisis" };
  }
  if (estado === "fallido") {
    return { glyph: "!", tone: "text-danger", title: "Error en el análisis del pliego" };
  }
  // estado === "completado"
  if (veredicto === "ir") {
    return { glyph: "✓", tone: "text-success", title: "Pliego confirma encaje" };
  }
  if (veredicto === "ir_con_riesgo") {
    return { glyph: "⚠", tone: "text-warning", title: "Pliego con matices a vigilar" };
  }
  if (veredicto === "no_ir") {
    return { glyph: "✗", tone: "text-danger", title: "No recomendado presentarse" };
  }
  // incompleto o veredicto null
  return { glyph: "⚪", tone: "text-muted-foreground", title: "Pliego analizado parcialmente" };
}

const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const fechaFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function diasHasta(fecha: Date): number {
  const now = new Date();
  const hoyUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fechaUtc = Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  return Math.ceil((fechaUtc - hoyUtc) / (1000 * 60 * 60 * 24));
}

function textoDiasRestantes(dias: number): string {
  if (dias < 0) return "Cerrada";
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}

export function LicitacionCard({
  titulo,
  organismo,
  importe,
  fechaLimite,
  semaforo,
  cpvs,
  score,
  pliegoEstado,
  pliegoVeredicto,
}: LicitacionCardProps) {
  const dias = diasHasta(fechaLimite);
  const urgente = dias >= 0 && dias <= 7;
  const cerrada = dias < 0;
  const hasScore = typeof score === "number";
  const tone = hasScore ? scoreTier(score!) : null;
  const stripeClass = tone ? tone.bg : semaforoStripe[semaforo];
  const badge = pliegoBadge(pliegoEstado, pliegoVeredicto);

  return (
    <article className="card-interactive group relative flex flex-col overflow-hidden">
      {/* Franja superior fina — color del score (o semáforo de fallback) */}
      <div className={`h-[3px] flex-shrink-0 ${stripeClass}`} aria-hidden="true" />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Título + organismo, score en extremo superior derecho */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-snug tracking-tight text-foreground">
              {titulo}
            </h3>
            <p className="truncate text-sm text-muted-foreground">{organismo}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {hasScore && tone && (
              <div
                className={`display-num text-lg font-bold tabular-nums leading-none ${tone.text}`}
                aria-label={`Puntuación ${Math.round(score!)} de 100`}
              >
                {Math.round(score!)}
              </div>
            )}
            {badge && (
              <span
                className={`text-sm leading-none ${badge.tone}`}
                title={badge.title}
                aria-label={badge.title}
              >
                {badge.glyph}
              </span>
            )}
          </div>
        </div>

        {/* Datos clave — importe + fecha */}
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div>
            <div className="eyebrow mb-1">Importe</div>
            <div className="display-num text-xl text-foreground">
              {importeFormatter.format(importe)}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-1">Cierra</div>
            <div className="text-sm font-medium tabular-nums text-foreground">
              {fechaFormatter.format(fechaLimite)}
            </div>
            <div
              className={`mt-0.5 text-xs tabular-nums ${
                cerrada
                  ? "text-muted-foreground"
                  : urgente
                    ? "font-semibold text-danger"
                    : "text-muted-foreground"
              }`}
            >
              {textoDiasRestantes(dias)}
            </div>
          </div>
        </div>

        {/* CPVs */}
        {cpvs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cpvs.map((cpv) => (
              <span
                key={cpv}
                className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10.5px] tracking-tight text-muted-foreground"
              >
                {cpv}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Ejemplo de uso ─────────────────────────────────────────────────────

export function LicitacionCardExample() {
  return (
    <div className="mx-auto grid max-w-md gap-4 p-8">
      <LicitacionCard
        titulo="Reforma integral del pabellón deportivo municipal"
        organismo="Ajuntament de Sant Cugat del Vallès"
        importe={487500}
        fechaLimite={new Date(2026, 4, 15)}
        semaforo="verde"
        cpvs={["45212200-8", "45310000-3"]}
        score={82}
      />
      <LicitacionCard
        titulo="Pavimentación y mejora de aceras en el barrio de Gràcia"
        organismo="Àrea Metropolitana de Barcelona"
        importe={1245800}
        fechaLimite={new Date(2026, 3, 22)}
        semaforo="amarillo"
        cpvs={["45233252-0", "45233222-1", "45112500-0"]}
        score={54}
      />
      <LicitacionCard
        titulo="Construcción de nueva escuela de educación infantil CEIP Les Corts"
        organismo="Generalitat de Catalunya — Departament d'Educació"
        importe={3850000}
        fechaLimite={new Date(2026, 4, 19)}
        semaforo="rojo"
        cpvs={["45214210-5", "45300000-0", "45400000-1"]}
        score={28}
      />
    </div>
  );
}
