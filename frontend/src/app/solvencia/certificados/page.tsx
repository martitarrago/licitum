"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Plus } from "lucide-react";
import {
  certificadosApi,
  type CertificadoObraListItem,
  type EstadoCertificado,
} from "@/lib/api/certificados";
import { EMPRESA_DEMO_ID, GRUPOS_ROLECE } from "@/lib/constants";
import { CertificadoCard } from "@/components/solvencia/CertificadoCard";
import { UploadModal } from "@/components/solvencia/UploadModal";

// ─── Filtros ─────────────────────────────────────────────────────────────────

type FiltroEstado = EstadoCertificado | "todos";

const ESTADOS: { value: FiltroEstado; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "procesando", label: "Procesando" },
  { value: "pendiente_revision", label: "Pendiente" },
  { value: "validado", label: "Validado" },
  { value: "rechazado", label: "Rechazado" },
];

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="flex overflow-hidden rounded-xl bg-surface-raised ring-1 ring-border shadow-sm">
      <div className="w-2 flex-shrink-0 animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div className="space-y-1.5">
            <div className="h-2.5 w-14 animate-pulse rounded bg-muted" />
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-1.5">
            <div className="h-2.5 w-14 animate-pulse rounded bg-muted" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificadosPage() {
  const [estadoFiltro, setEstadoFiltro] = useState<FiltroEstado>("todos");
  const [grupoFiltro, setGrupoFiltro] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);

  const { data: certificados, isLoading, isError } = useQuery({
    queryKey: ["certificados", estadoFiltro, grupoFiltro],
    queryFn: () =>
      certificadosApi.list({
        empresa_id: EMPRESA_DEMO_ID,
        estado: estadoFiltro !== "todos" ? estadoFiltro : undefined,
        clasificacion_grupo: grupoFiltro || undefined,
      }),
    // Poll mientras algún cert está procesando o esperando extracción
    refetchInterval: (query) => {
      const data = query.state.data as CertificadoObraListItem[] | undefined;
      if (!data) return false;
      const active = data.some(
        (c) => c.estado === "procesando" ||
          (c.estado === "pendiente_revision" && !c.extraction_error),
      );
      return active ? 4_000 : false;
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Certificados de obra
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Expediente técnico digital de tu empresa
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="
            inline-flex items-center gap-2 rounded-lg
            bg-primary-500 px-4 py-2 text-sm font-medium text-white
            transition-colors hover:bg-primary-700
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500
          "
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Subir certificado
        </button>
      </div>

      {/* Explicación */}
      <div className="mb-8 rounded-xl bg-primary-50 px-5 py-4 ring-1 ring-primary-100 dark:bg-primary-900/10 dark:ring-primary-800/30">
        <p className="text-sm text-foreground">
          <span className="font-semibold">¿Qué son los certificados de obra?</span>{" "}
          Son los documentos que acreditan las obras que ha realizado tu empresa: actas de recepción,
          certificados finales de obra y documentos similares emitidos por el organismo contratante.
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Súbelos aquí en PDF — extraeremos los datos automáticamente y formarán tu expediente
          técnico, que el sistema usará para saber a qué licitaciones puedes presentarte.
        </p>
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Pills de estado */}
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filtrar por estado"
        >
          {ESTADOS.map((e) => (
            <button
              key={e.value}
              onClick={() => setEstadoFiltro(e.value)}
              className={`
                rounded-full px-3 py-1 text-xs font-semibold transition-colors
                ${
                  estadoFiltro === e.value
                    ? "bg-primary-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/20"
                }
              `}
            >
              {e.label}
            </button>
          ))}
        </div>

        {/* Select de grupo ROLECE */}
        <select
          value={grupoFiltro}
          onChange={(e) => setGrupoFiltro(e.target.value)}
          className="
            rounded-lg bg-surface ring-1 ring-border
            px-3 py-1 text-sm text-foreground
            focus:outline-none focus:ring-2 focus:ring-primary-500
            transition-shadow
          "
          aria-label="Filtrar por grupo ROLECE"
        >
          <option value="">Todos los grupos</option>
          {GRUPOS_ROLECE.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      {/* Estados de carga */}
      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <p className="text-sm text-danger">
            No se pudo cargar la lista de certificados.
          </p>
          <p className="text-xs text-muted-foreground">
            Comprueba que el backend está en marcha.
          </p>
        </div>
      )}

      {!isLoading && !isError && certificados && certificados.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {estadoFiltro !== "todos" || grupoFiltro
                ? "Sin resultados para estos filtros"
                : "Aún no hay certificados"}
            </p>
            <p className="text-xs text-muted-foreground">
              {estadoFiltro !== "todos" || grupoFiltro
                ? "Prueba a cambiar los filtros"
                : "Sube tu primer certificado de obra para empezar"}
            </p>
          </div>
          {estadoFiltro === "todos" && !grupoFiltro && (
            <button
              onClick={() => setModalOpen(true)}
              className="
                inline-flex items-center gap-2 rounded-lg
                bg-primary-500 px-4 py-2 text-sm font-medium text-white
                transition-colors hover:bg-primary-700
              "
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Subir certificado
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && certificados && certificados.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {certificados.map((cert) => (
            <CertificadoCard key={cert.id} cert={cert} />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && <UploadModal onClose={() => setModalOpen(false)} />}
    </main>
  );
}
