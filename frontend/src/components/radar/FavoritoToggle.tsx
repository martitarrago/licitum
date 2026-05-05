"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2 } from "lucide-react";
import { favoritosApi } from "@/lib/api/favoritos";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

type Variant = "card" | "detail";

interface Props {
  expediente: string;
  /** Estado servidor (de la query padre). El componente hace optimistic update. */
  favorito: boolean;
  variant?: Variant;
}

/**
 * Toggle de favorito con corazón. Reemplaza el antiguo botón
 * "Añadir al seguimiento" del Radar — favorito ≠ pipeline.
 *
 * - Gris transparente cuando NO es favorito
 * - Rojo flojito (relleno) cuando SÍ es favorito
 *
 * Optimistic update local + invalidación de las queries del Radar para
 * que el filtro "favoritos" y el badge del card listing se actualicen
 * sin esperar al refetch.
 */
export function FavoritoToggle({ expediente, favorito, variant = "card" }: Props) {
  const qc = useQueryClient();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const isOn = optimistic ?? favorito;

  const toggle = useMutation({
    mutationFn: async (nextOn: boolean) => {
      if (nextOn) {
        await favoritosApi.marcar(expediente, EMPRESA_DEMO_ID);
      } else {
        await favoritosApi.quitar(expediente, EMPRESA_DEMO_ID);
      }
      return nextOn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licitaciones"] });
      qc.invalidateQueries({ queryKey: ["licitacion", expediente] });
      setOptimistic(null);
    },
    onError: () => {
      setOptimistic(null);
    },
  });

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (toggle.isPending) return;
    const next = !isOn;
    setOptimistic(next);
    toggle.mutate(next);
  };

  const label = isOn ? "Quitar de favoritos" : "Añadir a favoritos";

  // En la card: icono limpio h-5 (mismo alto que score y badge) sin
  // background — para alineación visual perfecta con el resto de la columna.
  // En el detalle: pill circular más grande, acción claramente clicable.
  const isDetail = variant === "detail";
  const sizeClass = isDetail
    ? "h-10 w-10 rounded-full"
    : "h-5 w-5 rounded-full";
  const iconSize = isDetail ? "h-5 w-5" : "h-4 w-4";
  const bgClass = isDetail
    ? isOn
      ? "bg-red-50 hover:bg-red-100 dark:bg-red-500/10"
      : "bg-transparent hover:bg-muted ring-1 ring-border"
    : "bg-transparent";
  const colorClass = isOn
    ? "text-red-400 dark:text-red-400/90"
    : "text-muted-foreground/60 hover:text-muted-foreground";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={toggle.isPending}
      aria-pressed={isOn}
      aria-label={label}
      title={label}
      className={[
        sizeClass,
        bgClass,
        colorClass,
        "inline-flex items-center justify-center transition-colors disabled:opacity-60",
      ].join(" ")}
    >
      {toggle.isPending ? (
        <Loader2 className={`${iconSize} animate-spin`} aria-hidden="true" />
      ) : (
        <Heart
          className={iconSize}
          strokeWidth={isOn ? 0 : 1.75}
          fill={isOn ? "currentColor" : "none"}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
