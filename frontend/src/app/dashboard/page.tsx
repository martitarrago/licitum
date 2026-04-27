"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import {
  certificadosApi,
  type ResumenSolvencia,
} from "@/lib/api/certificados";
import {
  licitacionesApi,
  type LicitacionRead,
} from "@/lib/api/licitaciones";
import { documentosApi, type ResumenSaludDocumental } from "@/lib/api/documentos";
import {
  trackerApi,
  ESTADO_LABELS,
  type EstadoTracker,
  type TrackerResumen,
} from "@/lib/api/tracker";
import { LicitacionRow } from "@/components/ui/LicitacionRow";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

// ─── Formatters ─────────────────────────────────────────────────────────────

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurCompact = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const fechaLargaFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
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

  const distribucion = useQuery({
    queryKey: ["dashboard-distribucion-semaforo"],
    queryFn: async () => {
      const [v, a, r] = await Promise.all([
        licitacionesApi.list({ semaforo: "verde", page_size: 1 }),
        licitacionesApi.list({ semaforo: "amarillo", page_size: 1 }),
        licitacionesApi.list({ semaforo: "rojo", page_size: 1 }),
      ]);
      return { verde: v.total, amarillo: a.total, rojo: r.total };
    },
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-8">
      {/* HERO ── saludo en lowercase + display heavy (energía del wordmark) */}
      <header className="mb-12 animate-fade-up">
        <p className="eyebrow mb-3">{fechaLargaFormatter.format(now)}</p>
        <h1 className="display-h text-5xl leading-[0.95] sm:text-7xl">
          {saludo(now)}.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Tu pipeline de licitaciones en un vistazo. Detectar, decidir,
          presentar y seguir cada oportunidad — todo desde aquí.
        </p>
      </header>

      {/* KPIs ── 4 cards con números display */}
      <section
        aria-label="Indicadores clave"
        className="stagger mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiSolvencia data={solvencia.data} loading={solvencia.isLoading} />
        <KpiOportunidades
          verde={distribucion.data?.verde ?? 0}
          loading={distribucion.isLoading}
        />
        <KpiPipeline data={tracker.data} loading={tracker.isLoading} />
        <KpiSaludDocumental data={saludDocs.data} loading={saludDocs.isLoading} />
      </section>

      {/* Plazos críticos + Distribución */}
      <section className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,360px)]">
        <PlazosCriticos data={tracker.data} loading={tracker.isLoading} />
        <DistribucionSemaforo
          data={distribucion.data}
          loading={distribucion.isLoading}
        />
      </section>

      {/* DOS LISTAS — el detalle accionable */}
      <section className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListaLicitaciones
          icon={Clock}
          titulo="Cierran esta semana"
          subtitulo="Verdes con plazo ≤14 días"
          ctaHref="/radar?semaforo=verde&plazo_max_dias=14"
          ctaLabel="Ver todas"
          loading={cierran.isLoading}
          items={cierran.data?.items ?? []}
          emptyMsg="No tienes licitaciones verdes con cierre próximo."
        />
        <ListaLicitaciones
          icon={Sparkles}
          titulo="Nuevas oportunidades"
          subtitulo="Compatibles con tu solvencia"
          ctaHref="/radar?semaforo=verde"
          ctaLabel="Ir al Radar"
          loading={nuevas.isLoading}
          items={nuevas.data?.items ?? []}
          emptyMsg="Aún no hay licitaciones compatibles. Pulsa «Actualizar» en el Radar."
        />
      </section>

      {/* DESGLOSE ROLECE */}
      <section aria-label="Solvencia por grupo">
        <DesgloseRolece data={solvencia.data} loading={solvencia.isLoading} />
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
      icon={TrendingUp}
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

// ─── KPI: Oportunidades verdes ──────────────────────────────────────────────

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
      icon={Sparkles}
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
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 transition-colors hover:text-foreground"
        >
          Ver Radar <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
        </Link>
      )}
    </KpiTile>
  );
}

// ─── KPI: Pipeline activo (M6) ──────────────────────────────────────────────

function KpiPipeline({
  data,
  loading,
}: {
  data: TrackerResumen | undefined;
  loading: boolean;
}) {
  if (loading) return <KpiSkeleton />;
  const total = data?.total_activas ?? 0;
  const conPlazo = data?.deadlines_semana?.length ?? 0;

  return (
    <KpiTile
      label="Pipeline activo"
      icon={ArrowUpRight}
      tooltip="Licitaciones que has añadido al pipeline y siguen en estado activo (no terminales)."
    >
      <p className="display-num text-[2.75rem] leading-none text-foreground">
        {total}
      </p>
      <p className="mt-3 text-xs tabular-nums text-muted-foreground">
        {total === 0
          ? "ninguna en el pipeline"
          : `licitación${total === 1 ? "" : "es"} en marcha`}
      </p>
      {conPlazo > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-danger">
          <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
          {conPlazo} plazo{conPlazo === 1 ? "" : "s"} crítico{conPlazo === 1 ? "" : "s"}
        </p>
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
  const pct = total === 0 ? null : Math.round((vigentes / total) * 100);

  return (
    <KpiTile
      label="Salud documental"
      icon={ShieldCheck}
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
          {(aCaducar > 0 || caducados > 0) && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              {aCaducar > 0 && (
                <span className="inline-flex items-center gap-1 text-warning">
                  <Clock className="h-3 w-3" strokeWidth={2.5} />
                  {aCaducar}
                </span>
              )}
              {caducados > 0 && (
                <span className="inline-flex items-center gap-1 text-danger">
                  <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
                  {caducados}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </KpiTile>
  );
}

// ─── Plazos críticos (M6 cross-section) ─────────────────────────────────────

function PlazosCriticos({
  data,
  loading,
}: {
  data: TrackerResumen | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-6">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const items = data?.deadlines_semana ?? [];

  return (
    <div className="card p-6">
      <header className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <p className="eyebrow">Plazos críticos · 7 días</p>
          <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight">
            {items.length === 0
              ? "Sin plazos urgentes"
              : `${items.length} reloj${items.length === 1 ? "" : "es"} corriendo`}
          </h2>
        </div>
        <Link
          href="/tracker"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Pipeline <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="rounded-lg bg-success/5 px-4 py-6 ring-1 ring-success/15">
          <p className="text-sm text-success">
            <CheckCircle2 className="mr-1 inline h-4 w-4" strokeWidth={2.25} />
            Estás al día. Ninguna licitación tiene reloj legal corriendo en los
            próximos 7 días.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 4).map((item) => {
            const dias = diasHasta(item.deadline_actual);
            const urgente = dias != null && dias <= 2;
            return (
              <li key={item.id}>
                <Link
                  href={`/radar/${encodeURIComponent(item.expediente)}`}
                  className="card-interactive flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">
                      {item.titulo ?? "(sin título)"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {ESTADO_LABELS[item.estado as EstadoTracker] ?? item.estado}
                      {item.organismo ? ` · ${item.organismo}` : ""}
                    </p>
                  </div>
                  <DeadlinePill dias={dias} urgente={urgente} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DeadlinePill({
  dias,
  urgente,
}: {
  dias: number | null;
  urgente: boolean;
}) {
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
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums ring-1 ring-inset ${
        dias < 0 || urgente
          ? "bg-danger/10 text-danger ring-danger/20"
          : dias <= 7
          ? "bg-warning/10 text-warning ring-warning/20"
          : "bg-muted text-muted-foreground ring-border"
      }`}
    >
      {label}
    </span>
  );
}

// ─── Distribución de semáforo (gráfico) ─────────────────────────────────────

function DistribucionSemaforo({
  data,
  loading,
}: {
  data: { verde: number; amarillo: number; rojo: number } | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-6">
        <div className="skeleton h-3 w-32 rounded" />
        <div className="skeleton mt-5 h-3 w-full rounded-full" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="skeleton h-12 rounded" />
          <div className="skeleton h-12 rounded" />
          <div className="skeleton h-12 rounded" />
        </div>
      </div>
    );
  }

  const verde = data?.verde ?? 0;
  const amarillo = data?.amarillo ?? 0;
  const rojo = data?.rojo ?? 0;
  const total = verde + amarillo + rojo;

  if (total === 0) {
    return (
      <div className="card p-6">
        <p className="eyebrow">Reparto del Radar</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no hay licitaciones cargadas. Lanza una ingestión desde{" "}
          <Link
            href="/radar"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            el Radar
          </Link>
          .
        </p>
      </div>
    );
  }

  const pctVerde = (verde / total) * 100;
  const pctAmarillo = (amarillo / total) * 100;
  const pctRojo = (rojo / total) * 100;
  const accesibles = pctVerde + pctAmarillo;

  return (
    <div className="card p-6">
      <header className="mb-5">
        <p className="eyebrow">Reparto del Radar</p>
        <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight">
          {accesibles.toFixed(0)}% accesibles
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          De {total.toLocaleString("es-ES")} abiertas, puedes optar a{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {(verde + amarillo).toLocaleString("es-ES")}
          </span>
        </p>
      </header>

      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted shadow-inset-soft"
        role="img"
        aria-label={`Verde ${verde}, amarillo ${amarillo}, rojo ${rojo}`}
      >
        {pctVerde > 0 && (
          <div
            className="h-full bg-success transition-all duration-700 ease-out-soft"
            style={{ width: `${pctVerde}%` }}
            title={`Verde — ${verde}`}
          />
        )}
        {pctAmarillo > 0 && (
          <div
            className="h-full bg-warning transition-all duration-700 ease-out-soft"
            style={{ width: `${pctAmarillo}%` }}
            title={`Amarillo — ${amarillo}`}
          />
        )}
        {pctRojo > 0 && (
          <div
            className="h-full bg-danger transition-all duration-700 ease-out-soft"
            style={{ width: `${pctRojo}%` }}
            title={`Rojo — ${rojo}`}
          />
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Leyenda
          dotClass="bg-success"
          label="Cumples"
          count={verde}
          pct={pctVerde}
          href="/radar?semaforo=verde"
        />
        <Leyenda
          dotClass="bg-warning"
          label="Ajustada"
          count={amarillo}
          pct={pctAmarillo}
          href="/radar?semaforo=amarillo"
        />
        <Leyenda
          dotClass="bg-danger"
          label="No cumples"
          count={rojo}
          pct={pctRojo}
          href="/radar?semaforo=rojo"
        />
      </div>
    </div>
  );
}

function Leyenda({
  dotClass,
  label,
  count,
  pct,
  href,
}: {
  dotClass: string;
  label: string;
  count: number;
  pct: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1 rounded-lg bg-surface px-3 py-2.5 ring-1 ring-border transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-elev-1 hover:ring-foreground/20"
    >
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-xl font-bold tabular-nums">
          {count.toLocaleString("es-ES")}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {pct.toFixed(0)}%
        </span>
      </div>
    </Link>
  );
}

// ─── KPI primitives ─────────────────────────────────────────────────────────

function KpiTile({
  label,
  icon: Icon,
  tooltip,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5 transition-all duration-200 ease-out-soft hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center justify-between">
        <p className="eyebrow" title={tooltip}>
          {label}
        </p>
        {Icon && (
          <Icon
            className="h-4 w-4 text-muted-foreground/40"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="mt-4">{children}</div>
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
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:underline"
      >
        {ctaLabel} <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
      </Link>
    </>
  );
}

function KpiSkeleton() {
  return (
    <div className="card p-5">
      <div className="skeleton h-3 w-20 rounded" />
      <div className="skeleton mt-5 h-10 w-32 rounded" />
      <div className="skeleton mt-3 h-2.5 w-24 rounded" />
    </div>
  );
}

// ─── Lista de licitaciones ──────────────────────────────────────────────────

function ListaLicitaciones({
  icon: Icon,
  titulo,
  subtitulo,
  ctaHref,
  ctaLabel,
  loading,
  items,
  emptyMsg,
}: {
  icon: LucideIcon;
  titulo: string;
  subtitulo: string;
  ctaHref: string;
  ctaLabel: string;
  loading: boolean;
  items: LicitacionRead[];
  emptyMsg: string;
}) {
  return (
    <div className="card p-6">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Icon
              className="h-4 w-4 text-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <div>
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">
              {titulo}
            </h2>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {ctaLabel} <ArrowRight className="h-3 w-3" strokeWidth={2.25} />
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
      <div className="skeleton h-4 w-4 rounded" />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
      <div className="skeleton h-4 w-16 rounded" />
    </div>
  );
}

// ─── Desglose ROLECE ────────────────────────────────────────────────────────

const GRUPO_OPACITIES = ["90", "70", "55", "45", "35", "30", "25"];

function grupoColor(idx: number) {
  return `bg-foreground/${GRUPO_OPACITIES[idx % GRUPO_OPACITIES.length]}`;
}

function grupoLabel(g: string) {
  return g === "Sin clasificar" ? g : `Grupo ${g}`;
}

function DesgloseRolece({
  data,
  loading,
}: {
  data: ResumenSolvencia | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="card p-6">
        <div className="skeleton h-3 w-40 rounded" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-3 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.total_obras === 0) {
    return (
      <div className="card p-6">
        <p className="eyebrow">Solvencia por grupo ROLECE</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no hay obras certificadas. Sube tus certificados desde{" "}
          <Link
            href="/empresa/certificados"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Empresa → Certificados
          </Link>{" "}
          para ver aquí el reparto por grupo.
        </p>
      </div>
    );
  }

  const maxImporte = Math.max(
    ...data.por_grupo.map((g) => Number(g.importe_total)),
  );

  return (
    <div className="card p-6">
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="eyebrow">Solvencia por grupo ROLECE</p>
          <h2 className="mt-1.5 font-display text-2xl font-bold tracking-tight">
            {data.total_obras}{" "}
            {data.total_obras === 1 ? "obra certificada" : "obras certificadas"}
          </h2>
        </div>
      </header>
      <div className="space-y-3">
        {data.por_grupo.map((g, idx) => {
          const pct =
            maxImporte > 0 ? (Number(g.importe_total) / maxImporte) * 100 : 0;
          return (
            <div key={g.grupo} className="flex items-center gap-3">
              <span
                className="w-32 flex-shrink-0 truncate text-xs font-medium"
                title={grupoLabel(g.grupo)}
              >
                {grupoLabel(g.grupo)}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted shadow-inset-soft">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out-soft ${grupoColor(idx)}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="w-28 flex-shrink-0 text-right text-sm font-semibold tabular-nums">
                {eur.format(Number(g.importe_total))}
              </span>
              <span className="w-16 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {g.num_obras} {g.num_obras === 1 ? "obra" : "obras"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
