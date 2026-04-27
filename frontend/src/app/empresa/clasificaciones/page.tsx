"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Plus, RefreshCcw } from "lucide-react";
import { clasificacionesApi } from "@/lib/api/clasificaciones";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import {
  ClasificacionesTabla,
  type ClasificacionesTablaHandle,
} from "@/components/empresa/ClasificacionesTabla";

const QUERY_KEY = ["clasificaciones", EMPRESA_DEMO_ID] as const;

function SkeletonRow() {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-muted" style={{ width: `${[60, 80, 40, 72, 72, 56, 48][i]}%` }} />
        </td>
      ))}
    </tr>
  );
}

export default function ClasificacionesPage() {
  const { data: clasificaciones, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => clasificacionesApi.list({ empresa_id: EMPRESA_DEMO_ID }),
  });

  const [infoOpen, setInfoOpen] = useState(false);
  const tablaRef = useRef<ClasificacionesTablaHandle>(null);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            Clasificaciones ROLECE
          </h1>
          <button
            onClick={() => setInfoOpen((v) => !v)}
            className={`rounded-full p-1 transition-colors hover:bg-muted ${infoOpen ? "text-foreground" : "text-muted-foreground/50 hover:text-muted-foreground"}`}
            aria-label="Información sobre clasificaciones ROLECE"
            aria-expanded={infoOpen}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>

        {!isLoading && !isError && (
          <button
            onClick={() => tablaRef.current?.startNew()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-85"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Añadir clasificación
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

      {/* Tabla */}
      {!isLoading && !isError && clasificaciones && (
        <ClasificacionesTabla ref={tablaRef} clasificaciones={clasificaciones} />
      )}
    </main>
  );
}
