"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calculator,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  FileSignature,
  FileText,
} from "lucide-react";
import { ESTADO_LABELS, type EstadoTracker } from "@/lib/api/tracker";
import { decidirTabs, ofertasApi, type OfertaItem } from "@/lib/api/ofertas";
import { useEmpresaId } from "@/lib/auth";

const ESTADO_TONO: Record<string, string> = {
  en_preparacion: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  presentada: "bg-zinc-200/60 text-zinc-700 ring-border dark:bg-zinc-700/40 dark:text-zinc-200",
  en_subsanacion: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  en_resolucion: "bg-zinc-200/60 text-zinc-700 ring-border dark:bg-zinc-700/40 dark:text-zinc-200",
  documentacion_previa: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  ganada: "bg-success/15 text-success ring-success/30",
  perdida: "bg-muted text-muted-foreground ring-border",
  excluida: "bg-muted text-muted-foreground ring-border",
};

const ESTADO_DOT: Record<string, string> = {
  en_preparacion: "bg-sky-500",
  presentada: "bg-zinc-400",
  en_subsanacion: "bg-amber-500",
  en_resolucion: "bg-zinc-400",
  documentacion_previa: "bg-amber-500",
  ganada: "bg-success",
  perdida: "bg-muted-foreground/40",
  excluida: "bg-muted-foreground/40",
};

const ESTADOS_RECHAZADAS = new Set<string>(["perdida", "excluida"]);

export default function OfertasListPage() {
  const empresaId = useEmpresaId();
  const [ocultarRechazadas, setOcultarRechazadas] = useState(false);

  const list = useQuery({
    queryKey: ["ofertas-list", empresaId, ocultarRechazadas],
    queryFn: () => ofertasApi.list(empresaId, ocultarRechazadas),
  });

  const total = list.data?.length ?? 0;
  const totalRechazadas = (list.data ?? []).filter(
    (o) => o.estado && ESTADOS_RECHAZADAS.has(o.estado),
  ).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 animate-fade-up">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          preparación de ofertas
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Todas las licitaciones a las que estás presentando, has presentado o
          ya están adjudicadas. Cada oferta se cierra cuando se finaliza la
          obra — antes de eso vive aquí con su estado y progreso.
        </p>
      </header>

      {!list.isLoading && total > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{total}</span>{" "}
            oferta{total !== 1 ? "s" : ""}
            {!ocultarRechazadas && totalRechazadas > 0 && (
              <>
                {" · "}
                <span className="text-muted-foreground/80">
                  {totalRechazadas} rechazada{totalRechazadas !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setOcultarRechazadas((v) => !v)}
            aria-pressed={ocultarRechazadas}
            className={[
              "inline-flex items-center gap-1.5 px-1.5 py-1.5 text-xs font-semibold transition-colors select-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground",
              ocultarRechazadas
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {ocultarRechazadas ? (
              <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {ocultarRechazadas ? "Mostrar rechazadas" : "Ocultar rechazadas"}
          </button>
        </div>
      )}

      {list.isLoading ? (
        <Skeleton />
      ) : total === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {list.data!.map((item) => (
            <ItemCard key={item.licitacion_id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemCard({ item }: { item: OfertaItem }) {
  const isRechazada =
    item.estado != null && ESTADOS_RECHAZADAS.has(item.estado);
  const dias = diasHasta(item.fecha_limite);
  const cerrada = dias != null && dias < 0;
  const urgente = dias != null && dias >= 0 && dias <= 7;
  const estadoLabel = item.estado
    ? ESTADO_LABELS[item.estado as EstadoTracker] ?? item.estado
    : null;
  const tono = item.estado ? ESTADO_TONO[item.estado] : "";
  const dot = item.estado ? ESTADO_DOT[item.estado] : "";

  // Decidimos qué componentes son aplicables a esta oferta
  const decision = decidirTabs(item);
  const tieneTecnica = decision.tabs.includes("tecnica");

  return (
    <li
      className={[
        "card-interactive p-5 sm:p-6",
        isRechazada && "opacity-70",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {item.expediente}
            </p>
            {estadoLabel && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ${tono}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${dot}`}
                  aria-hidden="true"
                />
                {estadoLabel}
              </span>
            )}
            {item.presentado && (
              <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success ring-1 ring-success/25">
                <FileText className="h-3 w-3" strokeWidth={2} />
                PDF firmado
              </span>
            )}
          </div>

          <h2 className="mt-3 line-clamp-2 font-display text-lg font-bold leading-snug tracking-tight">
            {item.titulo ?? "(sin título)"}
          </h2>
          {item.organismo && (
            <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
              {item.organismo}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {item.importe_licitacion && (
              <span className="font-medium tabular-nums text-foreground">
                {fmtEur(item.importe_licitacion)}
              </span>
            )}
            {item.fecha_limite && (
              <span>
                Cierra {fmtFecha(item.fecha_limite)}
                {dias != null && !cerrada && (
                  <span
                    className={
                      urgente
                        ? " font-semibold text-danger"
                        : " text-muted-foreground"
                    }
                  >
                    {" "}· en {dias} d
                  </span>
                )}
                {cerrada && <span className="text-muted-foreground"> · cerrada</span>}
              </span>
            )}
          </div>

          {/* Mini-progreso por componente */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ProgresoChip
              icon={ClipboardList}
              label="Declaración"
              done={item.declaracion_generada}
            />
            <ProgresoChip
              icon={Calculator}
              label="Económica"
              done={item.economica_generada}
            />
            {tieneTecnica && (
              <ProgresoChip
                icon={FileSignature}
                label="Técnica"
                done={false /* M5 todavía no se trackea */}
                muted
              />
            )}
          </div>
        </div>

        <div className="shrink-0 self-start">
          <Link
            href={`/ofertas/${encodeURIComponent(item.expediente)}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-85"
          >
            Abrir
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </li>
  );
}

function ProgresoChip({
  icon: Icon,
  label,
  done,
  muted,
}: {
  icon: typeof ClipboardList;
  label: string;
  done: boolean;
  muted?: boolean;
}) {
  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success ring-1 ring-inset ring-success/25">
        <Check className="h-3 w-3" strokeWidth={2.5} />
        {label}
      </span>
    );
  }
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        muted
          ? "bg-muted/40 text-muted-foreground/70 ring-border"
          : "bg-muted/60 text-muted-foreground ring-border",
      ].join(" ")}
    >
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
      {label}
      <span className="ml-0.5 text-muted-foreground/60">—</span>
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted/30" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="card flex flex-col items-center px-6 py-20 text-center">
      <CheckCircle2
        className="h-10 w-10 text-muted-foreground/40"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h3 className="mt-4 font-display text-2xl font-bold tracking-tight">
        Aún no estás preparando ninguna oferta
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Desde el análisis de un pliego, pulsa{" "}
        <strong className="text-foreground">Preparar oferta</strong>. La
        licitación entrará aquí con declaración responsable, oferta económica
        y, si aplica, memoria técnica.
      </p>
      <Link href="/pliegos" className="btn-primary mt-6">
        Ver pliegos analizados
      </Link>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtFecha(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const hoyUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fechaUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.ceil((fechaUtc - hoyUtc) / (1000 * 60 * 60 * 24));
}

function fmtEur(v: string): string {
  const n = parseFloat(v);
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
