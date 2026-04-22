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
    stripe: "",
    badge: "bg-muted ring-border",
    iconColor: "text-foreground",
  },
  pendiente_revision: {
    label: "Pendiente",
    Icon: AlertCircle,
    stripe: "",
    badge: "bg-warning/10 ring-warning/25 dark:bg-warning/20",
    iconColor: "text-warning",
  },
  validado: {
    label: "Válido",
    Icon: CheckCircle2,
    stripe: "",
    badge: "bg-success/10 ring-success/25 dark:bg-success/20",
    iconColor: "text-success",
  },
  rechazado: {
    label: "Rechazado",
    Icon: XCircle,
    stripe: "",
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
  porCaducar = false,
  posibleDuplicado = false,
  selected = false,
  onToggleSelect,
}: {
  cert: CertificadoObraListItem;
  caducado?: boolean;
  porCaducar?: boolean;
  posibleDuplicado?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}) {
  const estilo = estadoStyles[cert.estado];
  const StatusIcon = estilo.Icon;
  const importe = Number(cert.importe_adjudicacion);
  const fechaInicio = cert.fecha_inicio ? new Date(cert.fecha_inicio) : null;
  const fechaFin = cert.fecha_fin ? new Date(cert.fecha_fin) : null;
  const tieneExtractionError =
    cert.estado === "pendiente_revision" && Boolean(cert.extraction_error);

  const badgeOverride = caducado
    ? "bg-muted ring-border text-muted-foreground"
    : null;

  return (
    <Link
      href={`/solvencia/certificados/${cert.id}/revisar`}
      className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-xl"
    >
      <article
        className={`
          relative flex overflow-hidden
          rounded-xl bg-surface-raised
          shadow-sm transition-shadow group-hover:shadow-md
          ${selected ? "ring-2 ring-foreground" : "ring-1 ring-border"}
        `}
      >
        {onToggleSelect && (
          <div
            className="flex-shrink-0 flex items-center pl-4 pr-1"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(cert.id); }}
          >
            <input
              type="checkbox"
              checked={selected}
              onChange={() => {}}
              className="h-4 w-4 cursor-pointer accent-foreground"
              aria-label={selected ? "Deseleccionar" : "Seleccionar"}
            />
          </div>
        )}
        <div className="flex flex-1 items-center gap-4 px-5 py-3 min-w-0">
          {/* Título + organismo — crece */}
          <div className="flex-1 min-w-0">
            <h3 className="truncate text-sm font-semibold leading-snug text-foreground group-hover:text-foreground/70 transition-colors">
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
          </div>

          {/* Importe */}
          <div className="hidden md:block w-28 flex-shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums text-foreground">
              {importe > 0 ? importeFormatter.format(importe) : "—"}
            </div>
          </div>

          {/* Grupo ROLECE + UTE badge */}
          <div className="hidden lg:flex flex-col items-center gap-1 w-24 flex-shrink-0">
            {cert.clasificacion_grupo ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                <Tag className="h-3 w-3" aria-hidden="true" />
                {cert.clasificacion_grupo}
                {cert.clasificacion_subgrupo && `-${cert.clasificacion_subgrupo}`}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            )}
            {cert.porcentaje_ute != null && (
              <span className="text-[10px] font-medium text-muted-foreground">
                UTE {cert.porcentaje_ute}%
              </span>
            )}
          </div>

          {/* Badge de estado */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1 lg:w-16">
            {tieneExtractionError ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-1 text-xs font-semibold text-danger ring-1 ring-inset ring-danger/25"
                title={cert.extraction_error ?? "Error de extracción"}
              >
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Error</span>
              </span>
            ) : (
              <span
                className={`
                  inline-flex items-center justify-center
                  rounded-full p-1.5
                  ring-1 ring-inset
                  ${badgeOverride ?? estilo.badge}
                `}
                role="status"
                title={caducado ? "Caducado" : estilo.label}
              >
                {caducado ? (
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <StatusIcon className={`h-3.5 w-3.5 ${estilo.iconColor}`} aria-hidden="true" />
                )}
                <span className="sr-only">{caducado ? "Caducado" : estilo.label}</span>
              </span>
            )}
            {porCaducar && !caducado && (
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Caduca pronto
              </span>
            )}
            {cert.es_valido_solvencia === false && cert.estado === "validado" && (
              <span className="text-[10px] font-medium text-warning">
                No computa
              </span>
            )}
            {posibleDuplicado && (
              <span className="text-[10px] font-medium text-muted-foreground">
                Duplicado
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
