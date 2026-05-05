"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent } from "react";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { licitacionesApi } from "@/lib/api/licitaciones";
import {
  sobreAApi,
  type SobreAListItem,
  type SobreAPresentacion,
} from "@/lib/api/sobre_a";
import { trackerApi, ESTADO_LABELS } from "@/lib/api/tracker";
import { pliegosApi } from "@/lib/api/pliegos";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

const fmtFecha = (v: string | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const fmtFechaHora = (v: string): string => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function diasHasta(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const hoyUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fechaUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.ceil((fechaUtc - hoyUtc) / (1000 * 60 * 60 * 24));
}

export default function SobreAWorkspacePage({
  params,
}: {
  params: { expediente: string };
}) {
  const expediente = decodeURIComponent(params.expediente);

  const licitacion = useQuery({
    queryKey: ["licitacion", expediente, EMPRESA_DEMO_ID],
    queryFn: () => licitacionesApi.get(expediente, EMPRESA_DEMO_ID),
    staleTime: 5 * 60 * 1000,
  });

  const estado = useQuery({
    queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
    queryFn: () => trackerApi.getEstado(expediente, EMPRESA_DEMO_ID),
  });

  const snapshots = useQuery({
    queryKey: ["sobre-a-snapshots", EMPRESA_DEMO_ID, expediente],
    queryFn: () => sobreAApi.list(EMPRESA_DEMO_ID, expediente),
  });

  const presentado = useQuery({
    queryKey: ["sobre-a-presentado", EMPRESA_DEMO_ID, expediente],
    queryFn: () => sobreAApi.presentadoGet(expediente, EMPRESA_DEMO_ID),
  });

  // Lista pasiva de docs extra del pliego (M3) — sin checklist con estado.
  const pliego = useQuery({
    queryKey: ["pliego", expediente],
    queryFn: () => pliegosApi.get(expediente),
  });

  if (licitacion.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (licitacion.isError || !licitacion.data) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <XCircle className="h-10 w-10 text-danger" aria-hidden="true" />
          <p className="text-sm font-semibold text-danger">
            No se pudo cargar la licitación
          </p>
          <Link href="/sobre-a" className="text-sm text-muted-foreground underline">
            Volver al histórico
          </Link>
        </div>
      </main>
    );
  }

  const l = licitacion.data;
  const dias = diasHasta(l.fecha_limite);
  const cerrada = dias != null && dias < 0;
  const urgente = dias != null && dias >= 0 && dias <= 7;
  const items = snapshots.data ?? [];
  const docsExtra = pliego.data?.extracted_data?.docs_extra_sobre_a ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      <Link
        href={`/pliegos/${encodeURIComponent(expediente)}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al análisis del pliego
      </Link>

      {/* ── 1. Header ───────────────────────────────────────────────── */}
      <header className="mb-8">
        <p className="eyebrow mb-2">Sobre A · espacio de trabajo</p>
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          {l.titulo ?? "Sin título"}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          {l.organismo && <span>{l.organismo}</span>}
          <span className="font-mono text-xs">{l.expediente}</span>
          {l.fecha_limite && (
            <span>
              Límite {fmtFecha(l.fecha_limite)}
              {dias != null && !cerrada && (
                <span
                  className={
                    urgente ? " font-semibold text-danger" : " text-muted-foreground"
                  }
                >
                  {" "}· en {dias} d
                </span>
              )}
              {cerrada && (
                <span className="text-muted-foreground"> · cerrada</span>
              )}
            </span>
          )}
          {estado.data && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-foreground ring-1 ring-inset ring-foreground/10">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
              {ESTADO_LABELS[
                estado.data.estado as keyof typeof ESTADO_LABELS
              ] ?? estado.data.estado}
            </span>
          )}
        </div>
      </header>

      {/* ── 2. Cómo funciona (intro pequeña) ─────────────────────────── */}
      <ComoFunciona />

      {/* ── 3. Borrador ──────────────────────────────────────────────── */}
      <BorradorSection
        expediente={expediente}
        items={items}
        loading={snapshots.isLoading}
        haPresentado={!!presentado.data}
      />

      {/* ── 4. Presentación (PDF firmado) ────────────────────────────── */}
      <PresentacionSection
        expediente={expediente}
        presentacion={presentado.data ?? null}
        loading={presentado.isLoading}
        ningunBorrador={items.length === 0}
      />

      {/* ── 5. Documentos extra del pliego (informativo) ─────────────── */}
      {docsExtra.length > 0 && <DocsExtraSection docs={docsExtra} />}
    </main>
  );
}

// ─── Bloques ─────────────────────────────────────────────────────────────────

function ComoFunciona() {
  return (
    <section className="mb-8 rounded-2xl bg-info/5 p-5 ring-1 ring-info/15">
      <div className="flex items-start gap-3">
        <Sparkles
          className="mt-0.5 h-4 w-4 shrink-0 text-info"
          strokeWidth={2}
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-foreground">
            El Sobre A en 3 pasos
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
              <span className="font-mono text-foreground">3.</span> Sube el PDF
              firmado para tener constancia y mover la oferta a{" "}
              <span className="font-medium text-foreground">presentada</span>.
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}

function BorradorSection({
  expediente,
  items,
  loading,
  haPresentado,
}: {
  expediente: string;
  items: SobreAListItem[];
  loading: boolean;
  haPresentado: boolean;
}) {
  const qc = useQueryClient();
  const ultimo = items[0]; // list viene order_by created_at DESC

  const generar = useMutation({
    mutationFn: () => sobreAApi.generar(expediente, EMPRESA_DEMO_ID),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["sobre-a-snapshots", EMPRESA_DEMO_ID, expediente],
      });
    },
  });

  const onGenerar = () => {
    if (haPresentado && ultimo) {
      // Opción B del plan: avisar antes de regenerar si ya hay PDF firmado.
      const ok = confirm(
        "Ya subiste el PDF firmado de esta licitación. Si regeneras el " +
          "borrador, el nuevo no coincidirá con lo que firmaste. ¿Continuar?",
      );
      if (!ok) return;
    }
    generar.mutate();
  };

  return (
    <section className="card mb-8 p-8">
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
              ? "Cada vez que pulses regenerar se crea una versión nueva con un snapshot completo de los datos de tu empresa al momento."
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

      {/* Preview */}
      {loading ? (
        <div className="mt-6 h-96 animate-pulse rounded-xl bg-muted/30" />
      ) : ultimo ? (
        <BorradorPreview snapshotId={ultimo.id} />
      ) : null}

      {/* Histórico de versiones (cuando hay >1) */}
      {items.length > 1 && (
        <details className="mt-6 group">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Histórico de versiones ({items.length})
          </summary>
          <ul className="mt-3 divide-y divide-border">
            {items.map((it, i) => (
              <li
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="text-sm">
                  <span className="font-medium text-foreground">
                    {fmtFechaHora(it.created_at)}
                  </span>
                  {i === 0 && (
                    <span className="ml-2 rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      Activo
                    </span>
                  )}
                  {it.usa_relic && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      RELIC
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/sobre-a/${it.id}`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Ver
                  </Link>
                  <a
                    href={sobreAApi.docxUrl(it.id)}
                    download
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    .docx
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function BorradorPreview({ snapshotId }: { snapshotId: string }) {
  const detalle = useQuery({
    queryKey: ["sobre-a-detail", snapshotId],
    queryFn: () => sobreAApi.get(snapshotId),
    staleTime: 5 * 60 * 1000,
  });

  if (detalle.isLoading) {
    return (
      <div className="mt-6 h-96 animate-pulse rounded-xl bg-muted/30" />
    );
  }
  if (!detalle.data) return null;

  return (
    <div className="mt-6 overflow-hidden rounded-xl ring-1 ring-border">
      <iframe
        srcDoc={detalle.data.html}
        title="Vista previa del Sobre A"
        className="h-[600px] w-full bg-white"
        sandbox="allow-same-origin"
      />
    </div>
  );
}

function PresentacionSection({
  expediente,
  presentacion,
  loading,
  ningunBorrador,
}: {
  expediente: string;
  presentacion: SobreAPresentacion | null;
  loading: boolean;
  ningunBorrador: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subir = useMutation({
    mutationFn: (file: File) =>
      sobreAApi.presentadoSubir(expediente, EMPRESA_DEMO_ID, file),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({
        queryKey: ["sobre-a-presentado", EMPRESA_DEMO_ID, expediente],
      });
      qc.invalidateQueries({
        queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
      });
      qc.invalidateQueries({ queryKey: ["tracker-feed"] });
      qc.invalidateQueries({ queryKey: ["tracker-resumen"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const borrar = useMutation({
    mutationFn: () =>
      sobreAApi.presentadoBorrar(expediente, EMPRESA_DEMO_ID),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["sobre-a-presentado", EMPRESA_DEMO_ID, expediente],
      });
      qc.invalidateQueries({
        queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
      });
      qc.invalidateQueries({ queryKey: ["tracker-feed"] });
      qc.invalidateQueries({ queryKey: ["tracker-resumen"] });
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

  if (loading) {
    return (
      <section className="card mb-8 p-8">
        <div className="h-32 animate-pulse rounded-lg bg-muted/30" />
      </section>
    );
  }

  // Si ya hay PDF firmado subido → vista de "presentado"
  if (presentacion) {
    return (
      <section className="card mb-8 p-8">
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
                Sobre A presentado
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Subiste{" "}
                <span className="font-mono text-foreground">
                  {presentacion.archivo_filename}
                </span>{" "}
                el {fmtFechaHora(presentacion.subido_at)}. La oferta está
                marcada como{" "}
                <span className="font-medium text-foreground">presentada</span>{" "}
                en el pipeline.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={sobreAApi.presentadoPdfUrl(expediente, EMPRESA_DEMO_ID)}
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
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
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

  // Sin PDF subido → drop area
  return (
    <section className="card mb-8 p-8">
      <p className="eyebrow mb-1.5">Presentación</p>
      <h2 className="font-display text-xl font-bold tracking-tight">
        Subir el Sobre A firmado
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Cuando hayas subido el Sobre A al portal de contratación, sube aquí el
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
          ningunBorrador && "opacity-60",
        ]
          .filter(Boolean)
          .join(" ")}
        role="button"
        aria-label="Subir PDF firmado del Sobre A"
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

      {ningunBorrador && !subir.isPending && (
        <p className="mt-4 text-xs text-muted-foreground">
          Genera el borrador antes — así tendrás constancia del .docx que
          editaste para llegar a este PDF firmado.
        </p>
      )}
    </section>
  );
}

function DocsExtraSection({ docs }: { docs: string[] }) {
  return (
    <section className="card p-8">
      <p className="eyebrow mb-1.5">Documentos extra del pliego</p>
      <h2 className="font-display text-xl font-bold tracking-tight">
        Recuerda preparar también
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        El análisis IA del PCAP detectó documentación complementaria que el
        pliego exige aportar en el Sobre A. No se genera automáticamente —
        revísala una a una.
      </p>
      <ul className="mt-5 space-y-2 text-sm">
        {docs.map((d, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60"
              aria-hidden="true"
            />
            <span className="leading-relaxed">{d}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
