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
    label: "Pendiente de revisión",
    Icon: AlertCircle,
    stripe: "bg-primary-200",
    badge: "bg-warning/10 ring-warning/25 dark:bg-warning/20",
    iconColor: "text-warning",
  },
  validado: {
    label: "Validado",
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

const fechaFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatFechaCorta(d: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(d);
}

export function CertificadoCard({ cert }: { cert: CertificadoObraListItem }) {
  const estilo = estadoStyles[cert.estado];
  const StatusIcon = estilo.Icon;
  const importe = Number(cert.importe_adjudicacion);
  const fechaInicio = cert.fecha_inicio ? new Date(cert.fecha_inicio) : null;
  const fechaFin = cert.fecha_fin ? new Date(cert.fecha_fin) : null;
  const tieneExtractionError =
    cert.estado === "pendiente_revision" && Boolean(cert.extraction_error);

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
        <div
          className={`w-2 flex-shrink-0 ${
            tieneExtractionError ? "bg-danger" : estilo.stripe
          }`}
          aria-hidden="true"
        />

        <div className="flex flex-1 flex-col gap-4 p-5">
          {/* Badge de estado */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`
                inline-flex items-center gap-1.5
                rounded-full px-3 py-1
                text-xs font-semibold text-muted-foreground
                ring-1 ring-inset
                ${estilo.badge}
              `}
              role="status"
            >
              <StatusIcon
                className={`h-3.5 w-3.5 ${estilo.iconColor}`}
                aria-hidden="true"
              />
              {estilo.label}
            </div>
            {tieneExtractionError && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger ring-1 ring-inset ring-danger/25"
                title={cert.extraction_error ?? undefined}
              >
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                Extracción fallida
              </span>
            )}
          </div>

          {/* Título + organismo */}
          <div className="space-y-1.5">
            <h3 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">
              {cert.titulo || "Sin título"}
            </h3>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="truncate">{cert.organismo}</span>
            </div>
          </div>

          {/* Datos clave */}
          <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
            <div>
              <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Importe
              </div>
              <div className="text-lg font-semibold tabular-nums text-foreground">
                {importe > 0 ? importeFormatter.format(importe) : "—"}
              </div>
            </div>
            {(fechaInicio || fechaFin) && (
              <div>
                <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Período
                </div>
                <div className="text-sm font-medium tabular-nums text-foreground">
                  {fechaInicio && fechaFin
                    ? `${formatFechaCorta(fechaInicio)} – ${formatFechaCorta(fechaFin)}`
                    : fechaFin
                      ? fechaFormatter.format(fechaFin)
                      : fechaInicio
                        ? fechaFormatter.format(fechaInicio)
                        : "—"}
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          {(cert.clasificacion_grupo || cert.cpv_codes.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {cert.clasificacion_grupo && (
                <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  Grupo {cert.clasificacion_grupo}
                  {cert.clasificacion_subgrupo && `-${cert.clasificacion_subgrupo}`}
                </span>
              )}
              {cert.cpv_codes.slice(0, 2).map((cpv) => (
                <span
                  key={cpv}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
                >
                  <Tag className="h-3 w-3" aria-hidden="true" />
                  {cpv}
                </span>
              ))}
              {cert.cpv_codes.length > 2 && (
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                  +{cert.cpv_codes.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}
