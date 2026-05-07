"use client";

import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { certificadosApi } from "@/lib/api/certificados";
import { useEmpresaId } from "@/lib/auth";

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

function TileSkeleton() {
  return (
    <div className="flex-1 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-5 py-4">
      <div className="space-y-3">
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-2 w-24 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function SolvenciaResumen() {
  const empresaId = useEmpresaId();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["resumen-solvencia", empresaId],
    queryFn: () => certificadosApi.resumenSolvencia(empresaId),
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </div>
    );
  }

  if (isError || !data) return null;

  if (data.total_obras === 0) {
    return (
      <div className="mb-6 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-5 py-4">
        <p className="text-[11px] font-medium text-muted-foreground">
          Solvencia acreditada · últimos 5 años
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Aún no hay certificados válidos con fecha de fin e importe registrados.
          Completa esos campos al revisar cada certificado para ver tu solvencia aquí.
        </p>
      </div>
    );
  }

  const maxImporte = Math.max(...data.por_grupo.map((g) => Number(g.importe_total)));
  const totalAcumulado = data.por_grupo.reduce((sum, g) => sum + Number(g.importe_total), 0);

  return (
    <div className="mb-6 space-y-3">
      {/* KPI tiles */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-5 py-4">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Anualidad media de obra
            </p>
            <span
              title="Importe medio anual de OBRA EJECUTADA según tus certificados de los últimos 5 años (LCSP art. 88, solvencia técnica). No confundir con el volumen de negocio anual de tus cuentas — eso es solvencia económica (art. 87) y se declara en Identidad."
              className="text-muted-foreground/70 hover:text-muted-foreground cursor-help"
            >
              <Info className="h-3 w-3" />
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {eur.format(Number(data.anualidad_media))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            obra ejecutada · últimos 5 años
          </p>
        </div>

        <div className="flex-1 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-5 py-4">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Año pico de obra
            </p>
            <span
              title="Importe de OBRA EJECUTADA en tu mejor año del quinquenio (LCSP art. 88.1.a). Muchos pliegos usan esta cifra en lugar de la media."
              className="text-muted-foreground/70 hover:text-muted-foreground cursor-help"
            >
              <Info className="h-3 w-3" />
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
            {eur.format(Number(data.anualidad_pico))}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data.anio_pico ?? "—"}
          </p>
        </div>

        <div className="flex-1 rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-5 py-4">
          <p className="text-[11px] font-medium text-muted-foreground">
            Obras certificadas
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {data.total_obras}
            </span>
            <span className="text-xs text-muted-foreground">
              {data.total_obras === 1 ? "obra" : "obras"}
            </span>
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {eur.format(totalAcumulado)} acumulado
          </p>
        </div>
      </div>

      {/* Desglose por grupo */}
      {data.por_grupo.length > 0 && (
        <div className="rounded-2xl bg-surface-raised ring-1 ring-border shadow-sm px-5 py-4">
          <p className="mb-3 text-[11px] font-medium text-muted-foreground">
            Obra ejecutada por grupo
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
