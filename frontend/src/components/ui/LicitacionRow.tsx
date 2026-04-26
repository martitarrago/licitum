import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";

type Semaforo = "verde" | "amarillo" | "rojo";

interface LicitacionRowProps {
  titulo: string;
  organismo: string;
  importe: number;
  fechaLimite: Date;
  semaforo: Semaforo;
  /** Afinidad histórica 0-1 — sólo se muestra el chip si ≥0.3 */
  afinidad?: number | null;
}

interface SemaforoStyle {
  Icon: LucideIcon;
  stripe: string;
  iconColor: string;
}

const semaforoStyles: Record<Semaforo, SemaforoStyle> = {
  verde:    { Icon: CheckCircle2, stripe: "bg-success", iconColor: "text-success" },
  amarillo: { Icon: AlertCircle,  stripe: "bg-warning", iconColor: "text-warning" },
  rojo:     { Icon: XCircle,      stripe: "bg-danger",  iconColor: "text-danger"  },
};

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
  afinidad,
}: LicitacionRowProps) {
  const estilo = semaforoStyles[semaforo];
  const StatusIcon = estilo.Icon;
  const dias = diasHasta(fechaLimite);
  const cerrada = dias < 0;
  const urgente = dias >= 0 && dias <= 7;
  const afinidadAlta = (afinidad ?? 0) >= 0.7;

  return (
    <article
      className="
        group relative flex items-stretch overflow-hidden
        rounded-lg bg-surface-raised
        ring-1 ring-border
        transition-all hover:ring-foreground/20
      "
    >
      <div className={`w-1 flex-shrink-0 ${estilo.stripe}`} aria-hidden="true" />

      <div className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3">
        <StatusIcon
          className={`h-4 w-4 flex-shrink-0 ${estilo.iconColor}`}
          aria-hidden="true"
        />

        {/* Título + organismo (cuerpo flexible) */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {titulo}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{organismo}</span>
            {afinidadAlta && (
              <span
                className="ml-1 inline-flex items-center gap-1 text-[11px] font-medium text-foreground"
                title={`Afinidad histórica: ${afinidad?.toFixed(2)}`}
              >
                <Sparkles className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Cliente conocido</span>
              </span>
            )}
          </div>
        </div>

        {/* Importe (anchura fija para alinear) */}
        <div className="hidden flex-shrink-0 text-right sm:block">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {importeFormatter.format(importe)}
          </div>
        </div>

        {/* Fecha + días (anchura fija) */}
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
