"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Plus, RefreshCcw } from "lucide-react";
import { clasificacionesApi } from "@/lib/api/clasificaciones";
import { relicApi, type ClasificacionRelic } from "@/lib/api/relic";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import {
  ClasificacionesTabla,
  type ClasificacionesTablaHandle,
} from "@/components/empresa/ClasificacionesTabla";

const QUERY_KEY_MANUAL = ["clasificaciones", EMPRESA_DEMO_ID] as const;
const QUERY_KEY_RELIC = ["relic", EMPRESA_DEMO_ID] as const;

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${[60, 80, 40, 64, 72, 72, 56, 48][i]}%` }} />
        </td>
      ))}
    </tr>
  );
}

export default function ClasificacionesPage() {
  const { data: clasificaciones, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: QUERY_KEY_MANUAL,
    queryFn: () => clasificacionesApi.list({ empresa_id: EMPRESA_DEMO_ID }),
  });

  const { data: relic } = useQuery({
    queryKey: QUERY_KEY_RELIC,
    queryFn: () => relicApi.get(EMPRESA_DEMO_ID),
    staleTime: 5 * 60 * 1000,
  });

  const [infoOpen, setInfoOpen] = useState(false);
  const tablaRef = useRef<ClasificacionesTablaHandle>(null);

  const relicSoloEnRelic = useMemo<ClasificacionRelic[]>(() => {
    if (!relic?.clasificaciones_relic || !clasificaciones) return relic?.clasificaciones_relic ?? [];
    const manualKeys = new Set(
      clasificaciones.map((c) => clavesClasificacion(c.grupo, c.subgrupo, c.categoria)),
    );
    return relic.clasificaciones_relic.filter(
      (r) => !manualKeys.has(clavesClasificacion(r.grupo, r.subgrupo, r.categoria)),
    );
  }, [relic, clasificaciones]);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tus clasificaciones efectivas (manuales + sync RELIC unidas). Las
          manuales son editables aquí; las RELIC se sincronizan en su pestaña.
          Mantén las fechas de caducidad al día — caducar excluye
          automáticamente de licitaciones en curso.
          <button
            onClick={() => setInfoOpen((v) => !v)}
            className={`ml-1.5 inline-flex translate-y-0.5 rounded-full p-1 transition-colors hover:bg-muted ${infoOpen ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
            aria-label="Información sobre clasificaciones ROLECE"
            aria-expanded={infoOpen}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </p>

        {!isLoading && !isError && (
          <button
            onClick={() => tablaRef.current?.startNew()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-85"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Añadir manual
          </button>
        )}
      </div>

      {/* Panel informativo */}
      {infoOpen && (
        <div className="mb-6 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <p>
            Las clasificaciones ROLECE acreditan los grupos y subgrupos de obra para los que tu empresa está habilitada según la Junta Consultiva de Contratación del Estado (JCCPE — Real Decreto 1098/2001). Mantener las fechas de caducidad actualizadas es imprescindible para no quedar excluido de licitaciones en curso.
          </p>
        </div>
      )}

      {/* Skeleton de carga */}
      {isLoading && (
        <div className="overflow-x-auto rounded-xl ring-1 ring-border">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-danger">
            No se pudo cargar la lista de clasificaciones.
          </p>
          <p className="text-xs text-muted-foreground">
            Comprueba que el backend está en marcha.
          </p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla manuales */}
      {!isLoading && !isError && clasificaciones && (
        <ClasificacionesTabla
          ref={tablaRef}
          clasificaciones={clasificaciones}
          relicClasificaciones={relic?.clasificaciones_relic ?? []}
        />
      )}

      {/* RELIC sin equivalente manual */}
      {!isLoading && !isError && relicSoloEnRelic.length > 0 && (
        <section className="mt-8">
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="font-serif text-base font-medium text-foreground">
              Cobertura adicional vía RELIC
            </h2>
            <p className="text-xs text-muted-foreground">
              {relicSoloEnRelic.length} clasificaciones sin equivalente manual
            </p>
          </header>
          <p className="mb-4 max-w-2xl text-xs text-muted-foreground">
            RELIC reporta estas clasificaciones oficialmente y son válidas para
            acreditar solvencia (LCSP art. 159.4). Si quieres además gestionar
            su caducidad localmente, añádelas como manuales arriba.
          </p>
          <RelicReadOnlyTable items={relicSoloEnRelic} />
        </section>
      )}
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function clavesClasificacion(
  grupo: string,
  subgrupo: string | null,
  categoria: string | number | null,
): string {
  const g = (grupo ?? "").toUpperCase();
  const s = (subgrupo ?? "").toString();
  const c = categoria == null ? "" : String(categoria);
  return `${g}|${s}|${c}`;
}

function RelicReadOnlyTable({ items }: { items: ClasificacionRelic[] }) {
  const sorted = [...items].sort((a, b) => a.sigles_cl.localeCompare(b.sigles_cl));
  return (
    <div className="overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Sigla</th>
            <th className="px-4 py-3">Descripción</th>
            <th className="px-4 py-3">Categoría</th>
            <th className="px-4 py-3">Otorgada</th>
            <th className="px-4 py-3">Fuente</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-border last:border-b-0 ${c.suspensio ? "opacity-50" : ""}`}
            >
              <td className="px-4 py-3 font-mono font-medium">{c.sigles_cl}</td>
              <td className="px-4 py-3">
                {c.subgrup_cl_text ?? (
                  <span className="italic text-muted-foreground">nivel grupo</span>
                )}
                {c.suspensio && (
                  <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
                    Suspendida
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {c.categoria !== null ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-foreground/[0.07] font-mono text-xs font-semibold ring-1 ring-inset ring-foreground/10">
                    {c.categoria}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {fmtFecha(c.data_atorgament)}
              </td>
              <td className="px-4 py-3">
                <FuenteBadge variant="relic" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FuenteBadge({ variant }: { variant: "manual" | "relic" }) {
  if (variant === "manual") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground/70 ring-1 ring-inset ring-foreground/10">
        Manual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-info ring-1 ring-inset ring-info/20">
      RELIC
    </span>
  );
}

function fmtFecha(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
