"use client";

// Sección colapsable al final del Radar: licitaciones descartadas por
// hard filters (presupuesto fuera de rango, no_interesa, capacidad, docs).
// Agrupadas por la razón principal del descarte para auditoría rápida.

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { intelApi, type FeedItem } from "@/lib/api/intel";

interface Props {
  empresaId: string;
}

function clasificarRazon(reason: string | null): string {
  if (!reason) return "Sin razón";
  const r = reason.toLowerCase();
  if (r.includes("presupuesto")) return "Fuera de tu rango de presupuesto";
  if (r.includes("clasificación") || r.includes("clasificacion")) return "No cumples clasificación ROLECE/RELIC";
  if (r.includes("solvencia")) return "Solvencia económica/técnica insuficiente";
  if (r.includes("capacidad") || r.includes("paralelo")) return "Capacidad simultánea agotada";
  if (r.includes("documento")) return "Documentación caducada con cierre próximo";
  if (r.includes("no me interesa") || r.includes("no_interesa")) return "Declaraste el CPV como 'no me interesa'";
  if (r.includes("no acepto")) return "Tu estado actual es 'no acepto obras nuevas'";
  return "Otros motivos";
}

const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function DescartadasSection({ empresaId }: Props) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["intel", "descartadas", empresaId],
    queryFn: () =>
      intelApi.feed({
        empresa_id: empresaId,
        solo_descartadas: true,
        min_score: 0,
        limit: 100,
        offset: 0,
      }),
    staleTime: 60_000,
    enabled: open, // No carga hasta que el usuario expande
  });

  // Conteo agnóstico al open — siempre lo pedimos por separado
  const { data: conteo } = useQuery({
    queryKey: ["intel", "descartadas-count", empresaId],
    queryFn: () =>
      intelApi.feed({
        empresa_id: empresaId,
        solo_descartadas: true,
        min_score: 0,
        limit: 1,
        offset: 0,
      }),
    staleTime: 60_000,
    select: (d) => d.total,
  });

  const grupos = useMemo(() => {
    const all = data?.items.filter((i) => i.descartada) ?? [];
    const map = new Map<string, FeedItem[]>();
    for (const it of all) {
      const k = clasificarRazon(it.reason_descarte);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [data]);

  // Solo mostrar si hay descartadas
  if (!conteo || conteo === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        )}
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Descartadas ({conteo})
        </h3>
        <span className="text-xs text-muted-foreground/70">
          — el motor las filtró por tus hard filters de M2
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay descartadas.</p>
          ) : (
            grupos.map(([razon, items]) => (
              <details
                key={razon}
                className="rounded-xl bg-surface-raised ring-1 ring-border"
              >
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-foreground">
                  {razon} <span className="text-muted-foreground/70">({items.length})</span>
                </summary>
                <ul className="divide-y divide-border border-t border-border">
                  {items.slice(0, 10).map((it) => (
                    <li
                      key={it.licitacion_id}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground">
                          {it.titulo ?? it.expediente}
                        </p>
                        <p className="truncate text-muted-foreground/70">
                          {it.organismo ?? "—"}
                        </p>
                      </div>
                      <span className="tabular-nums text-muted-foreground">
                        {it.importe_licitacion
                          ? importeFormatter.format(it.importe_licitacion)
                          : "—"}
                      </span>
                    </li>
                  ))}
                  {items.length > 10 && (
                    <li className="px-4 py-2 text-xs text-muted-foreground/70">
                      … y {items.length - 10} más
                    </li>
                  )}
                </ul>
              </details>
            ))
          )}
        </div>
      )}
    </section>
  );
}
