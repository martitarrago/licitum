"use client";

import { Suspense, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  RefreshCcw,
  Search,
  XCircle,
} from "lucide-react";
import {
  licitacionesApi,
  type LicitacionRead,
} from "@/lib/api/licitaciones";
import { LicitacionCard } from "@/components/ui/LicitacionCard";
import { RadarFilterBar } from "@/components/radar/RadarFilterBar";
import { RadarActiveChips } from "@/components/radar/RadarActiveChips";
import { useRadarFilters } from "@/lib/hooks/useRadarFilters";

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
  });

  const ingesta = useMutation({
    mutationFn: () => licitacionesApi.triggerIngesta(),
    onSuccess: () => {
      // El worker tarda 10-30s. Reintentos escalonados para capturar la
      // ventana en la que los datos quedan persistidos.
      [3000, 8000, 15000, 30000].forEach((d) => setTimeout(() => refetch(), d));
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
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Radar IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Licitaciones de Cataluña filtradas por semáforo de solvencia
          </p>
        </div>
        <button
          onClick={() => ingesta.mutate()}
          disabled={ingesta.isPending}
          className="
            inline-flex items-center gap-2 rounded-lg
            bg-foreground px-4 py-2 text-sm font-medium text-surface
            transition-opacity hover:opacity-85 disabled:opacity-50
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground
          "
        >
          {ingesta.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          )}
          Actualizar feed
        </button>
      </div>

      {/* Banners de ingesta */}
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

      {/* Barra de filtros */}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {licitaciones.map((l) => {
              const p = parseLicitacion(l);
              return (
                <div key={l.id} className="relative">
                  <LicitacionCard
                    titulo={p.titulo}
                    organismo={p.organismo}
                    importe={p.importe}
                    fechaLimite={p.fechaLimite}
                    semaforo={p.semaforo}
                    cpvs={p.cpvs}
                  />
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        absolute right-3 top-3 z-10 rounded-md p-1.5
                        text-muted-foreground transition-colors
                        hover:bg-muted hover:text-foreground
                      "
                      title="Ver publicación oficial"
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
