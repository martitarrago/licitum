"use client";

import { X } from "lucide-react";

interface ActiveFilterChipProps {
  label: string;
  onRemove: () => void;
}

/**
 * Chip que representa un filtro activo arriba de la lista. Click en la X
 * llama a `onRemove` (típicamente `clearFilter('xxx')` del hook).
 */
export function ActiveFilterChip({ label, onRemove }: ActiveFilterChipProps) {
  return (
    <span
      className="
        inline-flex items-center gap-1.5 rounded-full
        bg-muted px-2.5 py-1 text-xs font-medium text-foreground
        ring-1 ring-border
      "
    >
      <span className="max-w-[28ch] truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar filtro ${label}`}
        className="
          -mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full
          text-muted-foreground transition-colors
          hover:bg-foreground hover:text-surface focus:outline-none
          focus-visible:bg-foreground focus-visible:text-surface
        "
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}
