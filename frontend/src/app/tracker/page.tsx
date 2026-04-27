"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Calendar,
  Clock,
  Info,
  type LucideIcon,
} from "lucide-react";
import {
  ESTADO_LABELS,
  ESTADO_TONO,
  ESTADOS_ORDEN,
  ESTADOS_RELOJ_LEGAL,
  trackerApi,
  type EstadoTracker,
  type TrackerFeedItem,
} from "@/lib/api/tracker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

export default function TrackerPage() {
  const feed = useQuery({
    queryKey: ["tracker-feed", EMPRESA_DEMO_ID],
    queryFn: () => trackerApi.feed(EMPRESA_DEMO_ID),
  });

  const grouped: Record<EstadoTracker, TrackerFeedItem[]> = {
    en_preparacion: [],
    presentada: [],
    en_subsanacion: [],
    apertura_sobres: [],
    adjudicacion_provisional: [],
    documentacion_previa: [],
    adjudicada: [],
    formalizada: [],
    perdida: [],
    rechazada: [],
  };
  if (feed.data) {
    for (const item of feed.data) {
      const e = item.estado as EstadoTracker;
      if (grouped[e]) grouped[e].push(item);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          M6 · Pipeline
        </p>
        <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight">
          Tracker
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Estado de cada licitación a través del ciclo público completo. Las
          columnas marcadas con <Info className="-mb-0.5 inline h-3.5 w-3.5" strokeWidth={2} /> tienen{" "}
          <strong>reloj legal</strong>: 3 días hábiles para subsanar el Sobre A,
          10 días tras adjudicación provisional para presentar Hacienda + SS +
          pólizas + garantía definitiva. Perder estos plazos significa perder
          obras ya ganadas.
        </p>
      </header>

      {feed.isLoading ? (
        <Skeleton />
      ) : !feed.data || feed.data.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid auto-cols-[280px] grid-flow-col gap-4 overflow-x-auto pb-4">
          {ESTADOS_ORDEN.map((estado) => (
            <Column
              key={estado}
              estado={estado}
              items={grouped[estado] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Columna ───────────────────────────────────────────────────────────────

function Column({
  estado,
  items,
}: {
  estado: EstadoTracker;
  items: TrackerFeedItem[];
}) {
  const conReloj = ESTADOS_RELOJ_LEGAL.has(estado);
  const tono = ESTADO_TONO[estado];
  const titleColor =
    tono === "danger"
      ? "text-danger"
      : tono === "success"
      ? "text-success"
      : tono === "muted"
      ? "text-muted-foreground/70"
      : "text-foreground";

  return (
    <div className="flex flex-col gap-3">
      <div className="px-1">
        <h2
          className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${titleColor}`}
        >
          {ESTADO_LABELS[estado]}
          {conReloj && (
            <Info
              className="h-3.5 w-3.5"
              strokeWidth={2.25}
              aria-label="Reloj legal"
            />
          )}
          <span className="ml-auto font-mono text-[11px] font-normal text-foreground/40">
            {items.length}
          </span>
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground/50">
            —
          </div>
        ) : (
          items.map((item) => <Card key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

function Card({ item }: { item: TrackerFeedItem }) {
  const dias = diasHasta(item.deadline_actual);
  const urgencia = dias != null
    ? dias < 0
      ? "vencido"
      : dias <= 3
      ? "rojo"
      : dias <= 7
      ? "amarillo"
      : "verde"
    : null;

  return (
    <Link
      href={`/radar/${encodeURIComponent(item.expediente)}`}
      className="block rounded-lg bg-surface-raised p-3 ring-1 ring-border transition-colors hover:bg-muted/30"
    >
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
        {item.expediente}
      </p>
      <h3 className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
        {item.titulo ?? "(sin título)"}
      </h3>
      {item.organismo && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {item.organismo}
        </p>
      )}
      {item.importe_licitacion && (
        <p className="mt-1.5 text-xs font-medium tabular-nums text-foreground/80">
          {fmtEur(item.importe_licitacion)}
        </p>
      )}
      {item.deadline_actual && urgencia && (
        <DeadlineBadge dias={dias!} urgencia={urgencia} />
      )}
    </Link>
  );
}

function DeadlineBadge({
  dias,
  urgencia,
}: {
  dias: number;
  urgencia: string;
}) {
  const cls =
    urgencia === "vencido" || urgencia === "rojo"
      ? "bg-danger/10 text-danger"
      : urgencia === "amarillo"
      ? "bg-warning/10 text-warning"
      : "bg-muted text-muted-foreground";

  const Icon: LucideIcon =
    urgencia === "vencido" || urgencia === "rojo" ? AlertTriangle : Clock;

  const label =
    dias < 0
      ? `Vencido ${Math.abs(dias)} d`
      : dias === 0
      ? "Vence hoy"
      : dias === 1
      ? "Vence mañana"
      : `${dias} d para vencer`;

  return (
    <div
      className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {label}
    </div>
  );
}

// ─── Skeleton + Empty ──────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="grid auto-cols-[280px] grid-flow-col gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-muted/40" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-24 animate-pulse rounded-lg bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-surface-raised/50 px-6 py-16 text-center">
      <Calendar
        className="mx-auto h-10 w-10 text-muted-foreground"
        strokeWidth={1.5}
      />
      <h2 className="mt-4 font-serif text-lg font-medium">
        Tu pipeline está vacío
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Añade licitaciones desde el Radar. Click en cualquier oportunidad →
        botón &ldquo;Añadir al pipeline&rdquo;.
      </p>
      <Link
        href="/radar"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-foreground/90"
      >
        Ir al Radar
      </Link>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const ms = new Date(fecha).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function fmtEur(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
