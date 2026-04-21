"use client";

import { useQuery } from "@tanstack/react-query";
import { certificadosApi } from "@/lib/api/certificados";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const GRUPO_OPACITIES = ["90", "75", "60", "50", "40", "35", "30"];

function grupoColor(idx: number) {
  const op = GRUPO_OPACITIES[idx % GRUPO_OPACITIES.length];
  return `bg-foreground/${op}`;
}

export function SolvenciaResumen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["resumen-solvencia"],
    queryFn: () => certificadosApi.resumenSolvencia(EMPRESA_DEMO_ID),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="mb-6 rounded-xl bg-surface-raised ring-1 ring-border shadow-sm p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-7 w-24 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !data) return null;

  if (data.total_obras === 0) {
    return (
      <div className="mb-6 rounded-xl bg-surface-raised ring-1 ring-border shadow-sm px-5 py-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
          Solvencia acreditada · últimos 5 años
        </p>
        <p className="text-sm text-muted-foreground">
          Aún no hay certificados válidos con fecha de fin e importe registrados.
          Completa esos campos al revisar cada certificado para ver tu solvencia aquí.
        </p>
      </div>
    );
  }

  const maxImporte = Math.max(...data.por_grupo.map((g) => Number(g.importe_total)));

  return (
    <div className="mb-6 rounded-xl bg-surface-raised ring-1 ring-border shadow-sm overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-border">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Solvencia acreditada · últimos 5 años
          </p>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-2xl font-bold tabular-nums text-foreground">
              {importeFormatter.format(Number(data.anualidad_media))}
            </span>
            <span className="text-sm text-muted-foreground">anualidad media</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {data.total_obras}
          </span>
          <p className="text-xs text-muted-foreground">
            obras certificadas
          </p>
        </div>
      </div>

      {data.por_grupo.length > 0 && (
        <div className="px-5 py-3 space-y-2">
          {data.por_grupo.map((g, idx) => {
            const pct = maxImporte > 0 ? (Number(g.importe_total) / maxImporte) * 100 : 0;
            return (
              <div key={g.grupo} className="flex items-center gap-3">
                <span className="w-20 flex-shrink-0 text-xs font-medium text-muted-foreground truncate">
                  Grupo {g.grupo}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${grupoColor(idx)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-20 flex-shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
                  {importeFormatter.format(Number(g.importe_total))}
                </span>
                <span className="w-14 flex-shrink-0 text-right text-xs text-muted-foreground">
                  {g.num_obras} {g.num_obras === 1 ? "obra" : "obras"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
