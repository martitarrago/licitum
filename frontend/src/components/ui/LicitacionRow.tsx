type Semaforo = "verde" | "amarillo" | "rojo";

interface LicitacionRowProps {
  titulo: string;
  organismo: string;
  importe: number;
  fechaLimite: Date;
  semaforo: Semaforo;
  /** Score 0-100 del motor de ganabilidad. Si está, manda sobre el semáforo. */
  score?: number | null;
  /** Afinidad histórica 0-1 — sólo se muestra el chip si ≥0.7 */
  afinidad?: number | null;
}

const STRIPE_BY_SEMAFORO: Record<Semaforo, string> = {
  verde: "bg-success",
  amarillo: "bg-warning",
  rojo: "bg-danger",
};

// Mismos 4 tiers que ScoreChip + LicitacionCard.
function stripeByScore(score: number | null | undefined): string | null {
  if (typeof score !== "number") return null;
  if (score >= 80) return "bg-info";
  if (score >= 65) return "bg-success";
  if (score >= 50) return "bg-warning";
  return "bg-danger";
}

const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const fechaCortaFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
});

function diasHasta(fecha: Date): number {
  const ms = fecha.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function textoDiasRestantes(dias: number): string {
  if (dias < 0) return "Cerrada";
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `${dias}d`;
}

export function LicitacionRow({
  titulo,
  organismo,
  importe,
  fechaLimite,
  semaforo,
  score,
  afinidad,
}: LicitacionRowProps) {
  const stripe = stripeByScore(score) ?? STRIPE_BY_SEMAFORO[semaforo];
  const dias = diasHasta(fechaLimite);
  const cerrada = dias < 0;
  const urgente = dias >= 0 && dias <= 7;
  const afinidadAlta = (afinidad ?? 0) >= 0.7;

  return (
    <article className="group/row relative flex items-stretch overflow-hidden rounded-lg bg-surface-raised ring-1 ring-border transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-elev-1 hover:ring-foreground/15">
      <div className={`w-1 flex-shrink-0 ${stripe}`} aria-hidden="true" />

      <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
            {titulo}
          </h3>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{organismo}</span>
            {afinidadAlta && (
              <span
                className="hidden whitespace-nowrap font-medium uppercase tracking-wider text-[10px] text-foreground sm:inline"
                title={`Afinidad histórica: ${afinidad?.toFixed(2)}`}
              >
                · Cliente conocido
              </span>
            )}
          </div>
        </div>

        <div className="hidden flex-shrink-0 text-right sm:block">
          <div className="display-num text-sm text-foreground">
            {importeFormatter.format(importe)}
          </div>
        </div>

        <div className="w-20 flex-shrink-0 text-right">
          <div className="text-xs tabular-nums text-muted-foreground">
            {fechaCortaFormatter.format(fechaLimite)}
          </div>
          <div
            className={`text-[11px] font-medium tabular-nums ${
              cerrada
                ? "text-muted-foreground"
                : urgente
                  ? "text-danger"
                  : "text-muted-foreground"
            }`}
          >
            {textoDiasRestantes(dias)}
          </div>
        </div>
      </div>
    </article>
  );
}
