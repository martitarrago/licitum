"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileUp,
  Info,
  Loader2,
  RefreshCcw,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  BANDERA_TIPO_LABELS,
  FORMULA_TIPO_LABELS,
  pliegosApi,
  type EncajeItem,
  type PliegoAnalisis,
  type PliegoExtracted,
  type Recomendacion,
  type Veredicto,
} from "@/lib/api/pliegos";
import { licitacionesApi } from "@/lib/api/licitaciones";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

const POLL_MS = 3000;

export default function PliegoPage({
  params,
}: {
  params: { expediente: string };
}) {
  const expediente = decodeURIComponent(params.expediente);
  const qc = useQueryClient();
  const router = useRouter();

  const licitacion = useQuery({
    queryKey: ["licitacion", expediente],
    queryFn: () => licitacionesApi.get(expediente),
    staleTime: 5 * 60 * 1000,
  });

  const analisis = useQuery({
    queryKey: ["pliego", expediente],
    queryFn: () => pliegosApi.get(expediente),
    refetchInterval: (q) => {
      const data = q.state.data;
      return data &&
        (data.estado === "pendiente" || data.estado === "procesando")
        ? POLL_MS
        : false;
    },
  });

  const recomendacion = useQuery({
    queryKey: ["pliego-recomendacion", expediente, EMPRESA_DEMO_ID],
    queryFn: () => pliegosApi.recomendacion(expediente, EMPRESA_DEMO_ID),
    enabled: analisis.data?.estado === "completado",
  });

  const autoAnalizar = useMutation({
    mutationFn: () => pliegosApi.analizar(expediente),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pliego", expediente] }),
  });

  // Cuando la página carga y no hay análisis previo, disparar auto-descarga desde PSCP.
  useEffect(() => {
    if (!analisis.isLoading && analisis.data === null) {
      autoAnalizar.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analisis.isLoading, analisis.data]);

  const reextract = useMutation({
    mutationFn: () => pliegosApi.reextraer(expediente),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pliego", expediente] }),
  });

  const remove = useMutation({
    mutationFn: () => pliegosApi.delete(expediente),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pliego", expediente] });
      qc.invalidateQueries({
        queryKey: ["pliego-recomendacion", expediente, EMPRESA_DEMO_ID],
      });
    },
  });

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <button
        onClick={() => router.back()}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver
      </button>

      <Header
        titulo={licitacion.data?.titulo ?? expediente}
        organismo={licitacion.data?.organismo ?? null}
        fechaLimite={licitacion.data?.fecha_limite ?? null}
      />

      {analisis.isLoading || autoAnalizar.isPending ? (
        <Skeleton />
      ) : !analisis.data ? (
        // autoAnalizar falló antes de crear la fila → mostrar upload manual
        <UploadEmpty expediente={expediente} />
      ) : analisis.data.estado === "pendiente" ||
        analisis.data.estado === "procesando" ? (
        <Procesando />
      ) : analisis.data.estado === "fallido" ? (
        analisis.data.error_mensaje?.startsWith("DOCUMENTO_NO_DISPONIBLE") ? (
          // PSCP no tiene el documento → ofrecer upload manual
          <UploadEmpty expediente={expediente} pscp_fallido />
        ) : (
          <Fallido
            analisis={analisis.data}
            onRetry={() => reextract.mutate()}
            onDelete={() => remove.mutate()}
            retrying={reextract.isPending}
          />
        )
      ) : (
        <Completado
          analisis={analisis.data}
          recomendacion={recomendacion.data}
          recomendacionLoading={recomendacion.isLoading}
          onReextract={() => reextract.mutate()}
          onDelete={() => {
            if (
              confirm(
                "¿Borrar el análisis IA de este pliego? El PDF también se borrará.",
              )
            ) {
              remove.mutate();
            }
          }}
          reextracting={reextract.isPending}
          expediente={expediente}
        />
      )}
    </main>
  );
}

// ─── Header ────────────────────────────────────────────────────────────────

function Header({
  titulo,
  organismo,
  fechaLimite,
}: {
  titulo: string;
  organismo: string | null;
  fechaLimite: string | null;
}) {
  const dias = diasHasta(fechaLimite);
  return (
    <header className="mb-8">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Análisis de pliego
      </p>
      <h1 className="display-h mt-2 text-3xl leading-[1.05] sm:text-4xl">
        {titulo}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {organismo && <span>{organismo}</span>}
        {fechaLimite && (
          <span>
            Límite {fmtFecha(fechaLimite)}
            {dias != null && dias >= 0 && (
              <span
                className={
                  dias <= 7
                    ? "font-semibold text-danger"
                    : "text-muted-foreground"
                }
              >
                {" "}
                · en {dias} d
              </span>
            )}
            {dias != null && dias < 0 && (
              <span className="text-muted-foreground">· cerrada</span>
            )}
          </span>
        )}
      </div>
    </header>
  );
}

// ─── Estado: cargando ──────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-48 animate-pulse rounded-2xl bg-muted/30" />
      <div className="h-32 animate-pulse rounded-2xl bg-muted/30" />
      <div className="h-40 animate-pulse rounded-2xl bg-muted/30" />
    </div>
  );
}

// ─── Estado: sin análisis (subir PCAP) ─────────────────────────────────────

function UploadEmpty({
  expediente,
  pscp_fallido,
}: {
  expediente: string;
  pscp_fallido?: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: (pdf: File) => pliegosApi.upload(expediente, pdf),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pliego", expediente] }),
    onError: (e: Error) => setError(e.message),
  });

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    upload.mutate(f);
  };

  return (
    <div className="rounded-2xl bg-surface-raised p-8 ring-1 ring-border">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-muted p-3">
          <FileUp
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.75}
          />
        </div>
        <div className="flex-1">
          <h2 className="font-display text-xl font-bold">
            {pscp_fallido
              ? "El pliego no está disponible automáticamente"
              : "Sube el PCAP para empezar"}
          </h2>
          <p className="mt-1 text-base text-muted-foreground">
            {pscp_fallido
              ? "No hemos podido descargar el pliego desde el portal de la administración. Descárgalo tú manualmente y súbelo aquí."
              : "Sube el Pliego de Cláusulas Administrativas Particulares y la IA extraerá en menos de 60 segundos: presupuesto, plazo, clasificación exigida, fórmula de valoración, baja temeraria, fechas clave y banderas rojas."}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          onChange={onChange}
          className="hidden"
          disabled={upload.isPending}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-foreground/90 disabled:opacity-50"
        >
          {upload.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Subiendo…
            </>
          ) : (
            <>
              <FileUp className="h-4 w-4" strokeWidth={2} />
              Subir PCAP (PDF)
            </>
          )}
        </button>
        <span className="text-xs text-muted-foreground">
          Máx. 50 MB · solo PDF
        </span>
      </div>

      {error && (
        <p className="mt-4 flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

// ─── Estado: procesando ────────────────────────────────────────────────────

function Procesando() {
  return (
    <div className="rounded-2xl bg-surface-raised p-12 text-center ring-1 ring-border">
      <Loader2
        className="mx-auto h-10 w-10 animate-spin text-muted-foreground"
        strokeWidth={1.5}
      />
      <h2 className="mt-4 font-display text-xl font-bold">
        Analizando el pliego con IA
      </h2>
      <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
        Suele tardar 30-60 segundos. La página se actualiza sola cuando termine
        — puedes seguir trabajando en otra cosa mientras tanto.
      </p>
    </div>
  );
}

// ─── Estado: fallido ───────────────────────────────────────────────────────

function Fallido({
  analisis,
  onRetry,
  onDelete,
  retrying,
}: {
  analisis: PliegoAnalisis;
  onRetry: () => void;
  onDelete: () => void;
  retrying: boolean;
}) {
  return (
    <div className="rounded-2xl bg-danger/5 p-6 ring-1 ring-danger/20">
      <div className="flex items-start gap-3">
        <XCircle
          className="mt-0.5 h-5 w-5 shrink-0 text-danger"
          strokeWidth={2}
        />
        <div className="flex-1">
          <h2 className="text-base font-semibold">Falló la extracción</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {analisis.error_mensaje ?? "Error desconocido."}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" strokeWidth={2} />
              )}
              Reintentar
            </button>
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              Borrar y volver a subir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Estado: completado ────────────────────────────────────────────────────

function Completado({
  analisis,
  recomendacion,
  recomendacionLoading,
  onReextract,
  onDelete,
  reextracting,
  expediente,
}: {
  analisis: PliegoAnalisis;
  recomendacion: Recomendacion | undefined;
  recomendacionLoading: boolean;
  onReextract: () => void;
  onDelete: () => void;
  reextracting: boolean;
  expediente: string;
}) {
  const d = analisis.extracted_data;

  return (
    <div className="space-y-8">
      {/* ── 1. Lo más importante del pliego ─────────────────────────── */}
      <FichaRapida d={d} />

      {/* ── 2. Encaje con tu empresa ─────────────────────────────────── */}
      <EncajeEmpresa
        encaje={recomendacion?.encaje ?? []}
        loading={recomendacionLoading}
      />

      {/* ── 3. Conclusión ────────────────────────────────────────────── */}
      <ConclusionPanel
        recomendacion={recomendacion}
        loading={recomendacionLoading}
      />

      {/* ── Detalle del pliego ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Datos completos del pliego
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <BloqueValoracion d={d} />
      <BloqueGarantias d={d} />
      {d.docs_extra_sobre_a && d.docs_extra_sobre_a.length > 0 && (
        <BloqueSobreA items={d.docs_extra_sobre_a} />
      )}

      <Acciones
        analisis={analisis}
        onReextract={onReextract}
        onDelete={onDelete}
        reextracting={reextracting}
        expediente={expediente}
      />
    </div>
  );
}

// ─── Sección 1: Lo más importante del pliego ──────────────────────────────

function FichaRapida({ d }: { d: PliegoExtracted }) {
  const clasif = d.clasificacion_grupo
    ? `${d.clasificacion_grupo}${d.clasificacion_subgrupo ?? ""}${
        d.clasificacion_categoria ? "-" + d.clasificacion_categoria : ""
      }`
    : null;

  const stats: { label: string; value: string }[] = [];
  if (d.presupuesto_base_sin_iva != null)
    stats.push({
      label: "Presupuesto base",
      value: fmtEur(d.presupuesto_base_sin_iva),
    });
  if (d.plazo_ejecucion_meses != null)
    stats.push({
      label: "Plazo de ejecución",
      value: `${d.plazo_ejecucion_meses} meses`,
    });
  stats.push({ label: "Clasificación exigida", value: clasif ?? "No exige" });
  if (d.fecha_limite_presentacion)
    stats.push({
      label: "Fecha límite",
      value: fmtFecha(d.fecha_limite_presentacion),
    });
  if (d.fecha_apertura_sobres)
    stats.push({
      label: "Apertura sobres",
      value: fmtFecha(d.fecha_apertura_sobres),
    });
  if (d.fecha_visita_obra)
    stats.push({
      label: "Visita a obra",
      value: fmtFecha(d.fecha_visita_obra),
    });

  return (
    <section className="card p-8">
      <p className="eyebrow mb-6">Lo más importante del pliego</p>

      <div className="mb-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-1 font-display text-2xl font-bold leading-tight">{s.value}</p>
          </div>
        ))}
      </div>

      {d.banderas_rojas && d.banderas_rojas.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {d.banderas_rojas.map((b, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning ring-1 ring-warning/25"
            >
              <span
                className="h-1.5 w-1.5 rounded-full bg-warning"
                aria-hidden="true"
              />
              {BANDERA_TIPO_LABELS[b.tipo] ?? b.tipo}
              {b.descripcion && (
                <span className="font-normal text-warning/70">
                  {" "}
                  — {b.descripcion}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {d.resumen_ejecutivo && (
        <p className="font-serif text-base leading-relaxed text-foreground/90">
          {d.resumen_ejecutivo}
        </p>
      )}
    </section>
  );
}

// ─── Sección 2: Encaje con tu empresa ─────────────────────────────────────

const encajeStyle: Record<
  string,
  { dot: string; text: string; label: string; bg: string; ring: string }
> = {
  cumple: {
    dot: "bg-success",
    text: "text-success",
    label: "Cumple",
    bg: "bg-success/10",
    ring: "ring-success/25",
  },
  riesgo: {
    dot: "bg-warning",
    text: "text-warning",
    label: "Riesgo",
    bg: "bg-warning/10",
    ring: "ring-warning/25",
  },
  no_cumple: {
    dot: "bg-danger",
    text: "text-danger",
    label: "No cumple",
    bg: "bg-danger/10",
    ring: "ring-danger/25",
  },
  sin_datos: {
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    label: "Sin datos",
    bg: "bg-muted/40",
    ring: "ring-border",
  },
};

function EncajeEmpresa({
  encaje,
  loading,
}: {
  encaje: EncajeItem[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <section className="card p-8">
        <p className="eyebrow mb-5">Encaje con tu empresa</p>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-lg bg-muted/40"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="card p-8">
      <p className="eyebrow mb-5">Encaje con tu empresa</p>

      {encaje.length === 0 ? (
        <p className="text-base text-muted-foreground">
          El pliego no especifica clasificación ni solvencia mínima. No se han
          detectado requisitos formales que comparar con tu empresa.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {encaje.map((item, i) => {
            const s = encajeStyle[item.estado] ?? encajeStyle.sin_datos;
            return (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 py-5 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:gap-4"
              >
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {item.requisito}
                  </p>
                  <p className="mt-1 text-base text-foreground">
                    {item.exigido}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Tu empresa
                  </p>
                  <p className="mt-1 text-base text-foreground">
                    {item.empresa}
                  </p>
                </div>
                <div className="flex sm:justify-end">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${s.bg} ${s.ring}`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${s.dot}`}
                      aria-hidden="true"
                    />
                    <span className={s.text}>{s.label}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Sección 3: Conclusión ─────────────────────────────────────────────────

const veredictoStyle: Record<
  Veredicto,
  { color: string; bg: string; ring: string; icon: LucideIcon }
> = {
  ir: {
    color: "text-success",
    bg: "bg-success/10",
    ring: "ring-success/25",
    icon: CheckCircle2,
  },
  ir_con_riesgo: {
    color: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/25",
    icon: AlertTriangle,
  },
  no_ir: {
    color: "text-danger",
    bg: "bg-danger/10",
    ring: "ring-danger/25",
    icon: XCircle,
  },
  incompleto: {
    color: "text-muted-foreground",
    bg: "bg-muted/40",
    ring: "ring-border",
    icon: Info,
  },
};

function ConclusionPanel({
  recomendacion,
  loading,
}: {
  recomendacion: Recomendacion | undefined;
  loading: boolean;
}) {
  if (loading || !recomendacion) {
    return (
      <section className="card p-8">
        <p className="eyebrow mb-4">Conclusión</p>
        <div className="h-28 animate-pulse rounded-lg bg-muted/40" />
      </section>
    );
  }

  const style = veredictoStyle[recomendacion.veredicto];
  const Icon = style.icon;
  const tieneRazones =
    recomendacion.razones_a_favor.length > 0 ||
    recomendacion.razones_riesgo.length > 0 ||
    recomendacion.razones_no.length > 0;

  return (
    <section
      className={`rounded-2xl p-8 shadow-card ring-1 ${style.bg} ${style.ring}`}
    >
      <p className={`eyebrow mb-4 ${style.color}`}>Conclusión</p>

      <div className="flex items-start gap-4">
        <Icon
          className={`mt-1 h-7 w-7 shrink-0 ${style.color}`}
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">
            {recomendacion.titulo}
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            {recomendacion.razon_principal}
          </p>
        </div>
      </div>

      {tieneRazones && (
        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:gap-6">
          {recomendacion.razones_a_favor.length > 0 && (
            <div className="flex-1">
              <ReasonList
                label="A favor"
                tone="success"
                items={recomendacion.razones_a_favor}
              />
            </div>
          )}
          {recomendacion.razones_riesgo.length > 0 && (
            <div className="flex-1">
              <ReasonList
                label="A vigilar"
                tone="warning"
                items={recomendacion.razones_riesgo}
              />
            </div>
          )}
          {recomendacion.razones_no.length > 0 && (
            <div className="flex-1">
              <ReasonList
                label="En contra"
                tone="danger"
                items={recomendacion.razones_no}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ReasonList({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "success" | "warning" | "danger";
  items: string[];
}) {
  const dotColor =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : "bg-danger";
  const labelColor =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-danger";
  return (
    <div>
      <p
        className={`text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}
      >
        {label}
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-base">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
            />
            <span>{r}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Bloques de datos (detalle) ────────────────────────────────────────────

function Bloque({
  eyebrow,
  titulo,
  children,
}: {
  eyebrow: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-8">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h2 className="mb-6 font-display text-2xl font-bold tracking-tight">
        {titulo}
      </h2>
      <dl className="space-y-4">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-full sm:w-56 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-base">{value}</dd>
    </div>
  );
}

function Literal({ texto }: { texto: string }) {
  return (
    <blockquote className="mt-1 rounded-md bg-muted/40 px-4 py-3 font-serif text-sm leading-relaxed text-foreground/90">
      &ldquo;{texto}&rdquo;
    </blockquote>
  );
}

function BloqueValoracion({ d }: { d: PliegoExtracted }) {
  const empty =
    !d.formula_economica_extracto &&
    !d.baja_temeraria_extracto &&
    d.pct_criterios_subjetivos == null &&
    d.pct_criterios_objetivos == null;
  if (empty) return null;
  return (
    <Bloque eyebrow="Puntuación" titulo="Criterios y fórmulas de valoración">
      <Row
        label="Ponderación"
        value={
          d.pct_criterios_subjetivos != null ||
          d.pct_criterios_objetivos != null
            ? `Subjetivos ${d.pct_criterios_subjetivos ?? "—"}% · Objetivos ${
                d.pct_criterios_objetivos ?? "—"
              }%`
            : "—"
        }
      />
      <Row
        label="Tipo de fórmula"
        value={
          d.formula_tipo
            ? (FORMULA_TIPO_LABELS[d.formula_tipo] ?? d.formula_tipo)
            : "—"
        }
      />
      {d.formula_economica_extracto && (
        <Row
          label="Fórmula económica (literal)"
          value={<Literal texto={d.formula_economica_extracto} />}
        />
      )}
      {d.baja_temeraria_extracto && (
        <Row
          label="Baja temeraria (literal)"
          value={<Literal texto={d.baja_temeraria_extracto} />}
        />
      )}
      {d.umbral_saciedad_pct != null && (
        <Row label="Umbral de saciedad" value={`${d.umbral_saciedad_pct}%`} />
      )}
      {d.mejoras_descripcion && (
        <Row label="Mejoras valorables" value={d.mejoras_descripcion} />
      )}
    </Bloque>
  );
}

function BloqueGarantias({ d }: { d: PliegoExtracted }) {
  const empty =
    d.garantia_provisional_pct == null && d.garantia_definitiva_pct == null;
  if (empty) return null;
  return (
    <Bloque eyebrow="Caución" titulo="Garantías exigidas">
      <Row
        label="Provisional"
        value={
          d.garantia_provisional_pct != null
            ? `${d.garantia_provisional_pct}% del presupuesto base`
            : "No exige"
        }
      />
      <Row
        label="Definitiva"
        value={
          d.garantia_definitiva_pct != null
            ? `${d.garantia_definitiva_pct}% de la adjudicación`
            : "—"
        }
      />
    </Bloque>
  );
}

function BloqueSobreA({ items }: { items: string[] }) {
  return (
    <Bloque eyebrow="Sobre A" titulo="Documentación adicional">
      <ul className="space-y-1.5 text-sm">
        {items.map((doc, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/60" />
            <span>{doc}</span>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

// ─── Acciones ──────────────────────────────────────────────────────────────

function Acciones({
  analisis,
  onReextract,
  onDelete,
  reextracting,
  expediente,
}: {
  analisis: PliegoAnalisis;
  onReextract: () => void;
  onDelete: () => void;
  reextracting: boolean;
  expediente: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-raised p-4 ring-1 ring-border">
      <div className="text-xs text-muted-foreground">
        {analisis.confianza_global && (
          <span>
            Confianza extracción:{" "}
            <span className="font-mono text-foreground">
              {analisis.confianza_global}
            </span>{" "}
            ·{" "}
          </span>
        )}
        {analisis.procesado_at && (
          <span>analizado {fmtRelativo(analisis.procesado_at)}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {analisis.pdf_url && (
          <a
            href={`/api/v1/pliegos/${expediente}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
            Ver PDF
          </a>
        )}
        <button
          onClick={onReextract}
          disabled={reextracting}
          className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground disabled:opacity-50"
        >
          {reextracting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          Re-extraer
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border transition-colors hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          Borrar
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtEur(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function fmtFecha(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function diasHasta(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const ms = new Date(fecha).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function fmtRelativo(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} d`;
  return fmtFecha(value);
}
