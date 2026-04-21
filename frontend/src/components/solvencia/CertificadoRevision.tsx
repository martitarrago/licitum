"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  RefreshCw,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  type CertificadoObraRead,
  type ExtractedData,
  certificadosApi,
} from "@/lib/api/certificados";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

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

function isAwaitingExtraction(cert: CertificadoObraRead): boolean {
  // Cert recién creado — worker aún no ha empezado (sin error, sin datos)
  return cert.estado === "pendiente_revision" && !hasExtractionData(cert) && cert.extraction_error === null;
}

function hasExtractionFailed(cert: CertificadoObraRead): boolean {
  // Solo cuando el worker corrió y falló explícitamente
  return cert.estado === "pendiente_revision" && !hasExtractionData(cert) && cert.extraction_error !== null;
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

const compactFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

// ─── SolvenciaWidget ─────────────────────────────────────────────────────────

function SolvenciaWidget({ cert }: { cert: CertificadoObraRead }) {
  const { data } = useQuery({
    queryKey: ["resumen-solvencia"],
    queryFn: () => certificadosApi.resumenSolvencia(EMPRESA_DEMO_ID),
    staleTime: 60_000,
  });

  if (!data) return null;

  const importeCert = Number(cert.importe_adjudicacion ?? 0);
  const aportacionAnual = importeCert > 0 ? importeCert / 5 : null;

  if (data.total_obras === 0) {
    return (
      <div className="rounded-lg bg-muted/60 ring-1 ring-border px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Tu solvencia acreditada
        </p>
        <p className="text-xs text-muted-foreground">
          Sin obras válidas aún. Necesitas importe y fecha de fin rellenados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-muted/60 ring-1 ring-border px-4 py-3 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Tu solvencia acreditada
      </p>
      <div className="flex items-baseline gap-2">
        <span className="text-base font-bold tabular-nums text-foreground">
          {compactFormatter.format(Number(data.anualidad_media))}
        </span>
        <span className="text-xs text-muted-foreground">
          anualidad media · {data.total_obras} {data.total_obras === 1 ? "obra" : "obras"}
        </span>
      </div>
      {aportacionAnual !== null && cert.estado === "pendiente_revision" && (
        <p className="text-xs text-muted-foreground">
          Si validas:{" "}
          <span className="font-semibold text-foreground">
            +{compactFormatter.format(aportacionAnual)}/año
          </span>{" "}
          <span className="text-muted-foreground/70">(importe ÷ 5 años LCSP)</span>
        </p>
      )}
    </div>
  );
}

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
      cls: "bg-muted ring-border",
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
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
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
                empresa. Podrás revertirlo a pendiente si necesitas corregirlo.
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
    <div className="flex flex-col items-center gap-8 rounded-xl bg-surface-raised p-12 text-center ring-1 ring-border">
      {/* Spinner o warning */}
      {timeout ? (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
          <AlertTriangle className="h-8 w-8 text-warning" aria-hidden="true" />
        </div>
      ) : (
        <div className="relative flex h-16 w-16 items-center justify-center">
          {/* Anillos pulsantes */}
          <span className="absolute inset-0 animate-ping rounded-full bg-foreground/15" />
          <span className="absolute inset-2 animate-ping rounded-full bg-foreground/10 [animation-delay:300ms]" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <RefreshCw className="h-7 w-7 animate-spin text-foreground [animation-duration:2s]" aria-hidden="true" />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-base font-semibold text-foreground">
          {timeout ? "Tarda más de lo esperado" : "Extrayendo datos del certificado…"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {timeout
            ? "Lleva más de 2 minutos. Es posible que el proceso haya fallado. Puedes forzar un reintento."
            : "Estamos leyendo el documento para identificar importes, fechas, organismo y clasificación. Suele tardar entre 30 y 60 segundos."}
        </p>
      </div>

      {/* Skeleton del formulario — para hacer la espera más amena */}
      {!timeout && (
        <div className="w-full max-w-sm space-y-3 text-left">
          {[["Organismo contratante", "w-3/4"], ["Importe", "w-1/2"], ["Fechas", "w-2/3"], ["Clasificación", "w-2/5"]].map(
            ([label, w]) => (
              <div key={label}>
                <div className="mb-1.5 h-2.5 w-24 rounded bg-muted animate-pulse" />
                <div className={`h-9 rounded-lg bg-muted animate-pulse ${w}`} />
              </div>
            ),
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Actualizar ahora
        </button>
        {timeout && (
          <button
            onClick={onForceReextract}
            disabled={forceReextractPending}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:opacity-85 disabled:pointer-events-none disabled:opacity-60"
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
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-colors hover:opacity-85 disabled:pointer-events-none disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground"
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
  contratista_principal: boolean;
  es_ute: boolean;
  porcentaje_ute: string;
}

function fromCert(cert: CertificadoObraRead): FormValues {
  const data = cert.extracted_data as Partial<ExtractedData>;
  const importe =
    data.importe_adjudicacion != null
      ? String(data.importe_adjudicacion)
      : cert.importe_adjudicacion && Number(cert.importe_adjudicacion) > 0
        ? String(cert.importe_adjudicacion)
        : "";
  const pctUte = cert.porcentaje_ute ? String(cert.porcentaje_ute) : "";
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
    contratista_principal: cert.contratista_principal ?? true,
    es_ute: cert.porcentaje_ute != null,
    porcentaje_ute: pctUte,
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

  type StringField = {
    [K in keyof FormValues]: FormValues[K] extends string ? K : never;
  }[keyof FormValues];

  const field = (key: StringField) => ({
    value: form[key] as string,
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
          contratista_principal: form.contratista_principal,
          porcentaje_ute: form.es_ute && form.porcentaje_ute
            ? Number(form.porcentaje_ute)
            : null,
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
    "w-full rounded-lg bg-surface ring-1 ring-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground transition-shadow";

  const importeBase = Number(form.importe_adjudicacion) || 0;
  const importeUte =
    form.es_ute && form.porcentaje_ute
      ? importeBase * (Number(form.porcentaje_ute) / 100)
      : null;

  return (
    <>
      {/* Banner documento inválido — si la IA lo detectó como no válido */}
      {cert.es_valido_solvencia === false && cert.razon_invalidez && (
        <div className="shrink-0 border-b border-border bg-warning/5 px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                Este documento puede no ser válido para acreditar solvencia
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{cert.razon_invalidez}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Puedes rechazarlo o validarlo igualmente si crees que la clasificación automática es incorrecta.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="space-y-5 p-6">
        {/* Widget de solvencia */}
        <SolvenciaWidget cert={cert} />

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

        {/* Contratista principal */}
        <div className="rounded-lg bg-muted px-4 py-3 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Rol en la obra
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            {[
              { value: true, label: "Contratista principal", sub: "La empresa fue el adjudicatario directo" },
              { value: false, label: "Subcontratista", sub: "No computa para solvencia acreditada" },
            ].map(({ value, label, sub }) => (
              <label key={String(value)} className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="contratista_principal"
                  checked={form.contratista_principal === value}
                  onChange={() => setForm((p) => ({ ...p, contratista_principal: value }))}
                  disabled={mutation.isPending}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted-foreground">{sub}</span>
                </span>
              </label>
            ))}
          </div>

          {/* UTE */}
          <div className="border-t border-border pt-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.es_ute}
                onChange={(e) => setForm((p) => ({ ...p, es_ute: e.target.checked, porcentaje_ute: "" }))}
                disabled={mutation.isPending}
                className=""
              />
              <span className="text-sm font-medium text-foreground">Obra ejecutada en UTE</span>
            </label>
            {form.es_ute && (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Participación</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="ej: 40"
                    value={form.porcentaje_ute}
                    onChange={(e) => setForm((p) => ({ ...p, porcentaje_ute: e.target.value }))}
                    disabled={mutation.isPending}
                    className="w-20 rounded-lg bg-surface ring-1 ring-border px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-foreground"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                {importeUte !== null && importeBase > 0 && (
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    → {new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(importeUte)} imputables
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
      </div>

      {/* Error — justo encima del footer */}
      {actionError && (
        <p className="shrink-0 border-t border-border bg-danger/5 px-6 py-2.5 text-sm text-danger">
          {actionError}
        </p>
      )}

      {/* Acciones — sticky footer */}
      <div className="shrink-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface-raised px-6 py-4">
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

function CertificadoFinalizado({
  cert,
}: {
  cert: CertificadoObraRead;
}) {
  const qc = useQueryClient();
  const [confirmRevertir, setConfirmRevertir] = useState(false);

  const revertirMutation = useMutation({
    mutationFn: () => certificadosApi.revertir(cert.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificado", cert.id] });
      qc.invalidateQueries({ queryKey: ["certificados"] });
    },
  });

  const readCls =
    "w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground";
  const labelCls =
    "mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

  const importe = Number(cert.importe_adjudicacion ?? 0);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => setConfirmRevertir(true)}
          disabled={revertirMutation.isPending}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title="Volver a editar este certificado"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Editar
        </button>
      </div>

      {confirmRevertir && (
        <div className="rounded-lg bg-warning/10 px-4 py-3 ring-1 ring-warning/25 flex items-start justify-between gap-3">
          <p className="text-sm text-foreground">
            ¿Revertir a pendiente de revisión?
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => setConfirmRevertir(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setConfirmRevertir(false);
                revertirMutation.mutate();
              }}
              className="text-xs font-semibold text-warning hover:text-warning/80"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
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
    </div>
  );
}

// ─── EliminarModal ────────────────────────────────────────────────────────────

function EliminarModal({
  titulo,
  onConfirm,
  onCancel,
  isPending,
}: {
  titulo: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const palabraConfirmar = titulo === "este certificado" ? "ELIMINAR" : titulo;
  const [input, setInput] = useState("");
  const confirmado =
    input.trim().toLowerCase() === palabraConfirmar.trim().toLowerCase();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, isPending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !isPending) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-surface-raised shadow-md ring-1 ring-border">
        <div className="space-y-4 p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-danger/10">
              <Trash2 className="h-5 w-5 text-danger" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Eliminar certificado
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Se eliminará <span className="font-medium text-foreground">&ldquo;{titulo}&rdquo;</span> del expediente. Esta acción no se puede deshacer.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Escribe el nombre del certificado para confirmar
            </label>
            <p className="mb-2 rounded-md bg-muted px-3 py-1.5 font-mono text-xs text-foreground break-all">
              {palabraConfirmar}
            </p>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && confirmado && !isPending) onConfirm(); }}
              disabled={isPending}
              placeholder="Escribe aquí…"
              className="w-full rounded-lg bg-surface ring-1 ring-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-danger transition-shadow"
            />
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
            onClick={onConfirm}
            disabled={!confirmado || isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isPending ? "Eliminando…" : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function CertificadoRevision({ id }: { id: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [, setTick] = useState(0);
  const [eliminarOpen, setEliminarOpen] = useState(false);

  const eliminarMutation = useMutation({
    mutationFn: () => certificadosApi.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certificados"] });
      qc.removeQueries({ queryKey: ["certificado", id] });
      router.push("/solvencia/certificados");
    },
  });

  const { data: cert, isLoading, isError } = useQuery({
    queryKey: ["certificado", id],
    queryFn: () => certificadosApi.get(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3_000;
      if (isStillProcessing(data) || isAwaitingExtraction(data)) return 3_000;
      return false;
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

  const procesando = isStillProcessing(cert) || isAwaitingExtraction(cert);
  const timeoutProcesando = isProcesandoTimeout(cert);
  const extraccionFallida = hasExtractionFailed(cert);
  const tieneDatos = hasExtractionData(cert);
  const confianzaGlobal = cert.extracted_data?.confianza_extraccion;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Breadcrumb + acciones */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <button
          onClick={() => router.push("/solvencia/certificados")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Certificados de obra
        </button>
        <div className="flex items-center gap-3">
          {!procesando && (
            <a
              href={`/api/v1/solvencia/certificados/${cert.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              Descargar certificado
            </a>
          )}
          <button
            onClick={() => setEliminarOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Eliminar
          </button>
        </div>
      </div>

      {/* Título y meta */}
      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <EstadoBadge estado={cert.estado} />
          {!procesando && typeof confianzaGlobal === "number" && tieneDatos && (
            (() => {
              const { label, cls } = confianzaStyle(confianzaGlobal);
              return (
                <span className="text-xs text-muted-foreground">
                  Confianza:{" "}
                  <span className={`font-semibold ${cls}`}>
                    {label} ({Math.round(confianzaGlobal * 100)}%)
                  </span>
                </span>
              );
            })()
          )}
        </div>
        <h1 className="text-2xl font-semibold text-foreground leading-snug">
          {cert.titulo || "Certificado sin título"}
        </h1>
        {((cert.numero_expediente && !cert.numero_expediente.startsWith("EXP-")) || cert.organismo) && (
          <p className="text-sm text-muted-foreground">
            {cert.numero_expediente && !cert.numero_expediente.startsWith("EXP-")
              ? `Exp. ${cert.numero_expediente}`
              : ""}
            {cert.numero_expediente && !cert.numero_expediente.startsWith("EXP-") && cert.organismo
              ? " · "
              : ""}
            {cert.organismo ?? ""}
          </p>
        )}
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
            <PdfViewer url={`/api/v1/solvencia/certificados/${cert.id}/pdf`} />
          </div>

          <div className="overflow-hidden rounded-xl bg-surface-raised ring-1 ring-border flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-10rem)]">
            {cert.estado === "pendiente_revision" ? (
              <div className="flex flex-col flex-1 min-h-0">
                {extraccionFallida && (
                  <ExtractionErrorBanner
                    error={cert.extraction_error}
                    onReextract={() => reextractMutation.mutate(true)}
                    reextractPending={reextractMutation.isPending}
                  />
                )}
                <ReviewForm cert={cert} showConfianza={tieneDatos} />
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="shrink-0 border-b border-border px-6 py-4">
                  <EstadoBadge estado={cert.estado} />
                </div>
                <CertificadoFinalizado cert={cert} />
              </div>
            )}
          </div>
        </div>
      )}

      {eliminarOpen && (
        <EliminarModal
          titulo={cert.titulo || "este certificado"}
          onConfirm={() => eliminarMutation.mutate()}
          onCancel={() => setEliminarOpen(false)}
          isPending={eliminarMutation.isPending}
        />
      )}
    </div>
  );
}
