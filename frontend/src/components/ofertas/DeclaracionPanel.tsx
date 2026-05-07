"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import { sobreAApi, type SobreAListItem } from "@/lib/api/sobre_a";
import { useEmpresaId } from "@/lib/auth";

interface Props {
  expediente: string;
  haPresentado: boolean;
}

/**
 * Panel "Declaración responsable" del workspace de ofertas.
 *
 * Encapsula el flujo completo: generar borrador con datos actuales,
 * preview en iframe, descargar .docx editable, regenerar (con
 * confirmación si ya hay PDF firmado), histórico de versiones.
 */
export function DeclaracionPanel({ expediente, haPresentado }: Props) {
  const empresaId = useEmpresaId();
  const qc = useQueryClient();

  const snapshots = useQuery({
    queryKey: ["sobre-a-snapshots", empresaId, expediente],
    queryFn: () => sobreAApi.list(empresaId, expediente),
  });

  const items = snapshots.data ?? [];
  const ultimo = items[0];

  const generar = useMutation({
    mutationFn: () => sobreAApi.generar(expediente, empresaId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["sobre-a-snapshots", empresaId, expediente],
      });
      qc.invalidateQueries({ queryKey: ["ofertas-list", empresaId] });
    },
  });

  const onGenerar = () => {
    if (haPresentado && ultimo) {
      const ok = confirm(
        "Ya subiste el PDF firmado de esta licitación. Si regeneras el " +
          "borrador, el nuevo no coincidirá con lo que firmaste. ¿Continuar?",
      );
      if (!ok) return;
    }
    generar.mutate();
  };

  return (
    <div className="space-y-8">
      {/* Cómo funciona */}
      <section className="rounded-2xl bg-info/5 p-5 ring-1 ring-info/15">
        <div className="flex items-start gap-3">
          <Sparkles
            className="mt-0.5 h-4 w-4 shrink-0 text-info"
            strokeWidth={2}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">
              La declaración responsable en 3 pasos
            </p>
            <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li>
                <span className="font-mono text-foreground">1.</span> Genera el
                borrador con tus datos actuales (vista previa abajo).
              </li>
              <li>
                <span className="font-mono text-foreground">2.</span> Descárgalo
                en <span className="font-medium text-foreground">.docx</span>,
                edítalo y fírmalo en tu PC.
              </li>
              <li>
                <span className="font-mono text-foreground">3.</span> Sube el
                PDF firmado en el bloque de presentación al final.
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Borrador + acciones */}
      <section className="card p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-1.5">Borrador</p>
            <h2 className="font-display text-xl font-bold tracking-tight">
              {ultimo
                ? `Última versión · ${fmtFechaHora(ultimo.created_at)}`
                : "Aún no has generado el borrador"}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {ultimo
                ? "Cada vez que pulses regenerar se crea una versión nueva con tus datos al momento. Las anteriores se mantienen en el histórico."
                : "El primer borrador se genera con los datos actuales de tu empresa (RELIC, certificados, representante)."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ultimo && (
              <a
                href={sobreAApi.docxUrl(ultimo.id)}
                className="btn-secondary"
                download
              >
                <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Descargar .docx
              </a>
            )}
            <button
              onClick={onGenerar}
              disabled={generar.isPending}
              className={ultimo ? "btn-secondary" : "btn-primary"}
            >
              {generar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : ultimo ? (
                <RefreshCcw className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              )}
              {ultimo ? "Regenerar" : "Generar borrador"}
            </button>
          </div>
        </div>

        {snapshots.isLoading ? (
          <div className="mt-6 h-96 animate-pulse rounded-xl bg-muted/30" />
        ) : ultimo ? (
          <BorradorPreview snapshotId={ultimo.id} />
        ) : null}

        {items.length > 1 && (
          <details className="mt-6 group">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Histórico de versiones ({items.length})
            </summary>
            <ul className="mt-3 divide-y divide-border">
              {items.map((it, i) => (
                <SnapshotRow key={it.id} item={it} activo={i === 0} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

function BorradorPreview({ snapshotId }: { snapshotId: string }) {
  const detalle = useQuery({
    queryKey: ["sobre-a-detail", snapshotId],
    queryFn: () => sobreAApi.get(snapshotId),
    staleTime: 5 * 60 * 1000,
  });

  if (detalle.isLoading) {
    return <div className="mt-6 h-96 animate-pulse rounded-xl bg-muted/30" />;
  }
  if (!detalle.data) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-xl ring-1 ring-border">
      <iframe
        srcDoc={detalle.data.html}
        title="Vista previa de la declaración"
        className="h-[600px] w-full bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}

function SnapshotRow({
  item,
  activo,
}: {
  item: SobreAListItem;
  activo: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="text-sm">
        <span className="font-medium text-foreground">
          {fmtFechaHora(item.created_at)}
        </span>
        {activo && (
          <span className="ml-2 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
            Activo
          </span>
        )}
        {item.usa_relic && (
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            RELIC
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <Link
          href={`/sobre-a/${item.id}`}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ver
        </Link>
        <a
          href={sobreAApi.docxUrl(item.id)}
          download
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          .docx
        </a>
      </div>
    </li>
  );
}

function fmtFechaHora(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
