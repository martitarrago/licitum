"use client";

import { ActiveFilterChip } from "@/components/ui/ActiveFilterChip";
import type { UseRadarFiltersReturn } from "@/lib/hooks/useRadarFilters";
import { describeFilters } from "./RadarFilterBar";

interface RadarActiveChipsProps {
  state: UseRadarFiltersReturn;
}

/**
 * Fila horizontal de chips representando los filtros activos.
 * Cada chip tiene una X que limpia el filtro relacionado.
 *
 * Caso especial "Toda Cataluña": cuando las 4 provincias están seleccionadas
 * se muestra UN solo chip; lo gestiona `describeFilters` en RadarFilterBar.
 */
export function RadarActiveChips({ state }: RadarActiveChipsProps) {
  const { filters, patchFilters, clearFilters, activeCount } = state;
  const items = describeFilters(filters);

  if (activeCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it) => (
        <ActiveFilterChip
          key={it.key}
          label={it.label}
          onRemove={() => {
            switch (it.onRemoveKey) {
              case "tier":
                patchFilters({ tier: "todas" });
                break;
              case "provincia":
                patchFilters({ provincia: [] });
                break;
              case "tipo_organismo":
                patchFilters({ tipo_organismo: [] });
                break;
              case "importe":
                patchFilters({ importe_min: null, importe_max: null });
                break;
              case "plazo":
                patchFilters({ plazo_min_dias: null, plazo_max_dias: null });
                break;
              case "cpv_prefix":
                patchFilters({ cpv_prefix: null });
                break;
              case "q":
                patchFilters({ q: "" });
                break;
              case "tipo_contrato":
                patchFilters({ tipo_contrato: null });
                break;
            }
          }}
        />
      ))}
      <button
        type="button"
        onClick={clearFilters}
        className="
          ml-1 text-xs font-medium text-muted-foreground underline
          underline-offset-2 hover:text-foreground transition-colors
        "
      >
        Limpiar todo
      </button>
    </div>
  );
}
