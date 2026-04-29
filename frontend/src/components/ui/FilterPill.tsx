"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { forwardRef } from "react";

interface FilterPillProps {
  label: string;
  /** Resumen del valor seleccionado, si lo hay. */
  value?: string | null;
  /** Cuántos elementos múltiples están activos (badge numérico). */
  count?: number;
  active: boolean;
  open: boolean;
  onClick: () => void;
  /** Icono opcional a la izquierda del label (p.ej. flecha asc/desc del orden). */
  icon?: LucideIcon;
}

/**
 * Pill de filtro para la barra horizontal del Radar.
 *
 * Estados visuales:
 *  - inactivo: ring border discreto, label en muted-foreground
 *  - activo (con valor): bg-foreground sólido + texto invertido
 *  - abierto (popover desplegado): mismo estilo que activo + chevron rotado
 */
export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
  function FilterPill({ label, value, count, active, open, onClick, icon: Icon }, ref) {
    const filled = active || open;
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className={[
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
          "text-xs font-semibold ring-1 transition-colors select-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground",
          filled
            ? "bg-foreground text-surface ring-foreground"
            : "bg-transparent text-muted-foreground ring-border hover:text-foreground hover:ring-foreground/30",
        ].join(" ")}
      >
        {Icon && (
          <Icon
            className={`h-3.5 w-3.5 flex-shrink-0 ${filled ? "text-surface" : "text-foreground"}`}
            strokeWidth={2.5}
            aria-hidden="true"
          />
        )}
        <span className={filled ? "text-surface" : "text-foreground"}>{label}</span>
        {value && (
          <span
            className={[
              "max-w-[14ch] truncate text-[11px] font-medium",
              filled ? "text-surface/75" : "text-muted-foreground",
            ].join(" ")}
          >
            · {value}
          </span>
        )}
        {count != null && count > 0 && !value && (
          <span
            className={[
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums",
              filled ? "bg-surface text-foreground" : "bg-foreground text-surface",
            ].join(" ")}
          >
            {count}
          </span>
        )}
        <ChevronDown
          className={[
            "h-3.5 w-3.5 flex-shrink-0 transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      </button>
    );
  },
);
