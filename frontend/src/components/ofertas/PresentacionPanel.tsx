"use client";

import { useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { sobreAApi, type SobreAPresentacion } from "@/lib/api/sobre_a";
import { useEmpresaId } from "@/lib/auth";

interface Props {
  expediente: string;
}

/**
 * Bloque de presentación final — al pie del workspace de ofertas.
 *
 * Todas las pestañas confluyen aquí: cuando el usuario tiene listo el
 * paquete (declaración + económica + memoria si aplica), sube el PDF
 * firmado al portal y luego sube aquí una copia para tener constancia.
 * La oferta pasa a estado `presentada`.
 */
export function PresentacionPanel({ expediente }: Props) {
  const empresaId = useEmpresaId();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presentado = useQuery({
    queryKey: ["sobre-a-presentado", empresaId, expediente],
    queryFn: () => sobreAApi.presentadoGet(expediente, empresaId),
  });

  const subir = useMutation({
    mutationFn: (file: File) =>
      sobreAApi.presentadoSubir(expediente, empresaId, file),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({
        queryKey: ["sobre-a-presentado", empresaId, expediente],
      });
      qc.invalidateQueries({
        queryKey: ["tracker-estado", expediente, empresaId],
      });
      qc.invalidateQueries({ queryKey: ["tracker-feed"] });
      qc.invalidateQueries({ queryKey: ["tracker-resumen"] });
      qc.invalidateQueries({ queryKey: ["ofertas-list", empresaId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const borrar = useMutation({
    mutationFn: () => sobreAApi.presentadoBorrar(expediente, empresaId),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["sobre-a-presentado", empresaId, expediente],
      });
      qc.invalidateQueries({
        queryKey: ["tracker-estado", expediente, empresaId],
      });
      qc.invalidateQueries({ queryKey: ["tracker-feed"] });
      qc.invalidateQueries({ queryKey: ["tracker-resumen"] });
      qc.invalidateQueries({ queryKey: ["ofertas-list", empresaId] });
    },
  });

  const validateAndUpload = (file: File) => {
    setError(null);
    if (file.type !== "application/pdf") {
      setError("Solo se admite PDF.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("El PDF excede el tamaño máximo (25 MB).");
      return;
    }
    subir.mutate(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    validateAndUpload(file);
  };

  if (presentado.isLoading) {
    return (
      <section className="card p-8">
        <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
      </section>
    );
  }

  const pres: SobreAPresentacion | null = presentado.data ?? null;

  if (pres) {
    return (
      <section className="card p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-success"
              strokeWidth={2}
              aria-hidden="true"
            />
            <div>
              <p className="eyebrow mb-1.5 text-success">Presentación</p>
              <h2 className="font-display text-xl font-bold tracking-tight">
                Oferta presentada
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Subiste{" "}
                <span className="font-mono text-foreground">
                  {pres.archivo_filename}
                </span>{" "}
                el {fmtFechaHora(pres.subido_at)}. La oferta está marcada como{" "}
                <span className="font-medium text-foreground">presentada</span>{" "}
                en el seguimiento.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={sobreAApi.presentadoPdfUrl(expediente, empresaId)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
            >
              <FileText className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Ver PDF
            </a>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={subir.isPending}
              className="btn-secondary"
            >
              {subir.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" strokeWidth={2} />
              )}
              Reemplazar
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "¿Quitar el PDF firmado? La oferta volverá al estado 'en preparación'.",
                  )
                ) {
                  borrar.mutate();
                }
              }}
              disabled={borrar.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:text-danger disabled:opacity-50"
            >
              {borrar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" strokeWidth={2} />
              )}
              Quitar
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) validateAndUpload(f);
          }}
        />
        {error && (
          <p className="mt-4 flex items-start gap-2 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{error}</span>
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="card p-8">
      <p className="eyebrow mb-1.5">Presentación</p>
      <h2 className="font-display text-xl font-bold tracking-tight">
        Subir la oferta firmada
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Cuando hayas subido la oferta al portal de contratación, sube aquí el
        PDF firmado para tener constancia y mover la oferta al estado{" "}
        <span className="font-medium text-foreground">presentada</span>.
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={[
          "mt-6 flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-foreground bg-foreground/[0.04]"
            : "border-border hover:border-foreground/40 hover:bg-muted/40",
        ].join(" ")}
        role="button"
        aria-label="Subir PDF firmado de la oferta"
      >
        {subir.isPending ? (
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        ) : (
          <Upload
            className="h-7 w-7 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            {subir.isPending
              ? "Subiendo…"
              : "Arrastra el PDF aquí o haz click para elegir"}
          </p>
          <p className="text-xs text-muted-foreground">
            Solo PDF · máx. 25 MB · sustituye al anterior si ya había uno
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) validateAndUpload(f);
        }}
      />

      {error && (
        <p className="mt-4 flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </p>
      )}
    </section>
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
