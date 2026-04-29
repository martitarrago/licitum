"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  licitacionesApi,
  type LicitacionRead,
} from "@/lib/api/licitaciones";
import {
  documentosApi,
  TIPO_DOCUMENTO_LABELS,
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
import { empresaApi, type Empresa } from "@/lib/api/empresa";
import { LicitacionRow } from "@/components/ui/LicitacionRow";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

// ─── Paleta "centros de mando" ──────────────────────────────────────────────
// 5 acentos de color para los widgets del panel. Negro mantiene títulos,
// métricas grandes y body. Cada card usa SU color en: border-top stripe,
// eyebrow, micro-dots, y a lo sumo un elemento principal tintado.

const C = {
  matches: "#638ccc",   // azul acero — match excelente (continuidad tier azul Radar)
  next: "#ca5670",      // carmesí — soft-urgency, next steps
  pipeline: "#ab62c0",  // púrpura — pipeline en movimiento
  health: "#72a555",    // verde oliva — salud documental
  plan: "#c57c3c",      // ocre — plan / cuota
} as const;

// ─── Formatters ─────────────────────────────────────────────────────────────

const fechaCorta = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
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

const ACTIVE_STATES: EstadoTracker[] = [
  "en_subsanacion",
  "documentacion_previa",
  "en_preparacion",
  "presentada",
];

// ─── Página ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date();

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

  const empresa = useQuery({
    queryKey: ["dashboard-empresa"],
    queryFn: () => empresaApi.get(EMPRESA_DEMO_ID),
    staleTime: 60_000,
  });

  const matches = useQuery({
    queryKey: ["dashboard-matches-azules"],
    queryFn: () =>
      licitacionesApi.list({
        min_score: 80,
        order_by: "score",
        page_size: 5,
      }),
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
      <header className="mb-8 animate-fade-up">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          {saludo(now)}.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Tu empresa de un vistazo.
        </p>
      </header>

      {/* FRANJA ROJA SLIM — sólo aparece si hay vencimientos críticos */}
      <FranjaPlazos data={tracker.data} loading={tracker.isLoading} />

      {/* GRID — 2 cols arriba, 1 wide en medio, 2 cols abajo */}
      <div className="stagger grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Top-left — Nuevos matches */}
        <NuevosMatchesCard
          loading={matches.isLoading}
          items={matches.data?.items ?? []}
          total={matches.data?.total ?? 0}
        />

        {/* Top-right — Next steps */}
        <NextStepsCard
          tracker={tracker.data}
          docs={saludDocs.data}
          empresa={empresa.data}
          loading={
            tracker.isLoading || saludDocs.isLoading || empresa.isLoading
          }
        />

        {/* Middle — Seguimiento en vivo (full width) */}
        <div className="lg:col-span-2">
          <SeguimientoEnVivoCard
            items={pipelineActivo.data}
            loading={pipelineActivo.isLoading}
          />
        </div>

        {/* Bottom-left — Salud documental + datos perfil */}
        <SaludEmpresaCard
          docs={saludDocs.data}
          empresa={empresa.data}
          loading={saludDocs.isLoading || empresa.isLoading}
        />

        {/* Bottom-right — Plan / cuota (hardcoded) */}
        <PlanCuotaCard now={now} />
      </div>
    </div>
  );
}

// ─── Franja roja slim — vencimientos críticos esta semana ───────────────────

function FranjaPlazos({
  data,
  loading,
}: {
  data: TrackerResumen | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <div className="skeleton mb-6 h-9 rounded-lg" />;
  }
  const items = data?.deadlines_semana ?? [];
  if (items.length === 0) return null;

  const detalle = items
    .slice(0, 2)
    .map(
      (i) =>
        `${ESTADO_LABELS[i.estado as EstadoTracker] ?? i.estado} · ${
          i.titulo ?? "(sin título)"
        }`,
    )
    .join(" · ");

  return (
    <Link
      href="/tracker"
      className="mb-6 flex items-center justify-between gap-4 rounded-lg border-l-[3px] border-danger bg-danger/5 px-4 py-2.5 text-sm transition-colors hover:bg-danger/10"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger"
          aria-hidden="true"
        />
        <span className="font-semibold text-danger">
          {items.length} plazo{items.length === 1 ? "" : "s"} esta semana
        </span>
        <span className="hidden truncate text-muted-foreground sm:inline">
          — {detalle}
          {items.length > 2 ? ` · +${items.length - 2}` : ""}
        </span>
      </div>
      <span className="shrink-0 text-xs font-medium text-danger">Ver →</span>
    </Link>
  );
}

// ─── Card primitive con stripe de color ─────────────────────────────────────

function CommandCard({
  color,
  eyebrow,
  title,
  cta,
  ctaHref,
  children,
  className = "",
}: {
  color: string;
  eyebrow: string;
  title: string;
  cta?: string;
  ctaHref?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`card overflow-hidden border-t-[3px] ${className}`}
      style={{ borderTopColor: color }}
    >
      <div className="p-6">
        <header className="mb-5 flex items-baseline justify-between gap-4">
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color }}
            >
              {eyebrow}
            </p>
            <h2 className="mt-1.5 font-display text-xl font-bold leading-tight tracking-tight">
              {title}
            </h2>
          </div>
          {cta && ctaHref && (
            <Link
              href={ctaHref}
              className="shrink-0 text-xs font-semibold underline-offset-4 transition-all hover:underline"
              style={{ color }}
            >
              {cta} →
            </Link>
          )}
        </header>
        {children}
      </div>
    </article>
  );
}

// ─── Nuevos matches para tu empresa (azul acero) ────────────────────────────

function NuevosMatchesCard({
  loading,
  items,
  total,
}: {
  loading: boolean;
  items: LicitacionRead[];
  total: number;
}) {
  return (
    <CommandCard
      color={C.matches}
      eyebrow="Nuevos matches para tu empresa"
      title="Excelentes para ti"
      cta={total > 0 ? "Ver todos" : undefined}
      ctaHref={total > 0 ? "/radar?min_score=80" : undefined}
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          message="Aún no hay matches azules. Pulsa «Actualizar» en el Radar."
          ctaLabel="Ir al Radar"
          ctaHref="/radar"
          color={C.matches}
        />
      ) : (
        <>
          <div className="mb-3 flex items-baseline gap-2">
            <span
              className="display-num text-3xl leading-none"
              style={{ color: C.matches }}
            >
              {total}
            </span>
            <span className="text-xs text-muted-foreground">
              {total === 1 ? "oportunidad" : "oportunidades"} con score ≥ 80
            </span>
          </div>
          <div className="space-y-1.5">
            {items.slice(0, 4).map((l) => {
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
        </>
      )}
    </CommandCard>
  );
}

// ─── Next steps (carmesí) ───────────────────────────────────────────────────

type NextStep = {
  id: string;
  kind: "deadline" | "doc" | "profile";
  title: string;
  detail: string;
  href: string;
  dias: number | null;
};

function camposPerfilFaltantes(e: Empresa): string[] {
  const missing: string[] = [];
  if (!e.cif) missing.push("CIF");
  if (!e.ccc_seguridad_social) missing.push("CCC Seguridad Social");
  if (!e.representante_nombre || !e.representante_nif)
    missing.push("Representante legal");
  if (!e.iae) missing.push("IAE");
  if (!e.cnae) missing.push("CNAE");
  if (!e.direccion_calle) missing.push("Dirección");
  if (!e.volumen_negocio_n) missing.push("Volumen de negocio");
  if (!e.plantilla_media) missing.push("Plantilla media");
  return missing;
}

const TOTAL_CAMPOS_CRITICOS = 8;

function synthesizeNextSteps(
  tracker: TrackerResumen | undefined,
  docs: ResumenSaludDocumental | undefined,
  empresa: Empresa | undefined,
): NextStep[] {
  const steps: NextStep[] = [];

  for (const item of tracker?.deadlines_semana ?? []) {
    const dias = diasHasta(item.deadline_actual);
    const estadoLabel =
      ESTADO_LABELS[item.estado as EstadoTracker] ?? item.estado;
    const reloj = ESTADOS_RELOJ_LEGAL.has(item.estado as EstadoTracker);
    steps.push({
      id: `t-${item.id}`,
      kind: "deadline",
      title: reloj
        ? `${estadoLabel}: presenta a tiempo`
        : `${estadoLabel}: revisa plazo`,
      detail: item.titulo ?? "(sin título)",
      href: `/radar/${encodeURIComponent(item.expediente)}`,
      dias,
    });
  }

  for (const doc of docs?.proximos_a_caducar ?? []) {
    const tipoLabel = TIPO_DOCUMENTO_LABELS[doc.tipo];
    const dias = doc.dias_a_caducidad;
    steps.push({
      id: `d-${doc.id}`,
      kind: "doc",
      title:
        dias != null && dias < 0
          ? `Renueva ${tipoLabel} (caducó)`
          : `Renueva ${tipoLabel}`,
      detail: doc.titulo ?? "Documento administrativo",
      href: "/empresa/documentos",
      dias,
    });
  }

  if (empresa) {
    const missing = camposPerfilFaltantes(empresa);
    if (missing.length > 0) {
      steps.push({
        id: "p-missing",
        kind: "profile",
        title: `Completa ${missing.length} dato${
          missing.length === 1 ? "" : "s"
        } de tu empresa`,
        detail:
          missing.slice(0, 2).join(" · ") + (missing.length > 2 ? "…" : ""),
        href: "/empresa/perfil",
        dias: null,
      });
    }
  }

  // Orden: vencidos primero (negativos), luego por urgencia, perfil al final.
  const score = (s: NextStep) => (s.dias == null ? 1000 : s.dias);
  steps.sort((a, b) => score(a) - score(b));

  return steps.slice(0, 5);
}

function NextStepsCard({
  tracker,
  docs,
  empresa,
  loading,
}: {
  tracker: TrackerResumen | undefined;
  docs: ResumenSaludDocumental | undefined;
  empresa: Empresa | undefined;
  loading: boolean;
}) {
  const steps = synthesizeNextSteps(tracker, docs, empresa);

  return (
    <CommandCard
      color={C.next}
      eyebrow="Next steps"
      title="Lo siguiente que toca"
    >
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : steps.length === 0 ? (
        <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: C.health }}
            aria-hidden="true"
          />
          Estás al día. Sin acciones urgentes.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {steps.map((s) => (
            <li key={s.id}>
              <Link
                href={s.href}
                className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: C.next }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-snug">
                      {s.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {s.detail}
                    </p>
                  </div>
                </div>
                <NextStepPill dias={s.dias} kind={s.kind} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CommandCard>
  );
}

function NextStepPill({
  dias,
  kind,
}: {
  dias: number | null;
  kind: NextStep["kind"];
}) {
  if (dias == null) {
    const label = kind === "profile" ? "perfil" : "—";
    return (
      <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
        {label}
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
  // ≤2d sólido carmesí, ≤7d soft tint, resto neutro.
  if (dias <= 2) {
    return (
      <span
        className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold tabular-nums text-white"
        style={{ backgroundColor: C.next }}
      >
        {label}
      </span>
    );
  }
  if (dias <= 7) {
    return (
      <span
        className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold tabular-nums"
        style={{ backgroundColor: `${C.next}1a`, color: C.next }}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
      {label}
    </span>
  );
}

// ─── Seguimiento en vivo (púrpura) ──────────────────────────────────────────

function SeguimientoEnVivoCard({
  items,
  loading,
}: {
  items: TrackerFeedItem[] | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <CommandCard
        color={C.pipeline}
        eyebrow="Seguimiento en vivo"
        title="En marcha ahora"
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:gap-12">
          <div className="skeleton h-20 w-32 rounded" />
          <div className="space-y-4">
            <div className="skeleton h-3 rounded-full" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-10 rounded" />
              ))}
            </div>
          </div>
        </div>
      </CommandCard>
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
      <CommandCard
        color={C.pipeline}
        eyebrow="Seguimiento en vivo"
        title="Aún no hay licitaciones en marcha"
        cta="Ir al Radar"
        ctaHref="/radar"
      >
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Desde el Radar, abre una oportunidad y pulsa{" "}
          <strong className="font-semibold text-foreground">
            añadir al seguimiento
          </strong>{" "}
          para verla aquí.
        </p>
      </CommandCard>
    );
  }

  return (
    <CommandCard
      color={C.pipeline}
      eyebrow="Seguimiento en vivo"
      title="En marcha ahora"
      cta="Ver seguimiento"
      ctaHref="/tracker"
    >
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-14">
        <div>
          <p
            className="display-num text-[4.5rem] leading-[0.9] sm:text-[5.5rem]"
            style={{ color: C.pipeline }}
          >
            {total}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            licitaci{total === 1 ? "ón" : "ones"} en marcha
          </p>
        </div>

        <div>
          <PipelineBar counts={counts} total={total} />
          <PipelineLegend counts={counts} />
        </div>
      </div>
    </CommandCard>
  );
}

function PipelineBar({
  counts,
  total,
}: {
  counts: Record<EstadoTracker, number>;
  total: number;
}) {
  const colorFor = (estado: EstadoTracker): string => {
    if (ESTADOS_RELOJ_LEGAL.has(estado)) return "#DC2626"; // danger — plazo legal
    if (estado === "en_preparacion") return C.pipeline;
    return `${C.pipeline}80`; // pipeline tint para "presentada"
  };
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
            className="h-full transition-all duration-700 ease-out-soft"
            style={{ width: `${pct}%`, backgroundColor: colorFor(estado) }}
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
    <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {ACTIVE_STATES.map((estado) => {
        const value = counts[estado];
        const reloj = ESTADOS_RELOJ_LEGAL.has(estado);
        const tieneItems = value > 0;
        const dotColor = reloj
          ? "#DC2626"
          : tieneItems
            ? C.pipeline
            : "transparent";
        const numColor = reloj && tieneItems ? "#DC2626" : "inherit";
        return (
          <li key={estado}>
            <div className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  !tieneItems && !reloj ? "ring-1 ring-border" : ""
                }`}
                style={{ backgroundColor: dotColor }}
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
                tieneItems ? "" : "text-muted-foreground/40"
              }`}
              style={tieneItems ? { color: numColor } : undefined}
            >
              {value}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Salud documental + datos perfil (verde oliva) ──────────────────────────

function SaludEmpresaCard({
  docs,
  empresa,
  loading,
}: {
  docs: ResumenSaludDocumental | undefined;
  empresa: Empresa | undefined;
  loading: boolean;
}) {
  const total = docs?.total ?? 0;
  const vigentes = docs?.vigentes ?? 0;
  const aCaducar = docs?.a_caducar ?? 0;
  const caducados = docs?.caducados ?? 0;
  const pctDocs = total === 0 ? 0 : Math.round((vigentes / total) * 100);

  const camposFaltantes = empresa ? camposPerfilFaltantes(empresa) : [];
  const camposCompletos = TOTAL_CAMPOS_CRITICOS - camposFaltantes.length;
  const pctPerfil = Math.round(
    (camposCompletos / TOTAL_CAMPOS_CRITICOS) * 100,
  );

  return (
    <CommandCard
      color={C.health}
      eyebrow="Salud documental"
      title="Tu empresa preparada"
      cta="Ver detalle"
      ctaHref="/empresa/documentos"
    >
      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-16 rounded" />
          <div className="skeleton h-16 rounded" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Documentos */}
          <SaludRow
            label="Documentos vigentes"
            pct={total === 0 ? null : pctDocs}
            detail={
              total === 0
                ? "Aún no has añadido documentos"
                : `${vigentes} de ${total}${
                    aCaducar + caducados > 0
                      ? ` · ${aCaducar + caducados} requieren acción`
                      : ""
                  }`
            }
            color={C.health}
            href="/empresa/documentos"
            ctaEmpty={total === 0 ? "Añadir documentos" : undefined}
          />

          {/* Datos de empresa */}
          <SaludRow
            label="Perfil completo"
            pct={pctPerfil}
            detail={
              camposFaltantes.length === 0
                ? "Todos los datos críticos están completos"
                : `Faltan: ${camposFaltantes.slice(0, 3).join(" · ")}${
                    camposFaltantes.length > 3 ? "…" : ""
                  }`
            }
            color={C.health}
            href="/empresa/perfil"
            ctaEmpty={
              camposFaltantes.length > 0 ? "Completar perfil" : undefined
            }
          />
        </div>
      )}
    </CommandCard>
  );
}

function SaludRow({
  label,
  pct,
  detail,
  color,
  href,
  ctaEmpty,
}: {
  label: string;
  pct: number | null;
  detail: string;
  color: string;
  href: string;
  ctaEmpty?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className="display-num text-2xl leading-none"
          style={{ color: pct == null ? undefined : color }}
        >
          {pct == null ? "—" : `${pct}%`}
        </p>
      </div>
      {pct != null && (
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full transition-all duration-700 ease-out-soft"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{detail}</span>
        {ctaEmpty && (
          <Link
            href={href}
            className="shrink-0 font-semibold underline-offset-4 hover:underline"
            style={{ color }}
          >
            {ctaEmpty} →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Plan / cuota mensual (ocre) — HARDCODED provisional ────────────────────

function PlanCuotaCard({ now }: { now: Date }) {
  // HARDCODED hasta tener billing real
  const plan = "Plus";
  const usados = 7;
  const total = 20;
  const restantes = total - usados;
  const pct = Math.round((usados / total) * 100);

  // Reset el día 1 del mes siguiente
  const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return (
    <CommandCard
      color={C.plan}
      eyebrow={`Plan ${plan}`}
      title="Cuota mensual de pliegos"
      cta="Ampliar plan"
      ctaHref="/empresa/preferencias"
    >
      <div className="space-y-5">
        <div className="flex items-baseline gap-3">
          <p
            className="display-num text-[3rem] leading-none"
            style={{ color: C.plan }}
          >
            {restantes}
          </p>
          <p className="text-sm text-muted-foreground">
            pliego{restantes === 1 ? "" : "s"} disponible
            {restantes === 1 ? "" : "s"} este mes
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>
              {usados} de {total} analizados
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full transition-all duration-700 ease-out-soft"
              style={{ width: `${pct}%`, backgroundColor: C.plan }}
            />
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="h-1 w-1 rounded-full"
            style={{ backgroundColor: C.plan }}
            aria-hidden="true"
          />
          Renueva el {fechaCorta.format(reset)}
        </p>
      </div>
    </CommandCard>
  );
}

// ─── Empty state primitive ──────────────────────────────────────────────────

function EmptyState({
  message,
  ctaLabel,
  ctaHref,
  color,
}: {
  message: string;
  ctaLabel: string;
  ctaHref: string;
  color: string;
}) {
  return (
    <div className="px-1 py-6">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Link
        href={ctaHref}
        className="mt-2 inline-block text-xs font-semibold underline-offset-4 hover:underline"
        style={{ color }}
      >
        {ctaLabel} →
      </Link>
    </div>
  );
}

// ─── Skeletons ──────────────────────────────────────────────────────────────

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

