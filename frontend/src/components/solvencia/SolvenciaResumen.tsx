"use client";

import { useQuery } from "@tanstack/react-query";
import { certificadosApi } from "@/lib/api/certificados";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const GRUPO_OPACITIES = ["90", "70", "55", "45", "35", "30", "25"];

function grupoColor(idx: number) {
  return `bg-foreground/${GRUPO_OPACITIES[idx % GRUPO_OPACITIES.length]}`;
}

function grupoLabel(g: string) {
  return g === "Sin clasificar" ? g : `Grupo ${g}`;
}

export function SolvenciaResumen() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["resumen-solvencia"],
    queryFn: () => certificadosApi.resumenSolvencia(EMPRESA_DEMO_ID),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="mb-6 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-6 py-5">
        <div className="space-y-3">
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
          <div className="h-8 w-32 animate-pulse rounded bg-muted" />
          <div className="h-2 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !data) return null;

  if (data.total_obras === 0) {
    return (
      <div className="mb-6 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-6 py-5">
        <p className="text-sm font-semibold text-foreground">
          Solvencia acreditada
        </p>
        <p className="mt-1 text-xs text-muted-foreground">últimos 5 años</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no hay certificados válidos con fecha de fin e importe registrados.
          Completa esos campos al revisar cada certificado para ver tu solvencia aquí.
        </p>
      </div>
    );
  }

  const maxImporte = Math.max(...data.por_grupo.map((g) => Number(g.importe_total)));
  const totalAcumulado = data.por_grupo.reduce((sum, g) => sum + Number(g.importe_total), 0);

  return (
    <div className="mb-6 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm overflow-hidden">
      {/* Cabecera principal */}
      <div className="px-6 pt-5 pb-4 flex flex-wrap items-start justify-between gap-6 border-b border-border/60">
        <div>
          <p className="text-[11px] font-medium text-muted-foreground">
            Solvencia acreditada · últimos 5 años
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-serif text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {eur.format(Number(data.anualidad_media))}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            anualidad media
          </p>
        </div>

        <div className="text-right">
          <span className="font-serif text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {data.total_obras}
          </span>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.total_obras === 1 ? "obra certificada" : "obras certificadas"}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {eur.format(totalAcumulado)} acumulado
          </p>
        </div>
      </div>

      {/* Desglose por grupo */}
      {data.por_grupo.length > 0 && (
        <div className="px-6 py-4">
          <p className="mb-3 text-[11px] font-medium text-muted-foreground">
            Desglose por grupo ROLECE
          </p>
          <div className="space-y-2.5">
            {data.por_grupo.map((g, idx) => {
              const pct = maxImporte > 0 ? (Number(g.importe_total) / maxImporte) * 100 : 0;
              return (
                <div key={g.grupo} className="flex items-center gap-3">
                  <span
                    className="w-28 flex-shrink-0 text-xs font-medium text-foreground truncate"
                    title={grupoLabel(g.grupo)}
                  >
                    {grupoLabel(g.grupo)}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
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
      )}
    </div>
  );
}
