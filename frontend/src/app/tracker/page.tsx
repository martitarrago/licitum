"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ESTADO_LABELS,
  trackerApi,
  type EstadoTracker,
  type TrackerFeedItem,
} from "@/lib/api/tracker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

// ─── Estructura: 4 fases + relojes + cerradas ──────────────────────────────

type Fase = "preparando" | "mesa" | "decidiendo";

const FASES_ESTADOS: Record<Fase, EstadoTracker[]> = {
  preparando: ["en_preparacion"],
  mesa: ["presentada", "apertura_sobres"],
  decidiendo: ["adjudicacion_provisional", "adjudicada"],
};

const RELOJES_ESTADOS: EstadoTracker[] = [
  "en_subsanacion",
  "documentacion_previa",
];

const CERRADAS_ESTADOS: EstadoTracker[] = [
  "formalizada",
  "perdida",
  "rechazada",
];

const FASE_LABEL: Record<Fase, string> = {
  preparando: "preparando",
  mesa: "en mesa",
  decidiendo: "decidiendo",
};

const FASE_DESC: Record<Fase, string> = {
  preparando: "Aún no presentadas. Cierra Sobre A + C.",
  mesa: "Presentadas. La mesa decide.",
  decidiendo: "Adjudicación en curso.",
};

const RELOJ_PLAZO: Record<string, { label: string; habiles: string }> = {
  en_subsanacion: { label: "Subsanación Sobre A", habiles: "3 días hábiles" },
  documentacion_previa: {
    label: "Documentación previa",
    habiles: "10 días hábiles",
  },
};

// ─── Página ────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const feed = useQuery({
    queryKey: ["tracker-feed", EMPRESA_DEMO_ID],
    queryFn: () => trackerApi.feed(EMPRESA_DEMO_ID),
  });

  const grouped = groupFeed(feed.data ?? []);
  const totalActivos =
    grouped.relojes.length +
    grouped.preparando.length +
    grouped.mesa.length +
    grouped.decidiendo.length;

  const isEmpty = !feed.isLoading && (feed.data?.length ?? 0) === 0;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-10">
      <Hero
        loading={feed.isLoading}
        empty={isEmpty || totalActivos === 0}
        grouped={grouped}
      />

      {feed.isLoading ? (
        <Skeleton />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {grouped.relojes.length > 0 && (
            <section className="mb-10 animate-fade-up">
              <BandaRelojes items={grouped.relojes} />
            </section>
          )}

          {totalActivos > 0 && (
            <section className="space-y-8">
              <Rail fase="preparando" items={grouped.preparando} />
              <Rail fase="mesa" items={grouped.mesa} />
              <Rail fase="decidiendo" items={grouped.decidiendo} />
            </section>
          )}

          {grouped.cerradas.length > 0 && (
            <section className="mt-12">
              <CerradasPlegadas items={grouped.cerradas} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ─── Hero narrativo ────────────────────────────────────────────────────────

function Hero({
  loading,
  empty,
  grouped,
}: {
  loading: boolean;
  empty: boolean;
  grouped: GroupedFeed;
}) {
  return (
    <header className="mb-10 animate-fade-up">
      <p className="eyebrow mb-3">seguimiento</p>
      <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
        control del pipeline
      </h1>
      <div className="mt-5 max-w-3xl">
        {loading ? (
          <div className="space-y-2">
            <p className="skeleton h-4 w-2/3 rounded" />
            <p className="skeleton h-3 w-1/2 rounded" />
          </div>
        ) : empty ? (
          <p className="text-base leading-relaxed text-muted-foreground">
            Sin licitaciones en seguimiento. Las que añadas desde el{" "}
            <Link
              href="/radar"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Radar
            </Link>{" "}
            aparecerán aquí, organizadas por fase del ciclo público.
          </p>
        ) : (
          <NarrativaEstado grouped={grouped} />
        )}
      </div>
    </header>
  );
}

function NarrativaEstado({ grouped }: { grouped: GroupedFeed }) {
  type Parte = { n: number; label: string };
  const partes: Parte[] = [];

  if (grouped.relojes.length > 0)
    partes.push({
      n: grouped.relojes.length,
      label:
        grouped.relojes.length === 1
          ? "reloj legal corriendo"
          : "relojes legales corriendo",
    });
  if (grouped.preparando.length > 0)
    partes.push({ n: grouped.preparando.length, label: "en preparación" });
  if (grouped.mesa.length > 0)
    partes.push({
      n: grouped.mesa.length,
      label:
        grouped.mesa.length === 1 ? "propuesta en mesa" : "propuestas en mesa",
    });
  if (grouped.decidiendo.length > 0)
    partes.push({
      n: grouped.decidiendo.length,
      label: "esperando adjudicación",
    });

  // Subline: el reloj más urgente (o estado limpio en verde)
  const masUrgente = grouped.relojes[0];
  let subline: { texto: string; tono: "danger" | "success" } | null = null;
  if (masUrgente) {
    const dias = diasHasta(masUrgente.deadline_actual);
    const plazo = RELOJ_PLAZO[masUrgente.estado];
    if (dias != null && plazo) {
      const cuando =
        dias < 0
          ? `venció hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? "" : "s"}`
          : dias === 0
          ? "vence hoy"
          : dias === 1
          ? "vence mañana"
          : `vence en ${dias} días`;
      const org = organismoCorto(masUrgente.organismo);
      subline = {
        texto: `${plazo.label} de ${org} ${cuando}.`,
        tono: "danger",
      };
    }
  } else if (partes.length > 0) {
    subline = {
      texto: "Sin relojes legales corriendo. Pipeline limpio.",
      tono: "success",
    };
  }

  if (partes.length === 0) {
    // Solo cerradas
    return (
      <p className="text-base leading-relaxed text-muted-foreground">
        Sin licitaciones activas. El histórico está más abajo.
      </p>
    );
  }

  return (
    <>
      <p className="text-base leading-relaxed text-muted-foreground">
        Hoy tienes{" "}
        {partes.map((p, i) => (
          <Fragment key={i}>
            {i > 0 && (i === partes.length - 1 ? " y " : ", ")}
            <strong className="font-semibold tabular-nums text-foreground">
              {p.n}
            </strong>{" "}
            {p.label}
          </Fragment>
        ))}
        .
      </p>
      {subline && (
        <p
          className={`mt-2 flex items-center gap-2 text-sm font-medium ${
            subline.tono === "danger" ? "text-danger" : "text-success"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              subline.tono === "danger" ? "bg-danger" : "bg-success"
            }`}
            aria-hidden="true"
          />
          {subline.texto}
        </p>
      )}
    </>
  );
}

// ─── Banda de relojes legales ──────────────────────────────────────────────

function BandaRelojes({ items }: { items: TrackerFeedItem[] }) {
  return (
    <div className="card p-6 ring-1 ring-danger/35">
      <header className="mb-4 flex items-center justify-between gap-4">
        <p className="eyebrow flex items-center gap-2 text-danger">
          <span
            className="h-1.5 w-1.5 rounded-full bg-danger"
            aria-hidden="true"
          />
          relojes legales · {items.length} corriendo
        </p>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          Perderlos significa perder obras ya ganadas (LCSP art. 150).
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <RelojItem key={item.id} item={item} />
        ))}
      </ul>
    </div>
  );
}

function RelojItem({ item }: { item: TrackerFeedItem }) {
  const dias = diasHasta(item.deadline_actual);
  const vencido = dias != null && dias < 0;
  const plazo = RELOJ_PLAZO[item.estado];

  return (
    <Link
      href={`/radar/${encodeURIComponent(item.expediente)}`}
      className="group flex items-stretch gap-4 rounded-lg bg-surface-raised p-4 ring-1 ring-border transition-all hover:-translate-y-px hover:bg-muted/20 hover:ring-danger/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-danger">
          {plazo?.label ?? ESTADO_LABELS[item.estado as EstadoTracker]}
          {plazo && (
            <span className="text-danger/60"> · {plazo.habiles}</span>
          )}
        </p>
        <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {item.titulo ?? "(sin título)"}
        </h3>
        {item.organismo && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {item.organismo}
          </p>
        )}
      </div>
      <div className="flex min-w-[64px] flex-col items-end justify-center pl-1 text-right">
        {dias != null ? (
          <>
            <p className="display-num text-[2.25rem] leading-none text-danger">
              {vencido ? `−${Math.abs(dias)}` : dias}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-danger/70">
              {vencido ? "vencido" : Math.abs(dias) === 1 ? "día" : "días"}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">sin plazo</p>
        )}
      </div>
    </Link>
  );
}

// ─── Rail de fase ──────────────────────────────────────────────────────────

function Rail({ fase, items }: { fase: Fase; items: TrackerFeedItem[] }) {
  return (
    <div className="animate-fade-up">
      <header className="mb-3 flex items-baseline gap-3 border-b border-border pb-2">
        <p className="eyebrow">{FASE_LABEL[fase]}</p>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/80">
          {items.length}
        </span>
        <p className="ml-auto truncate text-[11px] text-muted-foreground/70">
          {FASE_DESC[fase]}
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground/50">
          —
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function ItemCard({ item }: { item: TrackerFeedItem }) {
  const dias = diasHasta(item.deadline_actual);
  const estado = item.estado as EstadoTracker;

  return (
    <Link
      href={`/radar/${encodeURIComponent(item.expediente)}`}
      className="card-interactive flex flex-col p-4"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {ESTADO_LABELS[estado]}
      </p>
      <h3 className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground">
        {item.titulo ?? "(sin título)"}
      </h3>
      {item.organismo && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {item.organismo}
        </p>
      )}
      <div className="mt-3 flex items-end justify-between gap-2">
        {item.importe_licitacion ? (
          <p className="text-xs font-medium tabular-nums text-foreground/80">
            {fmtEurCompact(item.importe_licitacion)}
          </p>
        ) : (
          <span aria-hidden />
        )}
        {dias != null && <DeadlineBadge dias={dias} />}
      </div>
    </Link>
  );
}

function DeadlineBadge({ dias }: { dias: number }) {
  const cls =
    dias < 0
      ? "bg-danger text-surface"
      : dias <= 3
      ? "bg-danger/12 text-danger"
      : dias <= 7
      ? "bg-warning/15 text-warning"
      : "bg-muted text-muted-foreground";

  const label =
    dias < 0
      ? `−${Math.abs(dias)} d`
      : dias === 0
      ? "hoy"
      : dias === 1
      ? "mañana"
      : `${dias} d`;

  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}
    >
      {label}
    </span>
  );
}

// ─── Cerradas plegadas ─────────────────────────────────────────────────────

function CerradasPlegadas({ items }: { items: TrackerFeedItem[] }) {
  const [open, setOpen] = useState(false);

  const counts = items.reduce<Partial<Record<EstadoTracker, number>>>(
    (acc, i) => {
      const e = i.estado as EstadoTracker;
      acc[e] = (acc[e] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const desglose = CERRADAS_ESTADOS.flatMap((e) => {
    const n = counts[e] ?? 0;
    if (n === 0) return [];
    return [`${n} ${ESTADO_LABELS[e].toLowerCase()}${n === 1 ? "" : "s"}`];
  }).join(" · ");

  return (
    <div className="card p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="min-w-0">
          <p className="eyebrow">cerradas</p>
          <p className="mt-1.5 font-display text-lg font-semibold tracking-tight text-foreground">
            {items.length} licitaci{items.length === 1 ? "ón" : "ones"} fuera del
            seguimiento activo
          </p>
          {desglose && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {desglose}
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {open ? "ocultar" : "ver historial →"}
        </span>
      </button>

      {open && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton + Empty ──────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="skeleton h-24 rounded-lg" />
          <div className="skeleton h-24 rounded-lg" />
        </div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="skeleton h-28 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <p className="eyebrow mb-3">pipeline vacío</p>
      <h2 className="font-display text-2xl font-bold tracking-tight">
        Aún no hay licitaciones en seguimiento
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Desde el Radar, abre cualquier oportunidad y pulsa{" "}
        <strong className="text-foreground">Añadir al seguimiento</strong>.
        Aparecerá aquí con su estado y los relojes legales que aplican.
      </p>
      <Link href="/radar" className="btn-primary mt-6">
        Ir al Radar
      </Link>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface GroupedFeed {
  relojes: TrackerFeedItem[];
  preparando: TrackerFeedItem[];
  mesa: TrackerFeedItem[];
  decidiendo: TrackerFeedItem[];
  cerradas: TrackerFeedItem[];
}

function groupFeed(feed: TrackerFeedItem[]): GroupedFeed {
  const result: GroupedFeed = {
    relojes: [],
    preparando: [],
    mesa: [],
    decidiendo: [],
    cerradas: [],
  };

  for (const item of feed) {
    const e = item.estado as EstadoTracker;
    if (RELOJES_ESTADOS.includes(e)) result.relojes.push(item);
    else if (FASES_ESTADOS.preparando.includes(e)) result.preparando.push(item);
    else if (FASES_ESTADOS.mesa.includes(e)) result.mesa.push(item);
    else if (FASES_ESTADOS.decidiendo.includes(e)) result.decidiendo.push(item);
    else if (CERRADAS_ESTADOS.includes(e)) result.cerradas.push(item);
  }

  // Relojes: el más urgente arriba (deadline asc, sin plazo al final)
  result.relojes.sort((a, b) => {
    const da = a.deadline_actual
      ? new Date(a.deadline_actual).getTime()
      : Infinity;
    const db = b.deadline_actual
      ? new Date(b.deadline_actual).getTime()
      : Infinity;
    return da - db;
  });

  return result;
}

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const ms = new Date(fecha).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function fmtEurCompact(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function organismoCorto(org: string | null): string {
  if (!org) return "—";
  return (
    org
      .replace(/^Ajuntament (de |d')?/i, "")
      .replace(/^Generalitat de Catalunya[\s.,-]*/i, "")
      .split(",")[0]
      .trim() || org
  );
}
