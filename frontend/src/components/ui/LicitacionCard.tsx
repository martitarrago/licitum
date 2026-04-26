import {
  AlertCircle,
  Building2,
  Calendar,
  CheckCircle2,
  Tag,
  XCircle,
  type LucideIcon,
} from "lucide-react";

type Semaforo = "verde" | "amarillo" | "rojo";

interface LicitacionCardProps {
  titulo: string;
  organismo: string;
  importe: number;
  fechaLimite: Date;
  semaforo: Semaforo;
  cpvs: string[];
  /** Razón explicativa generada por el evaluator de solvencia. Se muestra
   *  como tooltip nativo del badge y como texto pequeño bajo el badge. */
  razon?: string | null;
}

interface SemaforoStyle {
  label: string;
  Icon: LucideIcon;
  stripe: string;     // franja lateral — color sólido
  badge: string;      // bg + ring del badge (sin color de texto)
  iconColor: string;  // color del icono dentro del badge
}

// El texto del badge SIEMPRE va en text-muted-foreground.
// Los colores del semáforo se reservan para elementos no-textuales:
// franja lateral e icono. Así el badge respira más y se ve profesional
// en densidad de dashboard.
const semaforoStyles: Record<Semaforo, SemaforoStyle> = {
  verde: {
    label: "Cumple solvencia",
    Icon: CheckCircle2,
    stripe: "bg-success",
    badge: "bg-success/10 ring-success/25 dark:bg-success/20",
    iconColor: "text-success",
  },
  amarillo: {
    label: "Solvencia ajustada",
    Icon: AlertCircle,
    stripe: "bg-warning",
    badge: "bg-warning/10 ring-warning/25 dark:bg-warning/20",
    iconColor: "text-warning",
  },
  rojo: {
    label: "No cumple solvencia",
    Icon: XCircle,
    stripe: "bg-danger",
    badge: "bg-danger/10 ring-danger/25 dark:bg-danger/20",
    iconColor: "text-danger",
  },
};

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
  const ms = fecha.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
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
  razon,
}: LicitacionCardProps) {
  const estilo = semaforoStyles[semaforo];
  const StatusIcon = estilo.Icon;
  const dias = diasHasta(fechaLimite);
  const urgente = dias >= 0 && dias <= 7;
  const cerrada = dias < 0;

  return (
    <article
      className="
        group relative flex overflow-hidden
        rounded-xl bg-surface-raised
        ring-1 ring-border
        shadow-sm transition-shadow hover:shadow-md
      "
    >
      {/* Franja de semáforo — cue visual principal, siempre visible */}
      <div
        className={`w-2 flex-shrink-0 ${estilo.stripe}`}
        aria-hidden="true"
      />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Badge de semáforo + razón */}
        <div className="space-y-1.5">
          <div
            className={`
              inline-flex items-center gap-1.5
              rounded-full px-3 py-1
              text-xs font-semibold text-muted-foreground
              ring-1 ring-inset
              ${estilo.badge}
            `}
            role="status"
            title={razon ?? undefined}
          >
            <StatusIcon
              className={`h-3.5 w-3.5 ${estilo.iconColor}`}
              aria-hidden="true"
            />
            {estilo.label}
          </div>
          {razon && (
            <p
              className="line-clamp-2 text-[11px] leading-snug text-muted-foreground"
              title={razon}
            >
              {razon}
            </p>
          )}
        </div>

        {/* Título + organismo */}
        <div className="space-y-1.5">
          <h3 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">
            {titulo}
          </h3>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{organismo}</span>
          </div>
        </div>

        {/* Datos clave — importe + fecha */}
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div>
            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Importe
            </div>
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {importeFormatter.format(importe)}
            </div>
          </div>
          <div>
            <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3 w-3" aria-hidden="true" />
              Fecha límite
            </div>
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
                className="
                  inline-flex items-center gap-1
                  rounded-md bg-muted px-2 py-0.5
                  font-mono text-xs text-muted-foreground
                "
              >
                <Tag className="h-3 w-3" aria-hidden="true" />
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
// Tres cards cubriendo los tres estados del semáforo con datos realistas
// para el contexto catalán (organismos, CPVs de construcción, importes PYME).

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
      />
      <LicitacionCard
        titulo="Pavimentación y mejora de aceras en el barrio de Gràcia"
        organismo="Àrea Metropolitana de Barcelona"
        importe={1245800}
        fechaLimite={new Date(2026, 3, 22)}
        semaforo="amarillo"
        cpvs={["45233252-0", "45233222-1", "45112500-0"]}
      />
      <LicitacionCard
        titulo="Construcción de nueva escuela de educación infantil CEIP Les Corts"
        organismo="Generalitat de Catalunya — Departament d'Educació"
        importe={3850000}
        fechaLimite={new Date(2026, 4, 19)}
        semaforo="rojo"
        cpvs={["45214210-5", "45300000-0", "45400000-1"]}
      />
    </div>
  );
}
