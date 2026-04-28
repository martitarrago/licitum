"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  certificadosApi,
  type ResumenSolvencia,
} from "@/lib/api/certificados";
import {
  licitacionesApi,
  type LicitacionRead,
} from "@/lib/api/licitaciones";
import {
  documentosApi,
  TIPO_DOCUMENTO_LABELS,
  type DocumentoEmpresa,
  type ResumenSaludDocumental,
} from "@/lib/api/documentos";
import {
  trackerApi,
  ESTADO_LABELS,
  ESTADOS_RELOJ_LEGAL,
  type EstadoTracker,
  type TrackerFeedItem,
  type TrackerResumen,
} from "@/lib/api/tracker";
import { LicitacionRow } from "@/components/ui/LicitacionRow";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

// ─── Formatters ─────────────────────────────────────────────────────────────

const eurCompact = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fechaCorta = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function saludo(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "buenas noches";
  if (h < 14) return "buenos días";
  if (h < 21) return "buenas tardes";
  return "buenas noches";
}

function diasHasta(value: string | Date | null): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function parseLicitacion(l: LicitacionRead) {
  return {
    id: l.id,
    expediente: l.expediente,
    titulo: l.titulo ?? "Sin título",
    organismo: l.organismo ?? "Organismo desconocido",
    importe: l.importe_licitacion ? parseFloat(l.importe_licitacion) : 0,
    fechaLimite: l.fecha_limite ? new Date(l.fecha_limite) : new Date(0),
    semaforo: (l.semaforo === "gris" ? "amarillo" : l.semaforo) as
      | "verde"
      | "amarillo"
      | "rojo",
    afinidad: l.score_afinidad ? parseFloat(l.score_afinidad) : null,
  };
}

// Pipeline activo — orden visual: estados con plazo legal abierto primero.
const ACTIVE_STATES: EstadoTracker[] = [
  "en_subsanacion",
  "documentacion_previa",
  "en_preparacion",
  "presentada",
];

// Tailwind no soporta clases dinámicas por concatenación — mapping estático.
const STATE_BAR_CLASS: Partial<Record<EstadoTracker, string>> = {
  en_subsanacion: "bg-danger",
  documentacion_previa: "bg-danger",
  en_preparacion: "bg-foreground/85",
  presentada: "bg-foreground/45",
};

// ─── Página ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date();

  const solvencia = useQuery({
    queryKey: ["resumen-solvencia"],
    queryFn: () => certificadosApi.resumenSolvencia(EMPRESA_DEMO_ID),
    staleTime: 60_000,
  });

  const tracker = useQuery({
    queryKey: ["dashboard-tracker-resumen"],
    queryFn: () => trackerApi.resumen(EMPRESA_DEMO_ID, 7),
    staleTime: 60_000,
  });

  const saludDocs = useQuery({
    queryKey: ["dashboard-salud-documental"],
    queryFn: () => documentosApi.resumenSalud(EMPRESA_DEMO_ID),
    staleTime: 60_000,
  });

  const cierran = useQuery({
    queryKey: ["dashboard-cierran-pronto"],
    queryFn: () =>
      licitacionesApi.list({
        semaforo: "verde",
        plazo_min_dias: 0,
        plazo_max_dias: 14,
        page_size: 5,
      }),
    staleTime: 60_000,
  });

  const nuevas = useQuery({
    queryKey: ["dashboard-nuevas"],
    queryFn: () =>
      licitacionesApi.list({
        semaforo: "verde",
        page_size: 5,
      }),
    staleTime: 60_000,
  });

  const verdes = useQuery({
    queryKey: ["dashboard-verdes"],
    queryFn: () => licitacionesApi.list({ semaforo: "verde", page_size: 1 }),
    staleTime: 60_000,
  });

  const pipelineActivo = useQuery({
    queryKey: ["dashboard-pipeline-activo"],
    queryFn: () =>
      trackerApi.feed(EMPRESA_DEMO_ID, [
        "en_preparacion",
        "presentada",
        "en_subsanacion",
        "documentacion_previa",
      ]),
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-12 sm:px-10">
      {/* HERO */}
      <header className="mb-10 animate-fade-up">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          {saludo(now)}.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Lo que requiere tu atención hoy, antes que cualquier otra cosa.
        </p>
      </header>

      {/* 1 ── PLAZOS CRÍTICOS al frente — grita cuando hay vencimientos próximos */}
      <PlazosCriticos data={tracker.data} loading={tracker.isLoading} />

      {/* 2 ── PIPELINE HEROÍNA — KPI principal con visualización */}
      <PipelineHeroina
        items={pipelineActivo.data}
        loading={pipelineActivo.isLoading}
      />

      {/* 3 ── KPIs DE SOPORTE — contexto secundario */}
      <section
        aria-label="Indicadores de soporte"
        className="stagger mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <KpiSolvencia data={solvencia.data} loading={solvencia.isLoading} />
        <KpiOportunidades
          verde={verdes.data?.total ?? 0}
          loading={verdes.isLoading}
        />
        <KpiSaludDocumental data={saludDocs.data} loading={saludDocs.isLoading} />
      </section>

      {/* 4 ── DOS LISTAS */}
      <section className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListaLicitaciones
          titulo="Cierran esta semana"
          ctaHref="/radar?semaforo=verde&plazo_max_dias=14"
          ctaLabel="Ver todas"
          loading={cierran.isLoading}
          items={cierran.data?.items ?? []}
          emptyMsg="No tienes licitaciones verdes con cierre próximo."
        />
        <ListaLicitaciones
          titulo="Nuevas oportunidades"
          ctaHref="/radar?semaforo=verde"
          ctaLabel="Ir al Radar"
          loading={nuevas.isLoading}
          items={nuevas.data?.items ?? []}
          emptyMsg="Aún no hay licitaciones compatibles. Pulsa «Actualizar» en el Radar."
        />
      </section>

      {/* 5 ── VENCIMIENTOS DOCUMENTALES — accionable: pedir renovación a tiempo */}
      <section aria-label="Próximos vencimientos documentales">
        <VencimientosDocumentales
          data={saludDocs.data}
          loading={saludDocs.isLoading}
        />
      </section>
    </div>
  );
}

// ─── KPI: Solvencia ─────────────────────────────────────────────────────────

function KpiSolvencia({
  data,
  loading,
}: {
  data: ResumenSolvencia | undefined;
  loading: boolean;
}) {
  if (loading) return <KpiSkeleton />;

  const tieneObras = (data?.total_obras ?? 0) > 0;
  const anualidad = Number(data?.anualidad_media ?? 0);
  const pico = Number(data?.anualidad_pico ?? 0);

  return (
    <KpiTile
      label="Solvencia anual"
      tooltip="Anualidad media de obra certificada (LCSP art. 88). Determina el techo de licitación al que puedes optar."
    >
      {tieneObras ? (
        <>
          <p className="display-num text-[2.75rem] leading-none text-foreground">
            {eurCompact.format(anualidad)}
          </p>
          <p className="mt-3 text-xs tabular-nums text-muted-foreground">
            Pico {eurCompact.format(pico)}
            {data?.anio_pico ? ` · ${data.anio_pico}` : ""}
          </p>
        </>
      ) : (
        <KpiEmpty
          number="—"
          ctaLabel="Subir certificados"
          ctaHref="/empresa/certificados"
        />
      )}
    </KpiTile>
  );
}

// ─── KPI: Oportunidades ─────────────────────────────────────────────────────

function KpiOportunidades({
  verde,
  loading,
}: {
  verde: number;
  loading: boolean;
}) {
  if (loading) return <KpiSkeleton />;

  return (
    <KpiTile
      label="Oportunidades"
      tooltip="Licitaciones del Radar para las que cumples solvencia (verde) y siguen abiertas."
    >
      <p className="display-num text-[2.75rem] leading-none text-foreground">
        {verde}
      </p>
      <p className="mt-3 text-xs tabular-nums text-muted-foreground">
        {verde === 0
          ? "ninguna abierta"
          : `verde${verde === 1 ? "" : "s"} en el Radar`}
      </p>
      {verde > 0 && (
        <Link
          href="/radar?semaforo=verde"
          className="mt-3 inline-block text-xs font-medium text-foreground/80 underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Ver Radar →
        </Link>
      )}
    </KpiTile>
  );
}

// ─── KPI: Salud documental (M2) ─────────────────────────────────────────────

function KpiSaludDocumental({
  data,
  loading,
}: {
  data: ResumenSaludDocumental | undefined;
  loading: boolean;
}) {
  if (loading) return <KpiSkeleton />;
  const total = data?.total ?? 0;
  const vigentes = data?.vigentes ?? 0;
  const aCaducar = data?.a_caducar ?? 0;
  const caducados = data?.caducados ?? 0;
  const noVigentes = aCaducar + caducados;
  const pct = total === 0 ? null : Math.round((vigentes / total) * 100);

  return (
    <KpiTile
      label="Salud documental"
      tooltip="Porcentaje de documentos administrativos al día (Hacienda, SS, pólizas, ISOs). Cuando ganas adjudicación tienes 10 días hábiles para presentarlos."
    >
      {total === 0 ? (
        <KpiEmpty
          number="—"
          ctaLabel="Añadir documentos"
          ctaHref="/empresa/documentos"
        />
      ) : (
        <>
          <p className="display-num text-[2.75rem] leading-none text-foreground">
            {pct}%
          </p>
          <p className="mt-3 text-xs tabular-nums text-muted-foreground">
            {vigentes} vigente{vigentes === 1 ? "" : "s"} de {total}
          </p>
          {noVigentes > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-danger">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-danger"
                  aria-hidden="true"
                />
                {noVigentes} requier{noVigentes === 1 ? "e" : "en"} acción
              </span>
              {caducados > 0 && (
                <span className="text-muted-foreground">
                  · {caducados} caducad{caducados === 1 ? "o" : "os"}
                </span>
              )}
            </p>
          )}
        </>
      )}
    </KpiTile>
  );
}

// ─── Plazos críticos ────────────────────────────────────────────────────────

function PlazosCriticos({
  data,
  loading,
}: {
  data: TrackerResumen | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mb-8">
        <div className="skeleton h-24 rounded-2xl" />
      </section>
    );
  }

  const items = data?.deadlines_semana ?? [];

  // Empty: línea slim con dot verde — no roba protagonismo.
  if (items.length === 0) {
    return (
      <section className="mb-10 flex items-center gap-2.5 border-y border-border/60 px-1 py-3">
        <span
          className="h-1.5 w-1.5 rounded-full bg-success"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">
          Estás al día.{" "}
          <span className="text-foreground">Sin vencimientos esta semana.</span>
        </p>
      </section>
    );
  }

  // Active: card con borde rojo izquierdo. Grita.
  return (
    <section className="mb-10 animate-fade-up">
      <article className="overflow-hidden rounded-2xl border-l-[3px] border-danger bg-surface-raised shadow-card ring-1 ring-border">
        <header className="flex items-baseline justify-between gap-4 border-b border-border px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span
              className="h-2 w-2 translate-y-[-2px] rounded-full bg-danger"
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-bold tracking-tight text-danger">
              {items.length} plazo{items.length === 1 ? "" : "s"} vence
              {items.length === 1 ? "" : "n"} esta semana
            </h2>
          </div>
          <Link
            href="/tracker"
            className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Ver seguimiento →
          </Link>
        </header>
        <ul className="divide-y divide-border">
          {items.slice(0, 4).map((item) => {
            const dias = diasHasta(item.deadline_actual);
            return (
              <li key={item.id}>
                <Link
                  href={`/radar/${encodeURIComponent(item.expediente)}`}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium leading-snug">
                      {item.titulo ?? "(sin título)"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {ESTADO_LABELS[item.estado as EstadoTracker] ??
                        item.estado}
                      {item.organismo ? ` · ${item.organismo}` : ""}
                    </p>
                  </div>
                  <DeadlinePill dias={dias} />
                </Link>
              </li>
            );
          })}
          {items.length > 4 && (
            <li className="border-t border-border bg-muted/20 px-6 py-2.5 text-center">
              <Link
                href="/tracker"
                className="text-[11px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                +{items.length - 4} más en seguimiento →
              </Link>
            </li>
          )}
        </ul>
      </article>
    </section>
  );
}

function DeadlinePill({ dias }: { dias: number | null }) {
  if (dias == null) {
    return (
      <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
        sin plazo
      </span>
    );
  }
  const label =
    dias < 0
      ? `−${Math.abs(dias)} d`
      : dias === 0
        ? "hoy"
        : dias === 1
          ? "mañana"
          : `${dias} d`;
  // Sin amber: ≤2d sólido rojo, ≤7d soft red, resto neutro.
  const cls =
    dias <= 2
      ? "bg-danger text-surface"
      : dias <= 7
        ? "bg-danger/10 text-danger"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold tabular-nums ${cls}`}
    >
      {label}
    </span>
  );
}

// ─── Pipeline heroína ───────────────────────────────────────────────────────

function PipelineHeroina({
  items,
  loading,
}: {
  items: TrackerFeedItem[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="mb-10">
        <div className="card p-8">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="mt-7 grid grid-cols-1 gap-10 lg:grid-cols-[auto_1fr] lg:gap-12">
            <div className="space-y-3">
              <div className="skeleton h-20 w-32 rounded" />
              <div className="skeleton h-3 w-40 rounded" />
            </div>
            <div className="space-y-5">
              <div className="skeleton h-3 rounded-full" />
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="skeleton h-2.5 w-16 rounded" />
                    <div className="skeleton h-6 w-8 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const counts = ACTIVE_STATES.reduce(
    (acc, s) => {
      acc[s] = 0;
      return acc;
    },
    {} as Record<EstadoTracker, number>,
  );

  for (const item of items ?? []) {
    const e = item.estado as EstadoTracker;
    if (e in counts) counts[e] += 1;
  }

  const total = ACTIVE_STATES.reduce((acc, s) => acc + counts[s], 0);

  if (total === 0) {
    return (
      <section className="mb-10 animate-fade-up">
        <article className="card p-8">
          <header className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Aún no hay licitaciones en marcha.
            </h2>
            <Link
              href="/tracker"
              className="text-sm font-semibold text-[#f56930] underline-offset-4 transition-all hover:underline"
            >
              Ver tracker →
            </Link>
          </header>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Desde el{" "}
            <Link
              href="/radar"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Radar
            </Link>
            , abre una oportunidad y pulsa{" "}
            <strong className="font-semibold text-foreground">
              añadir al seguimiento
            </strong>{" "}
            para verla aquí.
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="mb-10 animate-fade-up">
      <article className="card p-8">
        <header className="mb-7 flex items-baseline justify-between gap-4">
          <p className="eyebrow">En seguimiento</p>
          <Link
            href="/tracker"
            className="text-sm font-semibold text-[#f56930] underline-offset-4 transition-all hover:underline"
          >
            Ver tracker →
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-14">
          {/* Columna izquierda — número heroína */}
          <div>
            <p className="display-num text-[5.5rem] leading-[0.9] text-foreground sm:text-[6.5rem]">
              {total}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              licitaci{total === 1 ? "ón" : "ones"} en marcha
            </p>
          </div>

          {/* Columna derecha — bar + legend */}
          <div>
            <PipelineBar counts={counts} total={total} />
            <PipelineLegend counts={counts} />
          </div>
        </div>
      </article>
    </section>
  );
}

function PipelineBar({
  counts,
  total,
}: {
  counts: Record<EstadoTracker, number>;
  total: number;
}) {
  return (
    <div
      className="flex h-3 w-full overflow-hidden rounded-full bg-muted shadow-inset-soft"
      role="img"
      aria-label="Distribución de licitaciones por estado"
    >
      {ACTIVE_STATES.map((estado) => {
        const value = counts[estado];
        if (value === 0) return null;
        const pct = (value / total) * 100;
        return (
          <div
            key={estado}
            className={`h-full transition-all duration-700 ease-out-soft ${STATE_BAR_CLASS[estado] ?? "bg-foreground/40"}`}
            style={{ width: `${pct}%` }}
            title={`${ESTADO_LABELS[estado]}: ${value}`}
          />
        );
      })}
    </div>
  );
}

function PipelineLegend({
  counts,
}: {
  counts: Record<EstadoTracker, number>;
}) {
  return (
    <ul className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {ACTIVE_STATES.map((estado) => {
        const value = counts[estado];
        const reloj = ESTADOS_RELOJ_LEGAL.has(estado);
        const tieneItems = value > 0;
        return (
          <li key={estado}>
            <div className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  reloj
                    ? "bg-danger"
                    : tieneItems
                      ? "bg-foreground/55"
                      : "bg-border"
                }`}
                aria-hidden="true"
              />
              <p
                className={`truncate text-[10px] font-semibold uppercase tracking-wider ${
                  reloj && tieneItems
                    ? "text-danger"
                    : "text-muted-foreground"
                }`}
              >
                {ESTADO_LABELS[estado]}
              </p>
            </div>
            <p
              className={`mt-1 font-display text-2xl font-bold tabular-nums tracking-tight ${
                reloj && tieneItems
                  ? "text-danger"
                  : tieneItems
                    ? "text-foreground"
                    : "text-muted-foreground/40"
              }`}
            >
              {value}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ─── KPI primitives ─────────────────────────────────────────────────────────

function KpiTile({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-6 transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-card-hover">
      <p className="eyebrow" title={tooltip}>
        {label}
      </p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function KpiEmpty({
  number,
  ctaLabel,
  ctaHref,
}: {
  number: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <>
      <p className="display-num text-[2.75rem] leading-none text-muted-foreground/40">
        {number}
      </p>
      <Link
        href={ctaHref}
        className="mt-3 inline-block text-xs font-medium text-foreground underline-offset-4 transition-colors hover:underline"
      >
        {ctaLabel} →
      </Link>
    </>
  );
}

function KpiSkeleton() {
  return (
    <div className="card p-6">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton mt-6 h-10 w-32 rounded" />
      <div className="skeleton mt-3 h-2.5 w-24 rounded" />
    </div>
  );
}

// ─── Lista de licitaciones ──────────────────────────────────────────────────

function ListaLicitaciones({
  titulo,
  ctaHref,
  ctaLabel,
  loading,
  items,
  emptyMsg,
}: {
  titulo: string;
  ctaHref: string;
  ctaLabel: string;
  loading: boolean;
  items: LicitacionRead[];
  emptyMsg: string;
}) {
  return (
    <div className="card p-6">
      <header className="mb-5 flex items-end justify-between gap-4">
        <h2 className="font-display text-xl font-bold leading-tight tracking-tight">
          {titulo}
        </h2>
        <Link
          href={ctaHref}
          className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {ctaLabel} →
        </Link>
      </header>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted-foreground">
          {emptyMsg}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((l) => {
            const p = parseLicitacion(l);
            return (
              <Link
                key={p.id}
                href={`/radar/${encodeURIComponent(p.expediente)}`}
                className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
              >
                <LicitacionRow
                  titulo={p.titulo}
                  organismo={p.organismo}
                  importe={p.importe}
                  fechaLimite={p.fechaLimite}
                  semaforo={p.semaforo}
                  afinidad={p.afinidad}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-raised px-4 py-3 ring-1 ring-border">
      <div className="skeleton h-4 w-1 rounded" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
      <div className="skeleton h-4 w-16 rounded" />
    </div>
  );
}

// ─── Vencimientos documentales ──────────────────────────────────────────────

function VencimientosDocumentales({
  data,
  loading,
}: {
  data: ResumenSaludDocumental | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-6">
        <div className="skeleton h-3 w-56 rounded" />
        <div className="mt-5 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const items = data?.proximos_a_caducar ?? [];

  // Sin documentos aún — empuja al usuario a sembrar M2.
  if (total === 0) {
    return (
      <div className="card p-6">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Próximos vencimientos documentales
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no has añadido documentos administrativos. Súbelos desde{" "}
          <Link
            href="/empresa/documentos"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Empresa → Documentos
          </Link>{" "}
          para activar avisos de caducidad.
        </p>
      </div>
    );
  }

  // Todo vigente — sin caducidades próximas.
  if (items.length === 0) {
    return (
      <div className="card p-6">
        <header className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-xl font-bold tracking-tight">
            Próximos vencimientos documentales
          </h2>
          <Link
            href="/empresa/documentos"
            className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Ver todos →
          </Link>
        </header>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className="h-1.5 w-1.5 rounded-full bg-success"
            aria-hidden="true"
          />
          Todos al día. Sin caducidades próximas.
        </p>
      </div>
    );
  }

  // Lista de documentos próximos a caducar / caducados.
  const visibles = items.slice(0, 6);
  const restantes = items.length - visibles.length;

  return (
    <div className="card p-6">
      <header className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Próximos vencimientos documentales
        </h2>
        <Link
          href="/empresa/documentos"
          className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Ver todos →
        </Link>
      </header>
      <ul className="divide-y divide-border">
        {visibles.map((doc) => (
          <li key={doc.id}>
            <DocumentoVencimientoRow doc={doc} />
          </li>
        ))}
      </ul>
      {restantes > 0 && (
        <div className="mt-3 border-t border-border pt-3 text-center">
          <Link
            href="/empresa/documentos"
            className="text-[11px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            +{restantes} más en Empresa →
          </Link>
        </div>
      )}
    </div>
  );
}

function DocumentoVencimientoRow({ doc }: { doc: DocumentoEmpresa }) {
  const tipoLabel = TIPO_DOCUMENTO_LABELS[doc.tipo];
  const fecha = doc.fecha_caducidad ? new Date(doc.fecha_caducidad) : null;
  const dias = doc.dias_a_caducidad;

  return (
    <Link
      href="/empresa/documentos"
      className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-muted/30"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug">{tipoLabel}</p>
        {doc.titulo && (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {doc.titulo}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {fecha && (
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
            {fechaCorta.format(fecha)}
          </span>
        )}
        <DeadlinePill dias={dias} />
      </div>
    </Link>
  );
}
