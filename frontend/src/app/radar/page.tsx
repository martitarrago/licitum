"use client";

import { Suspense, useCallback, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  HelpCircle,
  Loader2,
  RefreshCcw,
  RotateCw,
  Search,
  XCircle,
} from "lucide-react";
import {
  licitacionesApi,
  type LicitacionRead,
} from "@/lib/api/licitaciones";
import { intelApi, type FeedItem } from "@/lib/api/intel";
import { LicitacionCard } from "@/components/ui/LicitacionCard";
import { RadarFilterBar } from "@/components/radar/RadarFilterBar";
import { RadarActiveChips } from "@/components/radar/RadarActiveChips";
import { TopGanablesHero } from "@/components/radar/TopGanablesHero";
import { DescartadasSection } from "@/components/radar/DescartadasSection";
import { useRadarFilters } from "@/lib/hooks/useRadarFilters";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

const PAGE_SIZE = 24;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLicitacion(l: LicitacionRead) {
  return {
    titulo: l.titulo ?? "Sin título",
    organismo: l.organismo ?? "Organismo desconocido",
    importe: l.importe_licitacion ? parseFloat(l.importe_licitacion) : 0,
    fechaLimite: l.fecha_limite ? new Date(l.fecha_limite) : new Date(0),
    semaforo: (l.semaforo === "gris" ? "amarillo" : l.semaforo) as
      | "verde"
      | "amarillo"
      | "rojo",
    cpvs: l.cpv_codes,
    url: l.url_placsp,
    razon: l.semaforo_razon,
    afinidad: l.score_afinidad ? parseFloat(l.score_afinidad) : null,
  };
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="flex overflow-hidden rounded-xl bg-surface-raised ring-1 ring-border shadow-sm">
      <div className="w-2 flex-shrink-0 animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div className="space-y-1.5">
            <div className="h-2.5 w-12 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page (envuelve en Suspense por useSearchParams) ─────────────────────────

export default function RadarPage() {
  return (
    <Suspense fallback={<div />}>
      <RadarPageContent />
    </Suspense>
  );
}

function RadarPageContent() {
  const filtersState = useRadarFilters();
  const { filters, patchFilters, clearFilters, activeCount } = filtersState;
  const [infoOpen, setInfoOpen] = useState(false);

  // Lookup map score por licitacion_id — para enriquecer las cards del feed.
  // Se rellena con la primera página del feed scored.
  const scoreFeedQuery = useQuery({
    queryKey: ["intel", "feed-map", EMPRESA_DEMO_ID, filters.page],
    queryFn: () =>
      intelApi.feed({
        empresa_id: EMPRESA_DEMO_ID,
        include_descartadas: false,
        min_score: 0,
        limit: 200,
        offset: 0,
      }),
    staleTime: 60_000,
  });
  const scoreMap = new Map<string, FeedItem>();
  for (const it of scoreFeedQuery.data?.items ?? []) {
    scoreMap.set(it.licitacion_id, it);
  }

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["licitaciones", filters],
    queryFn: () =>
      licitacionesApi.list({
        semaforo: filters.semaforo === "todos" ? null : filters.semaforo,
        provincia: filters.provincia.length > 0 ? filters.provincia : null,
        tipo_organismo:
          filters.tipo_organismo.length > 0 ? filters.tipo_organismo : null,
        importe_min: filters.importe_min,
        importe_max: filters.importe_max,
        plazo_min_dias: filters.plazo_min_dias,
        plazo_max_dias: filters.plazo_max_dias,
        cpv_prefix: filters.cpv_prefix,
        q: filters.q || null,
        page: filters.page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    // Cuando el usuario vuelve al tab tras cambios en M3 (certificados,
    // clasificaciones), las queries son stale → refetch al recuperar foco.
    // No basta para recalcular el semáforo (eso necesita el botón), pero sí
    // para recoger cambios ya recalculados desde otra ventana.
    refetchOnWindowFocus: true,
  });

  const ingesta = useMutation({
    mutationFn: () => licitacionesApi.triggerIngesta(),
    onSuccess: () => {
      // El worker tarda 10-30s. Reintentos escalonados para capturar la
      // ventana en la que los datos quedan persistidos.
      [3000, 8000, 15000, 30000].forEach((d) => setTimeout(() => refetch(), d));
    },
  });

  const recalcular = useMutation({
    mutationFn: () => licitacionesApi.triggerRecalcularSemaforo(),
    onSuccess: () => {
      // Recálculo masivo en BD suele tardar 1-3s; refetch escalonado.
      [2000, 5000, 10000].forEach((d) => setTimeout(() => refetch(), d));
    },
  });

  const setPage = useCallback(
    (p: number) => patchFilters({ page: p }),
    [patchFilters],
  );

  const total = data?.total ?? 0;
  const licitaciones = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-8">
      {/* Header */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
              radar de licitaciones
            </h1>
            <button
              onClick={() => setInfoOpen((v) => !v)}
              aria-expanded={infoOpen}
              aria-label="Cómo funciona esta página"
              title="Cómo funciona esta página"
              className="mb-1 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Licitaciones de obras públicas en Catalunya filtradas según tu
            solvencia. Cruzamos CPV, ROLECE, RELIC y tu histórico para
            destacar lo que <strong className="text-foreground">sí puedes ganar</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => recalcular.mutate()}
            disabled={recalcular.isPending}
            title="Vuelve a calcular qué licitaciones puedes ganar tras subir certificados o clasificaciones nuevas"
            className="btn-secondary"
          >
            {recalcular.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            )}
            Recalcular semáforos
          </button>
          <button
            onClick={() => ingesta.mutate()}
            disabled={ingesta.isPending}
            className="btn-primary"
          >
            {ingesta.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
            )}
            Actualizar lista
          </button>
        </div>
      </header>

      {/* Panel explicativo — solo cuando el usuario pulsa ? */}
      {infoOpen && (
        <div className="mb-6 space-y-4 rounded-xl bg-surface-raised px-5 py-5 text-sm ring-1 ring-border">
          <div>
            <p className="mb-2 text-xs font-semibold text-foreground">
              Qué ves en esta pantalla
            </p>
            <p className="text-muted-foreground">
              Cada tarjeta es una licitación de obra pública abierta en Catalunya. La
              lista se actualiza automáticamente cada mañana a las 7:00; si quieres
              forzarla en cualquier momento, pulsa{" "}
              <span className="font-medium text-foreground">«Actualizar lista»</span>.
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold text-foreground">
              Qué significa el color del semáforo
            </p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <span className="font-medium text-success">Verde</span> — tu empresa
                cumple con la clasificación o solvencia que la obra exige. Puedes
                presentarte sin problema.
              </li>
              <li>
                <span className="font-medium text-warning">Amarillo</span> — tienes
                la clasificación correcta pero la categoría se queda corta para el
                importe de esta obra.
              </li>
              <li>
                <span className="font-medium text-danger">Rojo</span> — la obra
                exige un grupo (edificación, viales, eléctricas…) que tu empresa no
                tiene acreditado.
              </li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              El cálculo cruza la información del{" "}
              <span className="font-medium text-foreground">Radar</span> (CPV e importe
              de la obra) con tus datos del módulo{" "}
              <span className="font-medium text-foreground">Solvencia</span>
              (clasificaciones ROLECE y certificados de obra).
            </p>
          </div>
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-semibold text-foreground">
              Cómo afinar la búsqueda
            </p>
            <p className="text-muted-foreground">
              Los filtros de la barra superior funcionan combinados: provincia, tipo
              de organismo, importe, plazo y código CPV. Si tienes obras certificadas
              con un ayuntamiento concreto, sus licitaciones suben arriba con la
              etiqueta <span className="font-medium text-foreground">«Has trabajado antes con este organismo»</span>.
            </p>
          </div>
        </div>
      )}

      {/* Banners de acciones */}
      {ingesta.isSuccess && (
        <div className="mb-4 rounded-xl bg-success/10 px-4 py-2.5 text-sm text-success ring-1 ring-success/25">
          Ingestión lanzada — el feed se actualizará en unos minutos.
        </div>
      )}
      {ingesta.isError && (
        <div className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger ring-1 ring-danger/25">
          Error al lanzar la ingestión. ¿Está el worker de Celery activo?
        </div>
      )}
      {recalcular.isSuccess && (
        <div className="mb-4 rounded-xl bg-success/10 px-4 py-2.5 text-sm text-success ring-1 ring-success/25">
          Recálculo de semáforos lanzado — los nuevos resultados aparecerán en unos segundos.
        </div>
      )}
      {recalcular.isError && (
        <div className="mb-4 rounded-xl bg-danger/10 px-4 py-2.5 text-sm text-danger ring-1 ring-danger/25">
          Error al lanzar el recálculo. ¿Está el worker de Celery activo?
        </div>
      )}

      {/* Hero — Top ganables según el motor */}
      <TopGanablesHero empresaId={EMPRESA_DEMO_ID} />

      {/* Barra de filtros */}
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="display-h text-lg sm:text-xl">explorar todas</h2>
      </div>
      <div className="mb-3">
        <RadarFilterBar state={filtersState} />
      </div>

      {/* Chips de filtros activos */}
      {activeCount > 0 && (
        <div className="mb-4">
          <RadarActiveChips state={filtersState} />
        </div>
      )}

      {/* Contador */}
      {!isLoading && (
        <p className="mb-4 text-xs tabular-nums text-muted-foreground">
          {total === 0 ? (
            "Sin resultados"
          ) : (
            <>
              <span className="font-semibold text-foreground">
                {total.toLocaleString("es-ES")}
              </span>{" "}
              licitación{total !== 1 ? "es" : ""}
              {activeCount > 0 && (
                <>
                  {" "}
                  con {activeCount} filtro{activeCount !== 1 ? "s" : ""} aplicado
                  {activeCount !== 1 ? "s" : ""}
                </>
              )}
              {isFetching && (
                <span className="ml-2 inline-flex items-center gap-1 text-muted-foreground/70">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Actualizando…
                </span>
              )}
            </>
          )}
        </p>
      )}

      {/* Estados */}
      {isLoading ? (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <XCircle className="h-10 w-10 text-danger" aria-hidden="true" />
          <p className="text-sm font-semibold text-danger">
            No se pudo cargar el feed.
          </p>
          <p className="text-xs text-muted-foreground">
            Comprueba que el backend está activo.
          </p>
          <button
            onClick={() => refetch()}
            className="
              inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2
              text-sm font-medium text-foreground transition-colors
              hover:bg-neutral-200 dark:hover:bg-neutral-800
            "
          >
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reintentar
          </button>
        </div>
      ) : licitaciones.length === 0 ? (
        <EmptyState hasFilters={activeCount > 0} onClear={clearFilters} />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {licitaciones.map((l) => {
              const p = parseLicitacion(l);
              const scored = scoreMap.get(l.id);
              return (
                <div key={l.id} className="group/card relative">
                  <Link
                    href={`/radar/${encodeURIComponent(l.expediente)}`}
                    className="block rounded-xl outline-none transition-all
                      focus-visible:ring-2 focus-visible:ring-foreground/30
                      group-hover/card:-translate-y-0.5"
                  >
                    <LicitacionCard
                      titulo={p.titulo}
                      organismo={p.organismo}
                      importe={p.importe}
                      fechaLimite={p.fechaLimite}
                      semaforo={p.semaforo}
                      cpvs={p.cpvs}
                      razon={p.razon}
                      afinidad={p.afinidad}
                      score={scored?.score ?? null}
                      highlight={scored?.highlight ?? null}
                      completeness={scored?.data_completeness_pct ?? null}
                    />
                  </Link>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="
                        absolute right-3 top-3 z-10 rounded-md p-1.5
                        text-muted-foreground transition-colors
                        hover:bg-muted hover:text-foreground
                      "
                      title="Ver publicación oficial en PSCP (abre en otra pestaña)"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                disabled={filters.page === 1}
                onClick={() => setPage(filters.page - 1)}
                className="
                  rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-border
                  transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent
                "
              >
                Anterior
              </button>
              <span className="text-xs tabular-nums text-muted-foreground">
                Página {filters.page} de {totalPages}
              </span>
              <button
                disabled={filters.page >= totalPages}
                onClick={() => setPage(filters.page + 1)}
                className="
                  rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-border
                  transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent
                "
              >
                Siguiente
              </button>
            </div>
          )}

          {/* Sección descartadas — colapsable, agrupada por razón */}
          <DescartadasSection empresaId={EMPRESA_DEMO_ID} />
        </>
      )}
    </main>
  );
}

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {hasFilters ? "Sin resultados con estos filtros" : "Todavía no hay licitaciones"}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasFilters
            ? "Prueba a quitar algún filtro o cambiar el rango."
            : "Pulsa «Actualizar feed» para descargar las licitaciones públicas de Cataluña."}
        </p>
      </div>
      {hasFilters && (
        <button
          onClick={onClear}
          className="
            rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface
            transition-opacity hover:opacity-85
          "
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
