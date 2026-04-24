"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Search,
  XCircle,
} from "lucide-react";
import { licitacionesApi, type LicitacionRead, type SemaforoType } from "@/lib/api/licitaciones";
import { LicitacionCard } from "@/components/ui/LicitacionCard";

// ─── Filtros de semáforo ──────────────────────────────────────────────────────

type FiltroSemaforo = "todos" | SemaforoType;

const FILTROS_SEMAFORO: { value: FiltroSemaforo; label: string; icon: React.ReactNode }[] = [
  { value: "todos", label: "Todos", icon: <Circle className="h-3.5 w-3.5" /> },
  {
    value: "verde",
    label: "Aptas",
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  },
  {
    value: "amarillo",
    label: "Marginales",
    icon: <AlertCircle className="h-3.5 w-3.5 text-warning" />,
  },
  {
    value: "rojo",
    label: "Fuera de alcance",
    icon: <XCircle className="h-3.5 w-3.5 text-danger" />,
  },
  {
    value: "gris",
    label: "Sin clasificar",
    icon: <Circle className="h-3.5 w-3.5 text-muted-foreground" />,
  },
];

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
  };
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function RadarPage() {
  const [filtroSemaforo, setFiltroSemaforo] = useState<FiltroSemaforo>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 24;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["licitaciones", filtroSemaforo, busqueda, page],
    queryFn: () =>
      licitacionesApi.list({
        semaforo: filtroSemaforo === "todos" ? null : filtroSemaforo,
        q: busqueda || null,
        page,
        page_size: PAGE_SIZE,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const ingesta = useMutation({
    mutationFn: () => licitacionesApi.triggerIngesta(),
    onSuccess: () => {
      // El worker tarda 10-30s (descarga + upsert bulk). Reintentamos
      // refetch varias veces para capturar cuando los datos estén escritos.
      [3000, 8000, 15000, 30000].forEach((delay) => {
        setTimeout(() => refetch(), delay);
      });
    },
  });

  const handleBusqueda = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBusqueda(e.target.value);
      setPage(1);
    },
    [],
  );

  const handleFiltro = useCallback((v: FiltroSemaforo) => {
    setFiltroSemaforo(v);
    setPage(1);
  }, []);

  const total = data?.total ?? 0;
  const licitaciones = data?.items ?? [];
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Radar IA</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Licitaciones de Catalunya filtradas por semáforo de solvencia
          </p>
        </div>
        <button
          onClick={() => ingesta.mutate()}
          disabled={ingesta.isPending}
          className="
            inline-flex items-center gap-2 rounded-lg
            bg-foreground px-4 py-2 text-sm font-medium text-surface
            transition-opacity hover:opacity-80 disabled:opacity-50
          "
        >
          {ingesta.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Actualizar feed
        </button>
      </div>

      {ingesta.isSuccess && (
        <div className="rounded-lg bg-success/10 px-4 py-2.5 text-sm text-success ring-1 ring-success/25">
          Ingestión lanzada — el feed se actualizará en unos minutos.
        </div>
      )}
      {ingesta.isError && (
        <div className="rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger ring-1 ring-danger/25">
          Error al lanzar la ingestión. ¿Está el worker de Celery activo?
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs semáforo */}
        <div className="flex flex-wrap gap-1.5">
          {FILTROS_SEMAFORO.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFiltro(f.value)}
              className={`
                inline-flex items-center gap-1.5 rounded-full px-3 py-1.5
                text-xs font-medium ring-1 ring-inset transition-colors
                ${
                  filtroSemaforo === f.value
                    ? "bg-foreground text-surface ring-foreground"
                    : "bg-transparent text-muted-foreground ring-border hover:bg-muted"
                }
              `}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>

        {/* Búsqueda */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar licitación u organismo…"
            value={busqueda}
            onChange={handleBusqueda}
            className="
              w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2
              text-sm text-foreground placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-foreground/20
            "
          />
        </div>
      </div>

      {/* Contador */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "No hay licitaciones"
            : `${total.toLocaleString("es-ES")} licitación${total !== 1 ? "es" : ""}`}
        </p>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <XCircle className="h-10 w-10 text-danger" />
          <p className="text-sm text-muted-foreground">
            Error al cargar licitaciones. Comprueba que el backend está activo.
          </p>
          <button
            onClick={() => refetch()}
            className="text-sm font-medium underline underline-offset-2"
          >
            Reintentar
          </button>
        </div>
      ) : licitaciones.length === 0 ? (
        <EmptyState hasFilter={filtroSemaforo !== "todos" || busqueda !== ""} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                        absolute right-3 top-3 z-10
                        rounded-md p-1.5 text-muted-foreground
                        transition-colors hover:bg-muted hover:text-foreground
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
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-border
                  disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Anterior
              </button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-border
                  disabled:opacity-40 hover:bg-muted transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <div className="rounded-full bg-muted p-4">
        <Search className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium text-foreground">
          {hasFilter ? "Sin resultados para este filtro" : "Todavía no hay licitaciones"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasFilter
            ? "Prueba a quitar los filtros."
            : "Pulsa «Actualizar feed» para descargar las licitaciones públicas de Catalunya."}
        </p>
      </div>
    </div>
  );
}
