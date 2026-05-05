"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileSignature, Loader2 } from "lucide-react";
import { trackerApi } from "@/lib/api/tracker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

interface Props {
  expediente: string;
  /** Si true, muestra el botón en estilo primario más prominente. */
  primario?: boolean;
}

/**
 * CTA "Preparar Sobre A" del análisis del pliego.
 *
 * El click hace dos cosas:
 *   1. Marca la licitación como `en_preparacion` en el pipeline (M7) si
 *      todavía no estaba en seguimiento. Si ya tenía estado se respeta.
 *   2. Navega al workspace de Sobre A de esa licitación.
 *
 * Es la entrada explícita al pipeline desde el análisis del pliego —
 * sustituye al antiguo "Añadir al seguimiento" del Radar.
 */
export function PrepararSobreABoton({
  expediente,
  primario = true,
}: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  const estado = useQuery({
    queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
    queryFn: () => trackerApi.getEstado(expediente, EMPRESA_DEMO_ID),
  });

  const enPipeline = !!estado.data;

  const preparar = useMutation({
    mutationFn: async () => {
      // Solo escribimos estado si la licitación NO está ya en pipeline.
      // Si está, conservamos el estado actual (puede ser presentada,
      // ganada, etc.) — no queremos pisarlo con en_preparacion.
      if (!enPipeline) {
        await trackerApi.upsertEstado(expediente, {
          empresa_id: EMPRESA_DEMO_ID,
          estado: "en_preparacion",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
      });
      qc.invalidateQueries({ queryKey: ["tracker-feed"] });
      qc.invalidateQueries({ queryKey: ["tracker-resumen"] });
      router.push(`/sobre-a/licitacion/${encodeURIComponent(expediente)}`);
    },
  });

  const cls = primario
    ? "inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-surface transition-opacity hover:opacity-85 disabled:opacity-50"
    : "inline-flex items-center gap-2 rounded-lg bg-surface px-5 py-2.5 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-muted disabled:opacity-50";

  return (
    <button
      onClick={() => preparar.mutate()}
      disabled={preparar.isPending || estado.isLoading}
      className={cls}
      title={
        enPipeline
          ? "Continuar la preparación del Sobre A"
          : "Mover a pipeline y empezar a preparar el Sobre A"
      }
    >
      {preparar.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <FileSignature className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      )}
      {enPipeline ? "Continuar Sobre A" : "Preparar Sobre A"}
      <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
