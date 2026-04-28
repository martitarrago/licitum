"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import {
  ESTADO_LABELS,
  ESTADO_TONO,
  ESTADOS_ORDEN,
  type EstadoTono,
  type EstadoTracker,
  trackerApi,
} from "@/lib/api/tracker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

interface Props {
  expediente: string;
}

const TONO_CLASS: Record<EstadoTono, string> = {
  default: "bg-surface text-foreground ring-border",
  success: "bg-success/10 text-success ring-success/25",
  warning: "bg-warning/10 text-warning ring-warning/25",
  danger: "bg-danger/10 text-danger ring-danger/25",
  muted: "bg-muted text-muted-foreground ring-border",
};

export function EstadoSelector({ expediente }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: estado, isLoading } = useQuery({
    queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
    queryFn: () => trackerApi.getEstado(expediente, EMPRESA_DEMO_ID),
  });

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
    });
    qc.invalidateQueries({ queryKey: ["tracker-feed"] });
    qc.invalidateQueries({ queryKey: ["tracker-resumen"] });
  };

  const upsert = useMutation({
    mutationFn: (e: EstadoTracker) =>
      trackerApi.upsertEstado(expediente, {
        empresa_id: EMPRESA_DEMO_ID,
        estado: e,
      }),
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => trackerApi.borrarEstado(expediente, EMPRESA_DEMO_ID),
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });

  if (isLoading) {
    return (
      <button
        disabled
        className="inline-flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-sm text-muted-foreground ring-1 ring-border"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando…
      </button>
    );
  }

  if (!estado) {
    return (
      <button
        onClick={() => upsert.mutate("en_preparacion")}
        disabled={upsert.isPending}
        className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90 disabled:opacity-50"
      >
        {upsert.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" strokeWidth={2} />
        )}
        Añadir al seguimiento
      </button>
    );
  }

  const estadoActual = estado.estado as EstadoTracker;
  const tono = ESTADO_TONO[estadoActual] ?? "default";

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition-colors ${TONO_CLASS[tono]}`}
      >
        {ESTADO_LABELS[estadoActual] ?? estado.estado}
        <ChevronDown className="h-4 w-4" strokeWidth={2} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-lg bg-surface-raised py-1 shadow-lg ring-1 ring-border">
            {ESTADOS_ORDEN.map((e) => (
              <button
                key={e}
                onClick={() => upsert.mutate(e)}
                disabled={upsert.isPending}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/40 disabled:opacity-50 ${
                  e === estadoActual ? "bg-muted/30 font-medium" : ""
                }`}
              >
                <span>{ESTADO_LABELS[e]}</span>
                {e === estadoActual && (
                  <Check className="h-4 w-4 text-foreground" strokeWidth={2.5} />
                )}
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => remove.mutate()}
              disabled={remove.isPending}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            >
              <X className="h-4 w-4" strokeWidth={2} />
              Sacar del seguimiento
            </button>
          </div>
        </>
      )}
    </div>
  );
}
