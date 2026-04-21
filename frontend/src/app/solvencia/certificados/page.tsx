"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Clock, FileText, Plus, XCircle } from "lucide-react";
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

type Orden = "estado" | "recientes" | "fecha_obra" | "grupo" | "importe";

const ESTADO_ORDEN: Record<string, number> = {
  pendiente_revision: 0,
  procesando: 1,
  validado: 2,
  rechazado: 3,
};

const ORDENES: { value: Orden; label: string }[] = [
  { value: "estado", label: "Estado" },
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

function esDuplicadoPar(a: CertificadoObraListItem, b: CertificadoObraListItem): boolean {
  if (!a.organismo || !b.organismo) return false;
  if (a.organismo.trim().toLowerCase() !== b.organismo.trim().toLowerCase()) return false;
  if (!a.fecha_fin || !b.fecha_fin) return false;
  const diffDias = Math.abs(new Date(a.fecha_fin).getTime() - new Date(b.fecha_fin).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDias > 30) return false;
  const ia = Number(a.importe_adjudicacion) || 0;
  const ib = Number(b.importe_adjudicacion) || 0;
  if (ia > 0 && ib > 0) {
    const ratio = Math.abs(ia - ib) / Math.max(ia, ib);
    if (ratio > 0.15) return false;
  }
  return true;
}

function detectarDuplicados(certs: CertificadoObraListItem[]): Set<string> {
  const duplicados = new Set<string>();
  for (let i = 0; i < certs.length; i++) {
    for (let j = i + 1; j < certs.length; j++) {
      if (esDuplicadoPar(certs[i], certs[j])) {
        duplicados.add(certs[i].id);
        duplicados.add(certs[j].id);
      }
    }
  }
  return duplicados;
}

function calcularEliminables(certs: CertificadoObraListItem[]): string[] {
  const toDelete = new Set<string>();
  for (let i = 0; i < certs.length; i++) {
    for (let j = i + 1; j < certs.length; j++) {
      const a = certs[i], b = certs[j];
      if (toDelete.has(a.id) || toDelete.has(b.id)) continue;
      if (!esDuplicadoPar(a, b)) continue;
      // Conservar el que tenga más campos completos
      const score = (c: CertificadoObraListItem) =>
        (c.titulo ? 1 : 0) +
        (Number(c.importe_adjudicacion) > 0 ? 1 : 0) +
        (c.fecha_inicio ? 1 : 0) +
        (c.clasificacion_grupo ? 1 : 0);
      toDelete.add(score(a) >= score(b) ? b.id : a.id);
    }
  }
  return Array.from(toDelete);
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
  const [orden, setOrden] = useState<Orden>("estado");
  const [ordenDir, setOrdenDir] = useState<"asc" | "desc">("desc");
  const [modalOpen, setModalOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [ordenOpen, setOrdenOpen] = useState(false);
  const ordenRef = useRef<HTMLDivElement>(null);
  const [confirmarDuplicados, setConfirmarDuplicados] = useState(false);
  const [eliminandoDuplicados, setEliminandoDuplicados] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ordenRef.current && !ordenRef.current.contains(e.target as Node)) {
        setOrdenOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const eliminables = useMemo(
    () => (certificados ? calcularEliminables(certificados) : []),
    [certificados]
  );

  async function handleEliminarDuplicados() {
    setEliminandoDuplicados(true);
    try {
      await Promise.all(eliminables.map((id) => certificadosApi.eliminar(id)));
      await queryClient.invalidateQueries({ queryKey: ["certificados"] });
    } finally {
      setEliminandoDuplicados(false);
      setConfirmarDuplicados(false);
    }
  }

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
    const dir = ordenDir === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => {
      if (orden === "estado") {
        const ea = ESTADO_ORDEN[a.estado] ?? 9;
        const eb = ESTADO_ORDEN[b.estado] ?? 9;
        if (ea !== eb) return (ea - eb) * dir;
        // Secundario: fecha_fin desc (más reciente primero)
        const da = a.fecha_fin ? new Date(a.fecha_fin).getTime() : 0;
        const db = b.fecha_fin ? new Date(b.fecha_fin).getTime() : 0;
        return db - da;
      }
      if (orden === "recientes") {
        // El backend devuelve created_at desc; asc = invertir
        return ordenDir === "asc" ? 1 : -1;
      }
      if (orden === "fecha_obra") {
        const da = a.fecha_fin ? new Date(a.fecha_fin).getTime() : 0;
        const db = b.fecha_fin ? new Date(b.fecha_fin).getTime() : 0;
        return (db - da) * dir;
      }
      if (orden === "grupo") {
        const ga = `${a.clasificacion_grupo ?? ""}${a.clasificacion_subgrupo ?? ""}`;
        const gb = `${b.clasificacion_grupo ?? ""}${b.clasificacion_subgrupo ?? ""}`;
        return ga.localeCompare(gb) * dir;
      }
      if (orden === "importe") {
        return (Number(b.importe_adjudicacion ?? 0) - Number(a.importe_adjudicacion ?? 0)) * dir;
      }
      return 0;
    });

    return items;
  }, [certificados, filtro, orden, ordenDir]);

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
            bg-foreground px-4 py-2 text-sm font-medium text-surface
            transition-colors hover:opacity-85
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground
          "
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Subir certificado
        </button>
      </div>

      {/* Explicación colapsable */}
      <div className="mb-6">
        <button
          onClick={() => setInfoOpen((v) => !v)}
          aria-expanded={infoOpen}
          className="flex w-full items-center justify-between rounded-xl bg-muted px-5 py-3.5 ring-1 ring-border text-left transition-colors hover:bg-neutral-200 dark:hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
        >
          <span className="text-sm font-semibold text-foreground">
            ¿Qué documentos acreditan solvencia de obra?
          </span>
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${infoOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {infoOpen && (
          <div className="mt-1 rounded-xl ring-1 ring-border bg-surface-raised px-5 py-5 text-sm space-y-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-success">
                Documentos válidos
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li><span className="font-medium text-foreground">Acta de recepción de obra</span> — el organismo acepta la obra terminada. Incluye fecha, conformidad e importe. Es el más valorado.</li>
                <li><span className="font-medium text-foreground">Certificado de buena ejecución</span> — emitido por el organismo contratante confirmando ejecución correcta, en plazo y por el importe acordado.</li>
                <li><span className="font-medium text-foreground">Certificado de obra ejecutada</span> — emitido a petición de la empresa por el organismo contratante. Equivalente al anterior.</li>
                <li><span className="font-medium text-foreground">Clasificación ROLECE</span> — para obras de más de 500.000 € sustituye a todos los anteriores. Si tienes clasificación activa, la JCCPE ya verificó tu solvencia.</li>
              </ul>
            </div>
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-danger">
                Documentos que NO son válidos
              </p>
              <ul className="space-y-1.5 text-muted-foreground">
                <li><span className="font-medium text-foreground">Contratos de adjudicación</span> — acreditan que te adjudicaron la obra, no que la terminaste.</li>
                <li><span className="font-medium text-foreground">Certificaciones parciales</span> — las certificaciones mensuales durante la ejecución no cuentan. Solo la recepción final.</li>
                <li><span className="font-medium text-foreground">Subcontratación</span> — si ejecutaste como subcontratista, el organismo no reconoce esa obra. Solo cuenta el contratista principal.</li>
                <li><span className="font-medium text-foreground">Obras de más de 5 años</span> — la LCSP (art. 88) limita el período a los últimos 5 años.</li>
                <li><span className="font-medium text-foreground">Certificados de asistencia técnica</span> — acreditan al técnico o ingeniero que dirigió la obra, no a la constructora que la ejecutó.</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Panel de solvencia */}
      <SolvenciaResumen />

      {/* Banner duplicados */}
      {duplicados.size > 0 && (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-xl bg-warning/10 px-4 py-3 ring-1 ring-warning/25">
          <div className="flex items-center gap-2 text-sm text-warning">
            <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>
              Se detectaron <span className="font-semibold">{eliminables.length} certificado{eliminables.length !== 1 ? "s" : ""} duplicado{eliminables.length !== 1 ? "s" : ""}</span>.
              Se conservará el que tenga más campos completos.
            </span>
          </div>
          <button
            onClick={() => setConfirmarDuplicados(true)}
            className="flex-shrink-0 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-85"
          >
            Eliminar duplicados
          </button>
        </div>
      )}

      {/* Leyenda de estados */}
      <div className="mb-3 hidden lg:flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          Válido
        </span>
        <span className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
          Pendiente revisión
        </span>
        <span className="flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
          Rechazado
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Caducado
        </span>
      </div>

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
                    ? "bg-foreground text-surface"
                    : "bg-muted text-muted-foreground hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-800"
                }
              `}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Ordenar */}
        <div className="flex items-center gap-1.5" aria-label="Ordenar certificados">
          {/* Dropdown custom */}
          <div className="relative" ref={ordenRef}>
            <button
              onClick={() => setOrdenOpen((v) => !v)}
              className="
                inline-flex items-center gap-1.5 cursor-pointer
                rounded-full bg-muted pl-3 pr-2.5 py-1
                text-xs font-semibold text-muted-foreground
                ring-1 ring-border
                hover:bg-neutral-200 dark:hover:bg-neutral-800
                transition-colors focus:outline-none
              "
            >
              {ORDENES.find((o) => o.value === orden)?.label}
              <ChevronDown
                className={`h-3 w-3 text-muted-foreground transition-transform duration-150 ${ordenOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>

            {ordenOpen && (
              <div className="
                absolute right-0 top-full mt-1 z-20
                min-w-[140px] rounded-xl
                bg-surface-raised ring-1 ring-border shadow-lg
                overflow-hidden py-1
              ">
                {ORDENES.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setOrden(o.value); setOrdenOpen(false); }}
                    className={`
                      w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors
                      ${orden === o.value
                        ? "bg-foreground text-surface"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }
                    `}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Dirección */}
          <button
            onClick={() => setOrdenDir((d) => (d === "desc" ? "asc" : "desc"))}
            title={ordenDir === "desc" ? "Mayor a menor — pulsa para invertir" : "Menor a mayor — pulsa para invertir"}
            className="
              inline-flex items-center justify-center
              rounded-full bg-muted p-1.5
              ring-1 ring-border
              text-muted-foreground
              hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-800
              transition-colors focus:outline-none
            "
          >
            {ordenDir === "desc"
              ? <ArrowDown className="h-3 w-3" aria-hidden="true" />
              : <ArrowUp className="h-3 w-3" aria-hidden="true" />
            }
            <span className="sr-only">{ordenDir === "desc" ? "Orden descendente" : "Orden ascendente"}</span>
          </button>
        </div>
      </div>

      {/* Cabecera de columnas (sólo desktop) */}
      {!isLoading && !isError && lista.length > 0 && (
        <div className="mb-1 hidden lg:flex items-center gap-4 px-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <div className="flex-1">Certificado</div>
          <div className="w-36 text-right">Período</div>
          <div className="w-28 text-right">Importe</div>
          <div className="w-24 text-center">Grupo</div>
          <div className="w-16 text-center">Estado</div>
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
                bg-foreground px-4 py-2 text-sm font-medium text-surface
                transition-colors hover:opacity-85
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

      {/* Modal subida */}
      {modalOpen && <UploadModal onClose={() => setModalOpen(false)} />}

      {/* Modal confirmar eliminación duplicados */}
      {confirmarDuplicados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-surface-raised ring-1 ring-border shadow-xl p-6">
            <h2 className="text-base font-semibold text-foreground mb-2">
              Eliminar {eliminables.length} duplicado{eliminables.length !== 1 ? "s" : ""}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Se eliminarán los certificados con menos datos completos. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmarDuplicados(false)}
                disabled={eliminandoDuplicados}
                className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground bg-muted hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminarDuplicados}
                disabled={eliminandoDuplicados}
                className="rounded-lg px-4 py-2 text-sm font-medium bg-danger text-white hover:opacity-85 transition-opacity disabled:opacity-50"
              >
                {eliminandoDuplicados ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
