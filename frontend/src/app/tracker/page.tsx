"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ESTADO_LABELS,
  ESTADOS_RELOJ_LEGAL,
  trackerApi,
  type EstadoTracker,
  type TrackerFeedItem,
} from "@/lib/api/tracker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

// ─── Estructura: fases + relojes + cerradas ────────────────────────────────

type Fase = "preparando" | "esperando";
type ColorKey = Fase | "relojes" | "cerradas";

const FASES_ESTADOS: Record<Fase, EstadoTracker[]> = {
  preparando: ["en_preparacion"],
  esperando: ["presentada", "en_resolucion"],
};

const RELOJES_ESTADOS: EstadoTracker[] = [
  "en_subsanacion",
  "documentacion_previa",
];

const CERRADAS_ESTADOS: EstadoTracker[] = ["ganada", "perdida", "excluida"];

const FASE_LABEL: Record<Fase, string> = {
  preparando: "preparando",
  esperando: "esperando resolución",
};

const FASE_DESC: Record<Fase, string> = {
  preparando: "Documentación aún abierta. Cierra los tres sobres.",
  esperando: "Presentadas. Esperando decisión del órgano.",
};

const FASE_EMPTY_COPY: Record<Fase, string> = {
  preparando:
    "Nada en preparación. Cuando guardes una licitación desde el Radar aparecerá aquí.",
  esperando: "Ninguna propuesta presentada ni en resolución todavía.",
};

const RELOJ_PLAZO: Record<string, { label: string; habiles: string }> = {
  en_subsanacion: { label: "Subsanación Sobre A", habiles: "3 días hábiles" },
  documentacion_previa: {
    label: "Documentación previa",
    habiles: "10 días hábiles",
  },
};

// Paleta cromática — amber para relojes (urgencia sin alarma), sky para
// preparando (acción), zinc para espera pasiva. Rojo solo en countdown vencido.
const COLORS: Record<
  ColorKey,
  {
    dot: string;
    text: string;
    stripe: string;
    chip: string;
    ringSoft: string;
    bgSoft: string;
  }
> = {
  relojes: {
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
    stripe: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    ringSoft: "ring-amber-500/30",
    bgSoft: "bg-amber-500/[0.04]",
  },
  preparando: {
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    stripe: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    ringSoft: "ring-sky-500/25",
    bgSoft: "bg-sky-500/[0.04]",
  },
  esperando: {
    dot: "bg-zinc-400",
    text: "text-zinc-600 dark:text-zinc-300",
    stripe: "bg-zinc-400",
    chip: "bg-zinc-200/60 text-zinc-700 dark:bg-zinc-700/40 dark:text-zinc-200",
    ringSoft: "ring-border",
    bgSoft: "bg-zinc-500/[0.03]",
  },
  cerradas: {
    dot: "bg-zinc-400",
    text: "text-muted-foreground",
    stripe: "bg-zinc-300 dark:bg-zinc-700",
    chip: "bg-muted text-muted-foreground",
    ringSoft: "ring-border",
    bgSoft: "bg-zinc-500/[0.02]",
  },
};

function colorForEstado(estado: EstadoTracker): ColorKey {
  if (RELOJES_ESTADOS.includes(estado)) return "relojes";
  if (FASES_ESTADOS.preparando.includes(estado)) return "preparando";
  if (FASES_ESTADOS.esperando.includes(estado)) return "esperando";
  return "cerradas";
}

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
    grouped.esperando.length;

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
          <section className="mb-10">
            <KpiStrip grouped={grouped} />
          </section>

          {grouped.relojes.length > 0 && (
            <section className="mb-10 animate-fade-up">
              <BandaRelojes items={grouped.relojes} />
            </section>
          )}

          {totalActivos > 0 && (
            <section className="space-y-10">
              <Rail fase="preparando" items={grouped.preparando} />
              <Rail fase="esperando" items={grouped.esperando} />
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
  if (grouped.esperando.length > 0)
    partes.push({
      n: grouped.esperando.length,
      label:
        grouped.esperando.length === 1
          ? "propuesta esperando resolución"
          : "propuestas esperando resolución",
    });

  const masUrgente = grouped.relojes[0];
  let subline: { texto: string; tono: "alerta" | "success" } | null = null;
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
        tono: "alerta",
      };
    }
  } else if (partes.length > 0) {
    subline = {
      texto: "Sin relojes legales corriendo. Pipeline limpio.",
      tono: "success",
    };
  }

  if (partes.length === 0) {
    return (
      <p className="text-base leading-relaxed text-muted-foreground">
        Sin licitaciones activas. El histórico está más abajo.
      </p>
    );
  }

  return (
    <>
      <p className="text-base leading-relaxed text-foreground/80">
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
          className={`mt-2.5 flex items-center gap-2 text-sm font-medium ${
            subline.tono === "alerta"
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          <span className="relative flex h-2 w-2" aria-hidden>
            {subline.tono === "alerta" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                subline.tono === "alerta" ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
          </span>
          {subline.texto}
        </p>
      )}
    </>
  );
}

// ─── KPI strip ─────────────────────────────────────────────────────────────

function KpiStrip({ grouped }: { grouped: GroupedFeed }) {
  const tiles: Array<{
    color: ColorKey;
    label: string;
    n: number;
    sublabel: string;
  }> = [
    {
      color: "relojes",
      label: "relojes legales",
      n: grouped.relojes.length,
      sublabel:
        grouped.relojes.length === 0
          ? "ninguno corriendo"
          : grouped.relojes.length === 1
          ? "plazo activo"
          : "plazos activos",
    },
    {
      color: "preparando",
      label: "preparando",
      n: grouped.preparando.length,
      sublabel: "Sobres en curso",
    },
    {
      color: "esperando",
      label: "esperando",
      n: grouped.esperando.length,
      sublabel: "Decisión del órgano",
    },
  ];

  return (
    <div className="stagger grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <KpiTile key={t.color} {...t} />
      ))}
    </div>
  );
}

function KpiTile({
  color,
  label,
  n,
  sublabel,
}: {
  color: ColorKey;
  label: string;
  n: number;
  sublabel: string;
}) {
  const c = COLORS[color];
  const active = n > 0;
  return (
    <div
      className={`card relative overflow-hidden p-5 transition-all duration-200 ease-out-soft ${
        active ? "" : "opacity-90"
      }`}
    >
      {active && (
        <div
          className={`pointer-events-none absolute inset-0 ${c.bgSoft}`}
          aria-hidden
        />
      )}
      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            {color === "relojes" && active && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                active ? c.dot : "bg-zinc-300 dark:bg-zinc-700"
              }`}
            />
          </span>
          <p
            className={`eyebrow ${active ? c.text : "text-muted-foreground/70"}`}
          >
            {label}
          </p>
        </div>
        <p
          className={`display-num mt-4 text-[2.25rem] leading-none ${
            active ? "text-foreground" : "text-muted-foreground/40"
          }`}
        >
          {n}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}

// ─── Banda de relojes legales ──────────────────────────────────────────────

function BandaRelojes({ items }: { items: TrackerFeedItem[] }) {
  return (
    <div className="card relative overflow-hidden p-6 ring-2 ring-amber-500/40 shadow-card-hover">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-transparent"
        aria-hidden
      />
      <header className="relative mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <p className="font-display text-sm font-bold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400">
            relojes legales · {items.length} corriendo
          </p>
        </div>
        <p className="hidden text-[11px] text-muted-foreground sm:block">
          Perderlos significa perder obras ya ganadas (LCSP art. 150).
        </p>
      </header>
      <ul className="relative grid gap-3 sm:grid-cols-2">
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
      className="group relative flex items-stretch gap-4 overflow-hidden rounded-xl bg-surface-raised p-4 pl-5 ring-1 ring-amber-500/30 transition-all duration-200 ease-out-soft hover:-translate-y-0.5 hover:ring-amber-500/60 hover:shadow-card-hover"
    >
      <span
        className="absolute left-0 top-0 h-full w-1 bg-amber-500"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
          {plazo?.label ?? ESTADO_LABELS[item.estado as EstadoTracker]}
        </p>
        {plazo && (
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-amber-600/70 dark:text-amber-400/70">
            {plazo.habiles}
          </p>
        )}
        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {item.titulo ?? "(sin título)"}
        </h3>
        {item.organismo && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {item.organismo}
          </p>
        )}
      </div>
      <div className="flex min-w-[72px] flex-col items-end justify-center pl-1 text-right">
        {dias != null ? (
          <>
            <p
              className={`display-num text-[2.5rem] leading-none ${
                vencido
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-700 dark:text-amber-400"
              }`}
            >
              {vencido ? `−${Math.abs(dias)}` : dias}
            </p>
            <p
              className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${
                vencido
                  ? "text-red-500/80 dark:text-red-400/80"
                  : "text-amber-600/80 dark:text-amber-400/80"
              }`}
            >
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
  const c = COLORS[fase];

  return (
    <div className="animate-fade-up">
      <header className="mb-4 flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden />
        <p className={`eyebrow ${c.text}`}>{FASE_LABEL[fase]}</p>
        <span
          className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums ${
            items.length === 0
              ? "bg-muted/60 text-muted-foreground/70"
              : c.chip
          }`}
        >
          {items.length}
        </span>
        <div className="ml-2 hidden h-px flex-1 bg-border sm:block" aria-hidden />
        <p className="ml-auto hidden truncate text-xs text-muted-foreground sm:ml-0 sm:block">
          {FASE_DESC[fase]}
        </p>
      </header>

      {items.length === 0 ? (
        <RailEmpty fase={fase} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} fase={fase} />
          ))}
        </div>
      )}
    </div>
  );
}

function RailEmpty({ fase }: { fase: Fase }) {
  const c = COLORS[fase];
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-dashed border-border px-4 py-5 text-xs text-muted-foreground ${c.bgSoft}`}
    >
      {FASE_EMPTY_COPY[fase]}
    </div>
  );
}

function ItemCard({
  item,
  fase,
}: {
  item: TrackerFeedItem;
  fase: ColorKey;
}) {
  const c = COLORS[fase];
  const dias = diasHasta(item.deadline_actual);
  const estado = item.estado as EstadoTracker;

  return (
    <Link
      href={`/radar/${encodeURIComponent(item.expediente)}`}
      className="card-interactive group relative flex flex-col overflow-hidden p-4 pl-5"
    >
      <span
        className={`absolute left-0 top-0 h-full w-1 ${c.stripe}`}
        aria-hidden
      />
      <p className={`text-[10px] font-bold uppercase tracking-[0.08em] ${c.text}`}>
        {ESTADO_LABELS[estado]}
      </p>
      <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
        {item.titulo ?? "(sin título)"}
      </h3>
      {item.organismo && (
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {item.organismo}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
        {item.importe_licitacion ? (
          <p className="font-display text-sm font-bold tabular-nums text-foreground">
            {fmtEurCompact(item.importe_licitacion)}
          </p>
        ) : (
          <span className="text-[11px] text-muted-foreground/60">
            sin importe
          </span>
        )}
        {dias != null && <DeadlineBadge dias={dias} />}
      </div>
    </Link>
  );
}

function DeadlineBadge({ dias }: { dias: number }) {
  const cls =
    dias < 0
      ? "bg-red-500 text-white"
      : dias === 0
      ? "bg-amber-600/20 text-amber-800 dark:text-amber-300"
      : dias <= 3
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : dias <= 7
      ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-500"
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
      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums ${cls}`}
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

  const ganadas = counts.ganada ?? 0;
  const perdidas = counts.perdida ?? 0;
  const excluidas = counts.excluida ?? 0;
  const total = ganadas + perdidas + excluidas;
  const tasaWin = total > 0 ? Math.round((ganadas / total) * 100) : null;

  return (
    <div className="card p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="eyebrow">cerradas</p>
          <p className="mt-1.5 font-display text-lg font-semibold tracking-tight text-foreground">
            {items.length} fuera del seguimiento activo
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {ganadas > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                  aria-hidden
                />
                {ganadas} ganada{ganadas === 1 ? "" : "s"}
              </span>
            )}
            {perdidas > 0 && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-zinc-400"
                  aria-hidden
                />
                {perdidas} perdida{perdidas === 1 ? "" : "s"}
              </span>
            )}
            {excluidas > 0 && (
              <span className="flex items-center gap-1.5 text-pink-600 dark:text-pink-400">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-pink-400"
                  aria-hidden
                />
                {excluidas} excluida{excluidas === 1 ? "" : "s"}
              </span>
            )}
            {tasaWin !== null && (
              <span className="text-muted-foreground">
                tasa de adjudicación{" "}
                <strong className="font-semibold tabular-nums text-foreground">
                  {tasaWin}%
                </strong>
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {open ? "ocultar" : "ver historial →"}
        </span>
      </button>

      {open && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              fase={colorForEstado(item.estado as EstadoTracker)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton + Empty ──────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-10">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="skeleton h-32 rounded-xl" />
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
  esperando: TrackerFeedItem[];
  cerradas: TrackerFeedItem[];
}

function groupFeed(feed: TrackerFeedItem[]): GroupedFeed {
  const result: GroupedFeed = {
    relojes: [],
    preparando: [],
    esperando: [],
    cerradas: [],
  };

  for (const item of feed) {
    const e = item.estado as EstadoTracker;
    if (RELOJES_ESTADOS.includes(e)) result.relojes.push(item);
    else if (FASES_ESTADOS.preparando.includes(e)) result.preparando.push(item);
    else if (FASES_ESTADOS.esperando.includes(e)) result.esperando.push(item);
    else if (CERRADAS_ESTADOS.includes(e)) result.cerradas.push(item);
  }

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
