"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock,
  FileSignature,
  Info,
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
import { LicitacionRow } from "@/components/ui/LicitacionRow";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

// ─── Formatters (módulo) ─────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function saludo(date: Date): string {
  const h = date.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 14) return "Buenos días";
  if (h < 21) return "Buenas tardes";
  return "Buenas noches";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

// ─── Página ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const now = new Date();

  const solvencia = useQuery({
    queryKey: ["resumen-solvencia"],
    queryFn: () => certificadosApi.resumenSolvencia(EMPRESA_DEMO_ID),
    staleTime: 60_000,
  });

  // Cierran esta semana — verdes con plazo ≤14 días, ascendente
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

  // Nuevas oportunidades — verdes ordenadas por afinidad (orden por defecto del backend)
  const nuevas = useQuery({
    queryKey: ["dashboard-nuevas"],
    queryFn: () =>
      licitacionesApi.list({
        semaforo: "verde",
        page_size: 5,
      }),
    staleTime: 60_000,
  });

  // Distribución por semáforo — 3 queries baratas (page_size=1 → solo total)
  // para alimentar la barra apilada del gráfico de oportunidades.
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
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      {/* HERO ── saludo editorial + fecha */}
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
          {saludo(now)}.
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Empresa Demo · {capitalize(fechaLargaFormatter.format(now))}
        </p>
      </header>

      {/* KPIs ── banda de 4 */}
      <section
        aria-label="Indicadores clave"
        className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiSolvencia data={solvencia.data} loading={solvencia.isLoading} />
        <KpiOportunidades
          verde={distribucion.data?.verde ?? 0}
          loading={distribucion.isLoading}
        />
        <KpiPendiente
          label="Avales inmovilizados"
          modulo="M7"
          icon={FileSignature}
          tooltip="Importe total de avales bancarios activos. Disponible cuando se construya el módulo de Administración."
        />
        <KpiPendiente
          label="Tasa de éxito"
          modulo="M8"
          icon={TrendingUp}
          tooltip="Porcentaje de licitaciones adjudicadas sobre las presentadas. Disponible cuando se construya el módulo Histórico."
        />
      </section>

      {/* GRÁFICO ── distribución de semáforo (decision-tool central) */}
      <section className="mb-6" aria-label="Distribución por semáforo">
        <DistribucionSemaforo
          data={distribucion.data}
          loading={distribucion.isLoading}
        />
      </section>

      {/* DOS LISTAS — el detalle accionable */}
      <section className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ListaLicitaciones
          icon={Clock}
          titulo="Cierran esta semana"
          subtitulo="Verdes · plazo ≤14 días"
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
          emptyMsg="Aún no hay licitaciones compatibles. Pulsa «Actualizar lista» en el Radar."
        />
      </section>

      {/* DESGLOSE ROLECE */}
      <section aria-label="Solvencia por grupo">
        <DesgloseRolece data={solvencia.data} loading={solvencia.isLoading} />
      </section>
    </div>
  );
}

// ─── KPI: Solvencia (M3) ─────────────────────────────────────────────────────

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
      tooltip="Anualidad media de obra certificada en los últimos 5 años (LCSP art. 88). Determina el tamaño máximo de licitación al que puedes optar."
    >
      {tieneObras ? (
        <>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {eurCompact.format(anualidad)}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            Pico: {eurCompact.format(pico)}
            {data?.anio_pico ? ` · ${data.anio_pico}` : ""}
          </p>
        </>
      ) : (
        <>
          <p className="text-3xl font-semibold tracking-tight text-muted-foreground/60">
            —
          </p>
          <Link
            href="/empresa/certificados"
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
          >
            Subir certificados <ArrowRight className="h-3 w-3" />
          </Link>
        </>
      )}
    </KpiTile>
  );
}

// ─── KPI: Oportunidades (M2) ────────────────────────────────────────────────

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
      label="Oportunidades verdes"
      tooltip="Licitaciones del Radar para las que cumples solvencia (semáforo verde) y siguen abiertas."
    >
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
        {verde}
      </p>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
        {verde === 0
          ? "ninguna abierta ahora"
          : `licitación${verde === 1 ? "" : "es"} abierta${verde === 1 ? "" : "s"}`}
      </p>
    </KpiTile>
  );
}

// ─── Gráfico: distribución por semáforo (barra apilada) ────────────────────

function DistribucionSemaforo({
  data,
  loading,
}: {
  data: { verde: number; amarillo: number; rojo: number } | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-5">
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-muted" />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded bg-muted" />
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
      <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-5">
        <p className="text-[11px] font-medium text-muted-foreground">
          Reparto del Radar por semáforo
        </p>
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
  const pctVerdeAccesible = pctVerde + pctAmarillo;

  return (
    <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-5">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">
            Reparto del Radar por semáforo
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            De{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {total.toLocaleString("es-ES")}
            </span>{" "}
            licitaciones abiertas, puedes optar a{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {(verde + amarillo).toLocaleString("es-ES")}
            </span>{" "}
            <span className="text-muted-foreground/70">
              ({pctVerdeAccesible.toFixed(0)}%)
            </span>
            .
          </p>
        </div>
      </header>

      {/* Barra apilada */}
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Verde ${verde}, amarillo ${amarillo}, rojo ${rojo}`}
      >
        {pctVerde > 0 && (
          <div
            className="h-full bg-success transition-all duration-500"
            style={{ width: `${pctVerde}%` }}
            title={`Verde — ${verde}`}
          />
        )}
        {pctAmarillo > 0 && (
          <div
            className="h-full bg-warning transition-all duration-500"
            style={{ width: `${pctAmarillo}%` }}
            title={`Amarillo — ${amarillo}`}
          />
        )}
        {pctRojo > 0 && (
          <div
            className="h-full bg-danger transition-all duration-500"
            style={{ width: `${pctRojo}%` }}
            title={`Rojo — ${rojo}`}
          />
        )}
      </div>

      {/* Leyenda con cifras y porcentaje */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <LeyendaSemaforo
          dotClass="bg-success"
          label="Cumples solvencia"
          count={verde}
          pct={pctVerde}
          href="/radar?semaforo=verde"
        />
        <LeyendaSemaforo
          dotClass="bg-warning"
          label="Solvencia ajustada"
          count={amarillo}
          pct={pctAmarillo}
          href="/radar?semaforo=amarillo"
        />
        <LeyendaSemaforo
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

function LeyendaSemaforo({
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
      className="
        group flex flex-col gap-1 rounded-lg px-3 py-2
        ring-1 ring-border bg-surface
        transition-colors hover:ring-foreground/20
      "
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-2 w-2 flex-shrink-0 rounded-full ${dotClass}`}
        />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-semibold tabular-nums text-foreground">
          {count.toLocaleString("es-ES")}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {pct.toFixed(0)}%
        </span>
      </div>
    </Link>
  );
}

// ─── KPI: Tile placeholder (M7, M8) ─────────────────────────────────────────

function KpiPendiente({
  label,
  modulo,
  icon: Icon,
  tooltip,
}: {
  label: string;
  modulo: string;
  icon: LucideIcon;
  tooltip: string;
}) {
  return (
    <div
      className="
        relative flex flex-col justify-between
        rounded-2xl bg-surface-raised ring-1 ring-border
        px-5 py-4
      "
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">
            {label}
          </p>
          <span
            title={tooltip}
            className="cursor-help text-muted-foreground/70"
          >
            <Info className="h-3 w-3" />
          </span>
        </div>
        <Icon
          className="h-4 w-4 text-muted-foreground/40"
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex items-end justify-between">
        <p className="text-3xl font-semibold tracking-tight text-muted-foreground/30">
          —
        </p>
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/55">
          {modulo} · pronto
        </span>
      </div>
    </div>
  );
}

// ─── Tile primitive ─────────────────────────────────────────────────────────

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
    <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-4">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-medium text-muted-foreground">
          {label}
        </p>
        {tooltip && (
          <span
            title={tooltip}
            className="cursor-help text-muted-foreground/70 hover:text-muted-foreground"
          >
            <Info className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-4">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-8 w-28 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-2 w-20 animate-pulse rounded bg-muted" />
    </div>
  );
}

// ─── Lista de licitaciones (sección) ────────────────────────────────────────

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
    <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 pt-4 pb-3">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon
            className="h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
            <p className="text-[11px] text-muted-foreground">{subtitulo}</p>
          </div>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {ctaLabel}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <RowSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">
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
    <div className="flex items-center gap-3 rounded-lg bg-surface-raised ring-1 ring-border px-4 py-3">
      <div className="h-4 w-1 animate-pulse rounded bg-muted" />
      <div className="h-4 w-4 animate-pulse rounded bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-4 w-16 animate-pulse rounded bg-muted" />
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
      <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-5">
        <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-3 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.total_obras === 0) {
    return (
      <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-5">
        <p className="text-[11px] font-medium text-muted-foreground">
          Solvencia por grupo ROLECE
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no hay obras certificadas. Sube tus certificados desde{" "}
          <Link
            href="/empresa/certificados"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Solvencia → Certificados
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
    <div className="rounded-2xl bg-surface-raised ring-1 ring-border px-5 py-5">
      <header className="mb-4 flex items-baseline justify-between">
        <p className="text-[11px] font-medium text-muted-foreground">
          Solvencia por grupo ROLECE
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {data.total_obras} {data.total_obras === 1 ? "obra" : "obras"}
        </p>
      </header>
      <div className="space-y-2.5">
        {data.por_grupo.map((g, idx) => {
          const pct =
            maxImporte > 0 ? (Number(g.importe_total) / maxImporte) * 100 : 0;
          return (
            <div key={g.grupo} className="flex items-center gap-3">
              <span
                className="w-28 flex-shrink-0 truncate text-xs font-medium text-foreground"
                title={grupoLabel(g.grupo)}
              >
                {grupoLabel(g.grupo)}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${grupoColor(idx)}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="w-24 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                {eur.format(Number(g.importe_total))}
              </span>
              <span className="w-14 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {g.num_obras} {g.num_obras === 1 ? "obra" : "obras"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
