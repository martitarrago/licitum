"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  type CertificadoObraRead,
  type ExtractedData,
  certificadosApi,
} from "@/lib/api/certificados";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PROCESANDO_TIMEOUT_MS = 2 * 60 * 1000;

function hasExtractionData(cert: CertificadoObraRead): boolean {
  return typeof cert.extracted_data?.confianza_extraccion === "number";
}

function isStillProcessing(cert: CertificadoObraRead): boolean {
  return cert.estado === "procesando";
}

function isProcesandoTimeout(cert: CertificadoObraRead): boolean {
  if (cert.estado !== "procesando") return false;
  const updatedAt = new Date(cert.updated_at).getTime();
  if (Number.isNaN(updatedAt)) return false;
  return Date.now() - updatedAt > PROCESANDO_TIMEOUT_MS;
}

function hasExtractionFailed(cert: CertificadoObraRead): boolean {
  return cert.estado === "pendiente_revision" && !hasExtractionData(cert);
}

function confianzaStyle(value: number) {
  if (value >= 0.8)
    return { label: "Alta", cls: "text-success", dotCls: "bg-success" };
  if (value >= 0.5)
    return { label: "Media", cls: "text-warning", dotCls: "bg-warning" };
  return { label: "Baja", cls: "text-danger", dotCls: "bg-danger" };
}

const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

// ─── EstadoBadge ─────────────────────────────────────────────────────────────

function EstadoBadge({ estado }: { estado: CertificadoObraRead["estado"] }) {
  const map: Record<
    CertificadoObraRead["estado"],
    { label: string; cls: string; Icon: typeof CheckCircle2 }
  > = {
    pendiente_revision: {
      label: "Pendiente de revisión",
      cls: "bg-warning/10 ring-warning/25 dark:bg-warning/20",
      Icon: Clock,
    },
    procesando: {
      label: "Procesando",
      cls: "bg-primary-50 ring-primary-200 dark:bg-primary-900/20 dark:ring-primary-700/30",
      Icon: RefreshCw,
    },
    validado: {
      label: "Validado",
      cls: "bg-success/10 ring-success/25 dark:bg-success/20",
      Icon: CheckCircle2,
    },
    rechazado: {
      label: "Rechazado",
      cls: "bg-danger/10 ring-danger/25 dark:bg-danger/20",
      Icon: XCircle,
    },
  };

  const { label, cls, Icon } = map[estado];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-inset ${cls}`}
      role="status"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

// ─── PdfViewer ────────────────────────────────────────────────────────────────

function PdfViewer({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative h-[50vh] overflow-hidden rounded-xl bg-muted ring-1 ring-border lg:h-[calc(100vh-10rem)]">
      {/* Loading skeleton */}
      {!loaded && !failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <FileText className="h-8 w-8 animate-pulse" aria-hidden="true" />
          <span className="text-sm">Cargando PDF…</span>
        </div>
      )}

      {/* Fallback si el iframe falla */}
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              No se puede previsualizar el PDF
            </p>
            <p className="text-xs text-muted-foreground">
              Ábrelo en una nueva pestaña para consultarlo
            </p>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-500 hover:text-primary-700 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Abrir PDF
          </a>
        </div>
      ) : (
        <iframe
          src={url}
          title="Certificado de obra PDF"
          className={`h-full w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

// ─── FieldWithConfidence ──────────────────────────────────────────────────────

function FieldWithConfidence({
  label,
  fieldKey,
  confianzaCampos,
  children,
}: {
  label: string;
  fieldKey: string;
  confianzaCampos?: Partial<Record<string, number>>;
  children: React.ReactNode;
}) {
  const valor = confianzaCampos?.[fieldKey];
  const estilo = valor !== undefined ? confianzaStyle(valor) : null;

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {estilo && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${estilo.dotCls}`}
            title={`Confianza de extracción: ${estilo.label} (${Math.round(valor! * 100)}%)`}
            aria-label={`Confianza de extracción: ${estilo.label}`}
          />
        )}
      </div>
      {children}
    </div>
  );
}

// ─── ConfirmValidarModal ──────────────────────────────────────────────────────

function ConfirmValidarModal({
  onConfirm,
  onCancel,
  isPending,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, isPending]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-validar-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onCancel();
      }}
    >
      <div className="w-full max-w-sm rounded-xl bg-surface-raised shadow-md ring-1 ring-border">
        <div className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2
                className="h-5 w-5 text-success"
                aria-hidden="true"
              />
            </div>
            <div>
              <h2
                id="confirm-validar-title"
                className="text-base font-semibold text-foreground"
              >
                ¿Validar este certificado?
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Los datos se guardarán como parte del expediente técnico de la
                empresa. Esta acción no se puede deshacer.
              </p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-success"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Validando…" : "Validar certificado"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExtractionPending ────────────────────────────────────────────────────────

function ExtractionPending({
  onRefresh,
  timeout,
  onForceReextract,
  forceReextractPending,
}: {
  onRefresh: () => void;
  timeout: boolean;
  onForceReextract: () => void;
  forceReextractPending: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 rounded-xl bg-surface-raised p-10 text-center ring-1 ring-border">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          timeout
            ? "bg-warning/10"
            : "bg-primary-50 dark:bg-primary-900/30"
        }`}
      >
        {timeout ? (
          <AlertTriangle className="h-8 w-8 text-warning" aria-hidden="true" />
        ) : (
          <Clock className="h-8 w-8 text-primary-500" aria-hidden="true" />
        )}
      </div>
      <div className="space-y-2">
        <p className="text-base font-semibold text-foreground">
          {timeout ? "La extracción tarda más de lo normal" : "Extrayendo datos del PDF"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {timeout
            ? "Lleva más de 2 minutos procesando. Es posible que el worker haya fallado. Puedes forzar un reintento."
            : "Claude está analizando el certificado. Suele tardar menos de un minuto. La página se actualizará automáticamente."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Actualizar ahora
        </button>
        {timeout && (
          <button
            onClick={onForceReextract}
            disabled={forceReextractPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
          >
            <RefreshCw
              className={`h-4 w-4 ${forceReextractPending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {forceReextractPending ? "Reintentando…" : "Forzar re-extracción"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ExtractionErrorBanner ────────────────────────────────────────────────────

function ExtractionErrorBanner({
  error,
  onReextract,
  reextractPending,
}: {
  error: string | null;
  onReextract: () => void;
  reextractPending: boolean;
}) {
  return (
    <div className="border-b border-border bg-danger/5 px-6 py-4">
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 h-5 w-5 flex-shrink-0 text-danger"
          aria-hidden="true"
        />
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              La extracción automática no pudo completarse
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error
                ? `Motivo: ${error}`
                : "No se obtuvieron datos del PDF. Puedes reintentar la extracción o rellenar los campos manualmente."}
            </p>
          </div>
          <button
            onClick={onReextract}
            disabled={reextractPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${reextractPending ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {reextractPending ? "Reintentando…" : "Reintentar extracción"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ReviewForm ───────────────────────────────────────────────────────────────

interface FormValues {
  organismo: string;
  importe_adjudicacion: string;
  fecha_inicio: string;
  fecha_fin: string;
  numero_expediente: string;
  cpv_codes: string;
  clasificacion_grupo: string;
  clasificacion_subgrupo: string;
}

function fromCert(cert: CertificadoObraRead): FormValues {
  const data = cert.extracted_data as Partial<ExtractedData>;
  const importe =
    data.importe_adjudicacion != null
      ? String(data.importe_adjudicacion)
      : cert.importe_adjudicacion && Number(cert.importe_adjudicacion) > 0
        ? String(cert.importe_adjudicacion)
        : "";
  return {
    organismo: data.organismo ?? cert.organismo ?? "",
    importe_adjudicacion: importe,
    fecha_inicio: data.fecha_inicio ?? cert.fecha_inicio ?? "",
    fecha_fin: data.fecha_fin ?? cert.fecha_fin ?? "",
    numero_expediente:
      data.numero_expediente ??
      (cert.numero_expediente && !cert.numero_expediente.startsWith("EXP-")
        ? cert.numero_expediente
        : ""),
    cpv_codes: (data.cpv_codes ?? cert.cpv_codes ?? []).join(", "),
    clasificacion_grupo: data.clasificacion_grupo ?? cert.clasificacion_grupo ?? "",
    clasificacion_subgrupo:
      data.clasificacion_subgrupo ?? cert.clasificacion_subgrupo ?? "",
  };
}

function ReviewForm({
  cert,
  showConfianza = true,
}: {
  cert: CertificadoObraRead;
  showConfianza?: boolean;
}) {
  const qc = useQueryClient();
  const extracted = cert.extracted_data as Partial<ExtractedData>;
  const confianzaGlobal = extracted.confianza_extraccion ?? 0;
  const confianzaCampos = extracted.confianza_campos;

  const [form, setForm] = useState<FormValues>(() => fromCert(cert));
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const field = (key: keyof FormValues) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  const mutation = useMutation({
    mutationFn: (action: "validar" | "rechazar") =>
      certificadosApi
        .patch(cert.id, {
          organismo: form.organismo || undefined,
          importe_adjudicacion: form.importe_adjudicacion || undefined,
          fecha_inicio: form.fecha_inicio || undefined,
          fecha_fin: form.fecha_fin || undefined,
          numero_expediente: form.numero_expediente || undefined,
          cpv_codes: form.cpv_codes
            ? form.cpv_codes
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          clasificacion_grupo: form.clasificacion_grupo || null,
          clasificacion_subgrupo: form.clasificacion_subgrupo || null,
        })
        .then(() =>
          action === "validar"
            ? certificadosApi.validar(cert.id)
            : certificadosApi.rechazar(cert.id),
        ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificado", cert.id] });
      qc.invalidateQueries({ queryKey: ["certificados"] });
      setConfirmOpen(false);
    },
    onError: (err: Error) => {
      setActionError(err.message);
      setConfirmOpen(false);
    },
  });

  const inputCls =
    "w-full rounded-lg bg-surface ring-1 ring-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 transition-shadow";

  return (
    <>
      <div className="space-y-5 p-6">
        {/* Confianza global — solo si hay datos extraídos */}
        {showConfianza && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-4 py-2.5">
            {(() => {
              const { label, cls } = confianzaStyle(confianzaGlobal);
              return (
                <>
                  <span className="text-xs text-muted-foreground">
                    Confianza de extracción:
                  </span>
                  <span className={`text-xs font-semibold ${cls}`}>
                    {label} ({Math.round(confianzaGlobal * 100)}%)
                  </span>
                  {confianzaGlobal < 0.5 && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger ring-1 ring-danger/25">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      Revisar con atención
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Campos del formulario */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldWithConfidence
            label="Organismo contratante"
            fieldKey="organismo"
            confianzaCampos={confianzaCampos}
          >
            <div className="sm:col-span-2">
              <input
                type="text"
                className={inputCls}
                {...field("organismo")}
                disabled={mutation.isPending}
              />
            </div>
          </FieldWithConfidence>

          <FieldWithConfidence
            label="Importe de adjudicación (€)"
            fieldKey="importe_adjudicacion"
            confianzaCampos={confianzaCampos}
          >
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              {...field("importe_adjudicacion")}
              disabled={mutation.isPending}
            />
          </FieldWithConfidence>

          <FieldWithConfidence
            label="Número de expediente"
            fieldKey="numero_expediente"
            confianzaCampos={confianzaCampos}
          >
            <input
              type="text"
              className={inputCls}
              {...field("numero_expediente")}
              disabled={mutation.isPending}
            />
          </FieldWithConfidence>

          <FieldWithConfidence
            label="Fecha de inicio"
            fieldKey="fecha_inicio"
            confianzaCampos={confianzaCampos}
          >
            <input
              type="date"
              className={inputCls}
              {...field("fecha_inicio")}
              disabled={mutation.isPending}
            />
          </FieldWithConfidence>

          <FieldWithConfidence
            label="Fecha de fin / recepción"
            fieldKey="fecha_fin"
            confianzaCampos={confianzaCampos}
          >
            <input
              type="date"
              className={inputCls}
              {...field("fecha_fin")}
              disabled={mutation.isPending}
            />
          </FieldWithConfidence>

          <FieldWithConfidence
            label="Clasificación — grupo"
            fieldKey="clasificacion_grupo"
            confianzaCampos={confianzaCampos}
          >
            <input
              type="text"
              placeholder="ej: C"
              className={inputCls}
              {...field("clasificacion_grupo")}
              disabled={mutation.isPending}
            />
          </FieldWithConfidence>

          <FieldWithConfidence
            label="Clasificación — subgrupo"
            fieldKey="clasificacion_subgrupo"
            confianzaCampos={confianzaCampos}
          >
            <input
              type="text"
              placeholder="ej: 6"
              className={inputCls}
              {...field("clasificacion_subgrupo")}
              disabled={mutation.isPending}
            />
          </FieldWithConfidence>

          <div className="sm:col-span-2">
            <FieldWithConfidence
              label="Códigos CPV (separados por coma)"
              fieldKey="cpv_codes"
              confianzaCampos={confianzaCampos}
            >
              <input
                type="text"
                placeholder="45233000-9, 45262210-6"
                className={inputCls}
                {...field("cpv_codes")}
                disabled={mutation.isPending}
              />
            </FieldWithConfidence>
          </div>
        </div>

        {/* Error */}
        {actionError && (
          <p className="rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger ring-1 ring-danger/25">
            {actionError}
          </p>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          <p className="mr-auto text-xs text-muted-foreground">
            Los cambios se guardan al validar o rechazar.
          </p>
          <button
            onClick={() => {
              setActionError(null);
              mutation.mutate("rechazar");
            }}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger disabled:pointer-events-none disabled:opacity-50"
          >
            {mutation.isPending && mutation.variables === "rechazar" ? (
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
            {mutation.isPending && mutation.variables === "rechazar"
              ? "Rechazando…"
              : "Rechazar"}
          </button>
          <button
            onClick={() => {
              setActionError(null);
              setConfirmOpen(true);
            }}
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-success"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Validar certificado
          </button>
        </div>
      </div>

      {/* Modal de confirmación */}
      {confirmOpen && (
        <ConfirmValidarModal
          isPending={mutation.isPending}
          onConfirm={() => {
            setActionError(null);
            mutation.mutate("validar");
          }}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </>
  );
}

// ─── CertificadoFinalizado ────────────────────────────────────────────────────

function CertificadoFinalizado({ cert }: { cert: CertificadoObraRead }) {
  const readCls =
    "w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground";
  const labelCls =
    "mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

  const importe = Number(cert.importe_adjudicacion);

  return (
    <div className="space-y-4 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className={labelCls}>Organismo contratante</div>
          <div className={readCls}>{cert.organismo || "—"}</div>
        </div>

        <div>
          <div className={labelCls}>Importe de adjudicación</div>
          <div className={`${readCls} tabular-nums font-semibold`}>
            {importe > 0 ? importeFormatter.format(importe) : "—"}
          </div>
        </div>

        <div>
          <div className={labelCls}>Número de expediente</div>
          <div className={readCls}>{cert.numero_expediente || "—"}</div>
        </div>

        <div>
          <div className={labelCls}>Fecha de inicio</div>
          <div className={`${readCls} tabular-nums`}>
            {cert.fecha_inicio || "—"}
          </div>
        </div>

        <div>
          <div className={labelCls}>Fecha de fin / recepción</div>
          <div className={`${readCls} tabular-nums`}>
            {cert.fecha_fin || "—"}
          </div>
        </div>

        <div>
          <div className={labelCls}>Clasificación — grupo</div>
          <div className={readCls}>{cert.clasificacion_grupo || "—"}</div>
        </div>

        <div>
          <div className={labelCls}>Clasificación — subgrupo</div>
          <div className={readCls}>{cert.clasificacion_subgrupo || "—"}</div>
        </div>

        {cert.cpv_codes.length > 0 && (
          <div className="sm:col-span-2">
            <div className={labelCls}>Códigos CPV</div>
            <div className={`${readCls} font-mono`}>
              {cert.cpv_codes.join(", ")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function CertificadoRevision({ id }: { id: string }) {
  const qc = useQueryClient();
  const [, setTick] = useState(0);

  const { data: cert, isLoading, isError } = useQuery({
    queryKey: ["certificado", id],
    queryFn: () => certificadosApi.get(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 5_000;
      return isStillProcessing(data) ? 5_000 : false;
    },
  });

  // Re-render cada 15s mientras procesa, para detectar timeout sin esperar al backend
  useEffect(() => {
    if (!cert || !isStillProcessing(cert)) return;
    const interval = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(interval);
  }, [cert]);

  const reextractMutation = useMutation({
    mutationFn: (forzar: boolean) => certificadosApi.reextraer(id, forzar),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificado", id] });
      qc.invalidateQueries({ queryKey: ["certificados"] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  if (isError || !cert) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-danger">
        No se pudo cargar el certificado.
      </div>
    );
  }

  const procesando = isStillProcessing(cert);
  const timeoutProcesando = isProcesandoTimeout(cert);
  const extraccionFallida = hasExtractionFailed(cert);
  const tieneDatos = hasExtractionData(cert);
  const confianzaGlobal = cert.extracted_data?.confianza_extraccion;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <EstadoBadge estado={cert.estado} />
            <h1 className="text-xl font-semibold text-foreground">
              {cert.titulo || "Certificado sin título"}
            </h1>
            {cert.numero_expediente &&
              !cert.numero_expediente.startsWith("EXP-") && (
                <p className="text-sm text-muted-foreground">
                  Exp. {cert.numero_expediente}
                </p>
              )}
          </div>

          {!procesando && (
            <div className="flex flex-wrap items-center gap-4">
              {typeof confianzaGlobal === "number" && tieneDatos && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const { label, cls } = confianzaStyle(confianzaGlobal);
                    return (
                      <span className="text-sm text-muted-foreground">
                        Confianza:{" "}
                        <span className={`font-semibold ${cls}`}>
                          {label} ({Math.round(confianzaGlobal * 100)}%)
                        </span>
                      </span>
                    );
                  })()}
                </div>
              )}
              <a
                href={cert.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary-500 transition-colors hover:text-primary-700"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Abrir PDF original
              </a>
            </div>
          )}
        </div>
      </header>

      {procesando ? (
        <ExtractionPending
          onRefresh={() =>
            qc.invalidateQueries({ queryKey: ["certificado", id] })
          }
          timeout={timeoutProcesando}
          onForceReextract={() => reextractMutation.mutate(true)}
          forceReextractPending={reextractMutation.isPending}
        />
      ) : (
        <div className="grid gap-6 items-start lg:grid-cols-[1fr,480px]">
          <div className="lg:sticky lg:top-4">
            <PdfViewer url={cert.pdf_url} />
          </div>

          <div className="overflow-hidden rounded-xl bg-surface-raised ring-1 ring-border">
            {cert.estado === "pendiente_revision" ? (
              <>
                {extraccionFallida && (
                  <ExtractionErrorBanner
                    error={cert.extraction_error}
                    onReextract={() => reextractMutation.mutate(true)}
                    reextractPending={reextractMutation.isPending}
                  />
                )}
                <ReviewForm cert={cert} showConfianza={tieneDatos} />
              </>
            ) : (
              <>
                <div className="border-b border-border px-6 py-4">
                  <EstadoBadge estado={cert.estado} />
                </div>
                <CertificadoFinalizado cert={cert} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
