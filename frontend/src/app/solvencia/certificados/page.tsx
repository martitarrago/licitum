"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, FileText, Plus } from "lucide-react";
import {
  certificadosApi,
  type CertificadoObraListItem,
} from "@/lib/api/certificados";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import { CertificadoCard } from "@/components/solvencia/CertificadoCard";
import { SolvenciaResumen } from "@/components/solvencia/SolvenciaResumen";
import { UploadModal } from "@/components/solvencia/UploadModal";

// ─── Tipos de filtro ──────────────────────────────────────────────────────────

type Filtro = "todos" | "validos" | "rechazados" | "caducados" | "por_caducar";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "validos", label: "Válidos" },
  { value: "rechazados", label: "Rechazados" },
  { value: "caducados", label: "Caducados" },
  { value: "por_caducar", label: "Por caducar" },
];

type Orden = "recientes" | "fecha_obra" | "grupo" | "importe";

const ORDENES: { value: Orden; label: string }[] = [
  { value: "recientes", label: "Recientes" },
  { value: "fecha_obra", label: "Fecha de obra" },
  { value: "grupo", label: "Grupo ROLECE" },
  { value: "importe", label: "Importe" },
];

// Período de referencia LCSP art. 88: los últimos 5 años
const CINCO_ANIOS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
const SEIS_MESES_MS = 0.5 * 365.25 * 24 * 60 * 60 * 1000;

function esCaducado(cert: CertificadoObraListItem): boolean {
  if (cert.estado !== "validado") return false;
  if (!cert.fecha_fin) return false;
  return Date.now() - new Date(cert.fecha_fin).getTime() > CINCO_ANIOS_MS;
}

function esPorCaducar(cert: CertificadoObraListItem): boolean {
  if (cert.estado !== "validado" || !cert.fecha_fin) return false;
  const antigüedad = Date.now() - new Date(cert.fecha_fin).getTime();
  return antigüedad > CINCO_ANIOS_MS - SEIS_MESES_MS && antigüedad <= CINCO_ANIOS_MS;
}

function detectarDuplicados(certs: CertificadoObraListItem[]): Set<string> {
  const duplicados = new Set<string>();
  for (let i = 0; i < certs.length; i++) {
    for (let j = i + 1; j < certs.length; j++) {
      const a = certs[i], b = certs[j];
      if (!a.organismo || !b.organismo) continue;
      if (a.organismo.trim().toLowerCase() !== b.organismo.trim().toLowerCase()) continue;
      if (!a.fecha_fin || !b.fecha_fin) continue;
      const diffDias = Math.abs(new Date(a.fecha_fin).getTime() - new Date(b.fecha_fin).getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > 30) continue;
      const ia = Number(a.importe_adjudicacion) || 0;
      const ib = Number(b.importe_adjudicacion) || 0;
      if (ia > 0 && ib > 0) {
        const ratio = Math.abs(ia - ib) / Math.max(ia, ib);
        if (ratio > 0.15) continue;
      }
      duplicados.add(a.id);
      duplicados.add(b.id);
    }
  }
  return duplicados;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function RowSkeleton() {
  return (
    <div className="flex overflow-hidden rounded-xl bg-surface-raised ring-1 ring-border shadow-sm">
      <div className="w-1.5 flex-shrink-0 animate-pulse bg-muted" />
      <div className="flex flex-1 items-center gap-4 px-4 py-3">
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
        </div>
        <div className="hidden sm:block h-3 w-28 animate-pulse rounded bg-muted" />
        <div className="hidden md:block h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificadosPage() {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [orden, setOrden] = useState<Orden>("recientes");
  const [modalOpen, setModalOpen] = useState(false);

  const { data: certificados, isLoading, isError } = useQuery({
    queryKey: ["certificados"],
    queryFn: () =>
      certificadosApi.list({ empresa_id: EMPRESA_DEMO_ID }),
    refetchInterval: (query) => {
      const data = query.state.data as CertificadoObraListItem[] | undefined;
      if (!data) return false;
      const active = data.some(
        (c) =>
          c.estado === "procesando" ||
          (c.estado === "pendiente_revision" && !c.extraction_error),
      );
      return active ? 4_000 : false;
    },
  });

  const duplicados = useMemo(
    () => (certificados ? detectarDuplicados(certificados) : new Set<string>()),
    [certificados]
  );

  const lista = useMemo(() => {
    if (!certificados) return [];

    // Filtrar
    let items = certificados.filter((c) => {
      if (filtro === "validos") return c.estado === "validado" && !esCaducado(c) && !esPorCaducar(c);
      if (filtro === "rechazados") return c.estado === "rechazado";
      if (filtro === "caducados") return esCaducado(c);
      if (filtro === "por_caducar") return esPorCaducar(c);
      return true;
    });

    // Ordenar
    items = [...items].sort((a, b) => {
      if (orden === "recientes") return 0; // ya viene ordenado por created_at desc del backend
      if (orden === "fecha_obra") {
        const da = a.fecha_fin ? new Date(a.fecha_fin).getTime() : 0;
        const db = b.fecha_fin ? new Date(b.fecha_fin).getTime() : 0;
        return db - da;
      }
      if (orden === "grupo") {
        const ga = `${a.clasificacion_grupo ?? ""}${a.clasificacion_subgrupo ?? ""}`;
        const gb = `${b.clasificacion_grupo ?? ""}${b.clasificacion_subgrupo ?? ""}`;
        return ga.localeCompare(gb);
      }
      if (orden === "importe") {
        return Number(b.importe_adjudicacion ?? 0) - Number(a.importe_adjudicacion ?? 0);
      }
      return 0;
    });

    return items;
  }, [certificados, filtro, orden]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
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

      {/* Panel de solvencia */}
      <SolvenciaResumen />

      {/* Filtros + ordenación */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Pills de filtro */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar certificados">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFiltro(f.value)}
              className={`
                rounded-full px-3 py-1 text-xs font-semibold transition-colors
                ${
                  filtro === f.value
                    ? "bg-primary-500 text-white"
                    : "bg-muted text-muted-foreground hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/20"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Ordenar */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="
              rounded-lg bg-surface ring-1 ring-border
              px-3 py-1 text-sm text-foreground
              focus:outline-none focus:ring-2 focus:ring-primary-500
              transition-shadow
            "
            aria-label="Ordenar certificados"
          >
            {ORDENES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cabecera de columnas (sólo desktop) */}
      {!isLoading && !isError && lista.length > 0 && (
        <div className="mb-1 hidden lg:flex items-center gap-4 px-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <div className="flex-1">Certificado</div>
          <div className="w-36 text-right">Período</div>
          <div className="w-28 text-right">Importe</div>
          <div className="w-20 text-center">Grupo</div>
          <div className="w-20 text-center">Estado</div>
        </div>
      )}

      {/* Estados de carga */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <RowSkeleton key={i} />
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

      {!isLoading && !isError && lista.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {filtro !== "todos"
                ? "Sin resultados para este filtro"
                : "Aún no hay certificados"}
            </p>
            <p className="text-xs text-muted-foreground">
              {filtro !== "todos"
                ? "Prueba con otro filtro"
                : "Sube tu primer certificado de obra para empezar"}
            </p>
          </div>
          {filtro === "todos" && (
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

      {!isLoading && !isError && lista.length > 0 && (
        <div className="flex flex-col gap-2">
          {lista.map((cert) => (
            <CertificadoCard
              key={cert.id}
              cert={cert}
              caducado={esCaducado(cert)}
              porCaducar={esPorCaducar(cert)}
              posibleDuplicado={duplicados.has(cert.id)}
            />
          ))}
        </div>
      )}

      {/* Contador */}
      {!isLoading && !isError && certificados && certificados.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground text-right">
          {lista.length} de {certificados.length} certificados
        </p>
      )}

      {/* Modal */}
      {modalOpen && <UploadModal onClose={() => setModalOpen(false)} />}
    </main>
  );
}
