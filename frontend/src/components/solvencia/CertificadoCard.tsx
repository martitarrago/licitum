import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Tag,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { CertificadoObraListItem, EstadoCertificado } from "@/lib/api/certificados";

interface EstadoStyle {
  label: string;
  Icon: LucideIcon;
  stripe: string;
  badge: string;
  iconColor: string;
}

const estadoStyles: Record<EstadoCertificado, EstadoStyle> = {
  procesando: {
    label: "Procesando",
    Icon: Clock,
    stripe: "bg-primary-500",
    badge: "bg-primary-50 ring-primary-200 dark:bg-primary-900/20 dark:ring-primary-700/30",
    iconColor: "text-primary-500",
  },
  pendiente_revision: {
    label: "Pendiente",
    Icon: AlertCircle,
    stripe: "bg-amber-400",
    badge: "bg-warning/10 ring-warning/25 dark:bg-warning/20",
    iconColor: "text-warning",
  },
  validado: {
    label: "Válido",
    Icon: CheckCircle2,
    stripe: "bg-success",
    badge: "bg-success/10 ring-success/25 dark:bg-success/20",
    iconColor: "text-success",
  },
  rechazado: {
    label: "Rechazado",
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

function formatFechaCorta(d: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    month: "short",
    year: "numeric",
  }).format(d);
}

export function CertificadoCard({
  cert,
  caducado = false,
}: {
  cert: CertificadoObraListItem;
  caducado?: boolean;
}) {
  const estilo = estadoStyles[cert.estado];
  const StatusIcon = estilo.Icon;
  const importe = Number(cert.importe_adjudicacion);
  const fechaInicio = cert.fecha_inicio ? new Date(cert.fecha_inicio) : null;
  const fechaFin = cert.fecha_fin ? new Date(cert.fecha_fin) : null;
  const tieneExtractionError =
    cert.estado === "pendiente_revision" && Boolean(cert.extraction_error);

  const stripeColor = tieneExtractionError
    ? "bg-danger"
    : caducado
      ? "bg-muted-foreground/40"
      : estilo.stripe;

  const badgeOverride = caducado
    ? "bg-muted ring-border text-muted-foreground"
    : null;

  return (
    <Link
      href={`/solvencia/certificados/${cert.id}/revisar`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-xl"
    >
      <article
        className="
          relative flex overflow-hidden
          rounded-xl bg-surface-raised
          ring-1 ring-border
          shadow-sm transition-shadow group-hover:shadow-md
        "
      >
        {/* Franja lateral de estado */}
        <div className={`w-1.5 flex-shrink-0 ${stripeColor}`} aria-hidden="true" />

        <div className="flex flex-1 items-center gap-4 px-4 py-3 min-w-0">
          {/* Título + organismo — crece */}
          <div className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold leading-snug text-foreground group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
              {cert.titulo || <span className="text-muted-foreground italic">Sin título</span>}
            </h3>
            {cert.organismo && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                <span className="truncate">{cert.organismo}</span>
              </div>
            )}
          </div>

          {/* Período */}
          <div className="hidden sm:block w-36 flex-shrink-0 text-right">
            {(fechaInicio || fechaFin) ? (
              <div className="text-xs font-medium tabular-nums text-foreground">
                {fechaInicio && fechaFin
                  ? `${formatFechaCorta(fechaInicio)} – ${formatFechaCorta(fechaFin)}`
                  : fechaFin
                    ? formatFechaCorta(fechaFin)
                    : fechaInicio
                      ? formatFechaCorta(fechaInicio)
                      : "—"}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            <div className="text-[11px] text-muted-foreground">Período</div>
          </div>

          {/* Importe */}
          <div className="hidden md:block w-28 flex-shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {importe > 0 ? importeFormatter.format(importe) : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">Importe</div>
          </div>

          {/* Grupo ROLECE */}
          <div className="hidden lg:block w-20 flex-shrink-0 text-center">
            {cert.clasificacion_grupo ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                <Tag className="h-3 w-3" aria-hidden="true" />
                {cert.clasificacion_grupo}
                {cert.clasificacion_subgrupo && `-${cert.clasificacion_subgrupo}`}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
          </div>

          {/* Badge de estado */}
          <div className="flex-shrink-0">
            {tieneExtractionError ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger ring-1 ring-inset ring-danger/25"
                title={cert.extraction_error ?? undefined}
              >
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                Error
              </span>
            ) : (
              <span
                className={`
                  inline-flex items-center gap-1.5
                  rounded-full px-2.5 py-1
                  text-xs font-semibold text-muted-foreground
                  ring-1 ring-inset
                  ${badgeOverride ?? estilo.badge}
                `}
                role="status"
              >
                {caducado ? (
                  <Clock className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <StatusIcon className={`h-3 w-3 ${estilo.iconColor}`} aria-hidden="true" />
                )}
                {caducado ? "Caducado" : estilo.label}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
