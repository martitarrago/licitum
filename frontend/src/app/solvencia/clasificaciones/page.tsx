"use client";

import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { clasificacionesApi } from "@/lib/api/clasificaciones";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import { ClasificacionesTabla } from "@/components/solvencia/ClasificacionesTabla";

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
  const { data: clasificaciones, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      clasificacionesApi.list({ empresa_id: EMPRESA_DEMO_ID }),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Clasificaciones ROLECE
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registro oficial de clasificaciones de contratista de la empresa
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
          <ShieldCheck className="h-4 w-4 text-primary-500" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">
            Fuente: JCCPE — Real Decreto 1098/2001
          </span>
        </div>
      </div>

      {/* Leyenda de estados */}
      <div className="mb-6 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" />
          Activa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warning" />
          Caduca en menos de 90 días
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-danger" />
          Caducada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
          Inactiva (desactivada manualmente)
        </span>
      </div>

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
        </div>
      )}

      {/* Tabla */}
      {!isLoading && !isError && clasificaciones && (
        <ClasificacionesTabla clasificaciones={clasificaciones} />
      )}
    </main>
  );
}
