"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Sparkles,
  Tag,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  licitacionesApi,
  PROVINCIAS_LABEL,
  TIPOS_ORGANISMO_LABEL,
  type LicitacionDetail,
  type Provincia,
  type SemaforoType,
  type TipoOrganismo,
} from "@/lib/api/licitaciones";

const TIPO_CONTRATO_LABEL: Record<string, string> = {
  obras: "Obras",
  concesion_obras: "Concesión de obras",
  servicios: "Servicios",
  suministros: "Suministros",
  concesion_servicios: "Concesión de servicios",
  servicios_especiales: "Servicios especiales",
  concesion_servicios_especiales: "Concesión de servicios especiales",
  administrativo_especial: "Administrativo especial",
  privado: "Privado",
};

interface SemaforoStyle {
  label: string;
  Icon: LucideIcon;
  stripe: string;
  badgeBg: string;
  badgeRing: string;
  iconColor: string;
}

const semaforoStyles: Record<SemaforoType, SemaforoStyle> = {
  verde: {
    label: "Cumple solvencia",
    Icon: CheckCircle2,
    stripe: "bg-success",
    badgeBg: "bg-success/10",
    badgeRing: "ring-success/25",
    iconColor: "text-success",
  },
  amarillo: {
    label: "Solvencia ajustada",
    Icon: AlertCircle,
    stripe: "bg-warning",
    badgeBg: "bg-warning/10",
    badgeRing: "ring-warning/25",
    iconColor: "text-warning",
  },
  rojo: {
    label: "No cumple solvencia",
    Icon: XCircle,
    stripe: "bg-danger",
    badgeBg: "bg-danger/10",
    badgeRing: "ring-danger/25",
    iconColor: "text-danger",
  },
  gris: {
    label: "Sin clasificar",
    Icon: AlertCircle,
    stripe: "bg-muted-foreground/40",
    badgeBg: "bg-muted",
    badgeRing: "ring-border",
    iconColor: "text-muted-foreground",
  },
};

const fmtEur = (v: string | number | null | undefined): string => {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
};

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const ms = new Date(fecha).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function afinidadInfo(score: number | null): { label: string; tone: string } | null {
  if (score == null || score < 0.3) return null;
  if (score >= 0.7) {
    return { label: "Has trabajado antes con este organismo", tone: "text-foreground" };
  }
  return { label: "Tipo de obra similar a tu histórico", tone: "text-foreground" };
}

function provinciasLegibles(provincias: Provincia[]): string {
  if (!provincias.length) return "—";
  if (provincias.length === 4) return "Toda Cataluña";
  return provincias.map((p) => PROVINCIAS_LABEL[p]).join(", ");
}

interface DataRowProps {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}

function DataRow({ label, children, mono = false }: DataRowProps) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-full sm:w-44 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={[
          "min-w-0 flex-1 text-sm text-foreground",
          mono ? "font-mono text-[13px]" : "",
        ].join(" ")}
      >
        {children}
      </dd>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LicitacionDetailPage({
  params,
}: {
  params: { expediente: string };
}) {
  const expediente = decodeURIComponent(params.expediente);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["licitacion", expediente],
    queryFn: () => licitacionesApi.get(expediente),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      {/* Volver */}
      <Link
        href="/radar"
        className="
          mb-6 inline-flex items-center gap-1.5 text-sm font-medium
          text-muted-foreground transition-colors hover:text-foreground
        "
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al Radar
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <XCircle className="h-10 w-10 text-danger" aria-hidden="true" />
          <p className="text-sm font-semibold text-danger">
            No se pudo cargar la licitación.
          </p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : "Error desconocido"}
          </p>
        </div>
      )}

      {data && <Detail licitacion={data} />}
    </main>
  );
}

function Detail({ licitacion: l }: { licitacion: LicitacionDetail }) {
  const semaforo = (l.semaforo === "gris" ? "gris" : l.semaforo) as SemaforoType;
  const estilo = semaforoStyles[semaforo];
  const Status = estilo.Icon;
  const dias = diasHasta(l.fecha_limite);
  const cerrada = dias != null && dias < 0;
  const urgente = dias != null && dias >= 0 && dias <= 7;
  const afinidad = l.score_afinidad ? parseFloat(l.score_afinidad) : null;
  const af = afinidadInfo(afinidad);
  const tipoCat = TIPO_CONTRATO_LABEL[l.tipo_contrato ?? ""] ?? l.tipo_contrato ?? "—";

  return (
    <article className="overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm">
      {/* Header con franja semáforo */}
      <div className="flex">
        <div
          className={`w-2 flex-shrink-0 ${estilo.stripe}`}
          aria-hidden="true"
        />
        <div className="flex flex-1 flex-col gap-5 px-6 py-6 sm:px-8 sm:py-7">
          {/* Badge semáforo */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`
                inline-flex items-center gap-1.5
                rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground
                ring-1 ring-inset ${estilo.badgeBg} ${estilo.badgeRing}
              `}
              role="status"
            >
              <Status
                className={`h-3.5 w-3.5 ${estilo.iconColor}`}
                aria-hidden="true"
              />
              {estilo.label}
            </div>
            {af && (
              <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${af.tone}`}>
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {af.label}
              </div>
            )}
          </div>

          {/* Razón explicativa del semáforo */}
          {l.semaforo_razon && (
            <p className="text-sm leading-relaxed text-foreground">
              {l.semaforo_razon}
            </p>
          )}

          {/* Título */}
          <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {l.titulo ?? "Sin título"}
          </h1>

          {/* Organismo y departamento */}
          <div className="space-y-1.5 text-sm text-muted-foreground">
            {l.organismo && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="text-foreground">{l.organismo}</span>
              </div>
            )}
            {l.raw_data?.nom_departament_ens && (
              <div className="flex items-center gap-2 pl-6">
                <span>{l.raw_data.nom_departament_ens}</span>
              </div>
            )}
            {l.raw_data?.lloc_execucio && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{l.raw_data.lloc_execucio}</span>
              </div>
            )}
          </div>

          {/* CTA principal: ver pliego oficial */}
          {l.url_placsp && (
            <div className="flex flex-wrap gap-3 border-t border-border pt-5">
              <a
                href={l.url_placsp}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  inline-flex items-center gap-2 rounded-lg
                  bg-foreground px-5 py-2.5 text-sm font-medium text-surface
                  transition-opacity hover:opacity-85
                "
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Ver pliego oficial en PSCP
              </a>
              <p className="self-center text-xs text-muted-foreground">
                Se abre en otra pestaña, en la web pública de la Generalitat
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Datos clave en grid */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-border bg-surface px-6 py-6 sm:px-8 sm:py-7 md:grid-cols-2">
        <KPI label="Importe" value={fmtEur(l.importe_licitacion)} />
        <KPI
          label="Fecha límite"
          value={fmtDate(l.fecha_limite)}
          hint={
            dias != null
              ? cerrada
                ? "Cerrada"
                : urgente
                  ? `En ${dias} día${dias !== 1 ? "s" : ""}`
                  : `En ${dias} días`
              : undefined
          }
          hintTone={cerrada ? "muted" : urgente ? "danger" : "muted"}
        />
        <KPI label="Publicada" value={fmtDate(l.fecha_publicacion)} />
        <KPI
          label="Duración"
          value={l.raw_data?.durada_contracte ?? "—"}
        />
      </div>

      {/* Detalle administrativo */}
      <dl className="space-y-4 border-t border-border bg-surface-raised px-6 py-6 sm:px-8 sm:py-7">
        <DataRow label="Expediente" mono>
          {l.expediente}
        </DataRow>
        <DataRow label="Tipo de contrato">{tipoCat}</DataRow>
        {l.tipo_procedimiento && (
          <DataRow label="Procedimiento">{l.tipo_procedimiento}</DataRow>
        )}
        {l.raw_data?.tipus_tramitacio && (
          <DataRow label="Tramitación">{l.raw_data.tipus_tramitacio}</DataRow>
        )}
        <DataRow label="CPV">
          <div className="flex flex-wrap gap-1.5">
            {l.cpv_codes.length === 0
              ? "—"
              : l.cpv_codes.map((cpv) => (
                  <span
                    key={cpv}
                    className="
                      inline-flex items-center gap-1 rounded-md bg-muted
                      px-2 py-0.5 font-mono text-xs text-muted-foreground
                    "
                  >
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {cpv}
                  </span>
                ))}
          </div>
        </DataRow>
        <DataRow label="Provincia">{provinciasLegibles(l.provincias)}</DataRow>
        {l.tipo_organismo && (
          <DataRow label="Tipo de organismo">
            {TIPOS_ORGANISMO_LABEL[l.tipo_organismo as TipoOrganismo] ?? l.tipo_organismo}
          </DataRow>
        )}
        {l.raw_data?.nom_ambit && (
          <DataRow label="Ámbito">{l.raw_data.nom_ambit}</DataRow>
        )}
        {l.organismo_id && (
          <DataRow label="DIR3" mono>
            {l.organismo_id}
          </DataRow>
        )}
        {l.importe_presupuesto_base && (
          <DataRow label="Presupuesto con IVA">
            {fmtEur(l.importe_presupuesto_base)}
          </DataRow>
        )}
        {l.raw_data?.valor_estimat_contracte && (
          <DataRow label="Valor estimado">
            {fmtEur(l.raw_data.valor_estimat_contracte)}
          </DataRow>
        )}
        {(l.raw_data?.numero_lot || l.raw_data?.descripcio_lot) && (
          <DataRow label="Lote">
            {l.raw_data?.numero_lot ? `#${l.raw_data.numero_lot} · ` : ""}
            {l.raw_data?.descripcio_lot ?? ""}
          </DataRow>
        )}
      </dl>
    </article>
  );
}

function KPI({
  label,
  value,
  hint,
  hintTone = "muted",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  hintTone?: "muted" | "danger";
}) {
  return (
    <div className="flex items-start gap-3">
      <Calendar
        className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground/60"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 truncate text-base font-semibold tabular-nums text-foreground">
          {value}
        </div>
        {hint && (
          <div
            className={[
              "mt-0.5 text-xs tabular-nums",
              hintTone === "danger"
                ? "font-semibold text-danger"
                : "text-muted-foreground",
            ].join(" ")}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}
