"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
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
  type BanderaRoja,
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
      return data && (data.estado === "pendiente" || data.estado === "procesando")
        ? POLL_MS
        : false;
    },
  });

  const recomendacion = useQuery({
    queryKey: ["pliego-recomendacion", expediente, EMPRESA_DEMO_ID],
    queryFn: () => pliegosApi.recomendacion(expediente, EMPRESA_DEMO_ID),
    enabled: analisis.data?.estado === "completado",
  });

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
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={`/radar/${encodeURIComponent(expediente)}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al detalle
      </Link>

      <Header
        titulo={licitacion.data?.titulo ?? expediente}
        organismo={licitacion.data?.organismo ?? null}
        fechaLimite={licitacion.data?.fecha_limite ?? null}
      />

      {analisis.isLoading ? (
        <Skeleton />
      ) : !analisis.data ? (
        <UploadEmpty expediente={expediente} />
      ) : analisis.data.estado === "pendiente" ||
        analisis.data.estado === "procesando" ? (
        <Procesando />
      ) : analisis.data.estado === "fallido" ? (
        <Fallido
          analisis={analisis.data}
          onRetry={() => reextract.mutate()}
          onDelete={() => remove.mutate()}
          retrying={reextract.isPending}
        />
      ) : (
        <Completado
          analisis={analisis.data}
          recomendacion={recomendacion.data}
          recomendacionLoading={recomendacion.isLoading}
          onReextract={() => reextract.mutate()}
          onDelete={() => {
            if (confirm("¿Borrar el análisis IA de este pliego? El PDF también se borrará.")) {
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
        M3 · Análisis de pliego
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
                  dias <= 7 ? "font-semibold text-danger" : "text-muted-foreground"
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
      <div className="h-32 animate-pulse rounded-2xl bg-muted/30" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted/30" />
    </div>
  );
}

// ─── Estado: sin análisis (subir PCAP) ─────────────────────────────────────

function UploadEmpty({ expediente }: { expediente: string }) {
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
          <h2 className="font-serif text-xl font-medium">
            Sube el PCAP para empezar
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sube el Pliego de Cláusulas Administrativas Particulares y la IA
            extraerá en menos de 60 segundos: presupuesto, plazo, clasificación
            exigida, fórmula de valoración, baja temeraria, fechas clave y
            banderas rojas.
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
      <h2 className="mt-4 font-serif text-xl font-medium">
        Analizando el pliego con IA
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
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
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" strokeWidth={2} />
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {d.resumen_ejecutivo && (
          <ResumenEjecutivo
            texto={d.resumen_ejecutivo}
            idioma={d.idioma_detectado}
          />
        )}

        {d.banderas_rojas && d.banderas_rojas.length > 0 && (
          <BanderasRojas items={d.banderas_rojas} />
        )}

        <BloqueEconomico d={d} />
        <BloquePlazos d={d} />
        <BloqueSolvencia d={d} />
        <BloqueValoracion d={d} />
        <Calculadora d={d} />
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

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <RecomendacionPanel
          recomendacion={recomendacion}
          loading={recomendacionLoading}
        />
      </aside>
    </div>
  );
}

// ─── Resumen ejecutivo ─────────────────────────────────────────────────────

function ResumenEjecutivo({
  texto,
  idioma,
}: {
  texto: string;
  idioma: string | undefined | null;
}) {
  return (
    <section className="card p-6">
      <p className="eyebrow mb-3 flex items-center gap-2">
        Resumen ejecutivo
        {idioma && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
            {idioma}
          </span>
        )}
      </p>
      <p className="font-serif text-lg leading-relaxed">{texto}</p>
    </section>
  );
}

// ─── Banderas rojas ────────────────────────────────────────────────────────

function BanderasRojas({ items }: { items: BanderaRoja[] }) {
  return (
    <section className="rounded-2xl bg-warning/5 p-6 ring-1 ring-warning/20 shadow-card">
      <p className="eyebrow mb-3 text-warning">Banderas rojas detectadas</p>
      <ul className="space-y-2.5">
        {items.map((b, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
              aria-hidden="true"
            />
            <div>
              <span className="font-medium">
                {BANDERA_TIPO_LABELS[b.tipo] ?? b.tipo}
              </span>
              <span className="text-muted-foreground"> — {b.descripcion}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Bloques de datos ──────────────────────────────────────────────────────

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
    <section className="card p-6">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h2 className="mb-5 font-display text-xl font-bold tracking-tight">
        {titulo}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="w-full sm:w-56 shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm">{value}</dd>
    </div>
  );
}

function Literal({ texto }: { texto: string }) {
  return (
    <blockquote className="mt-1 rounded-md bg-muted/40 px-3 py-2 font-serif text-[13px] leading-relaxed text-foreground/90">
      “{texto}”
    </blockquote>
  );
}

function BloqueEconomico({ d }: { d: PliegoExtracted }) {
  const empty =
    d.presupuesto_base_sin_iva == null &&
    d.iva_porcentaje == null &&
    d.valor_estimado_contrato == null;
  if (empty) return null;
  return (
    <Bloque eyebrow="Importes" titulo="Presupuesto y valor estimado">
      <Row label="Presupuesto base (sin IVA)" value={fmtEur(d.presupuesto_base_sin_iva)} />
      <Row
        label="IVA aplicable"
        value={d.iva_porcentaje != null ? `${d.iva_porcentaje}%` : "—"}
      />
      <Row label="Valor estimado contrato" value={fmtEur(d.valor_estimado_contrato)} />
    </Bloque>
  );
}

function BloquePlazos({ d }: { d: PliegoExtracted }) {
  const empty =
    d.plazo_ejecucion_meses == null &&
    !d.fecha_limite_presentacion &&
    !d.fecha_apertura_sobres &&
    !d.fecha_visita_obra;
  if (empty) return null;
  return (
    <Bloque eyebrow="Calendario" titulo="Plazos y fechas clave">
      <Row
        label="Plazo de ejecución"
        value={
          d.plazo_ejecucion_meses != null
            ? `${d.plazo_ejecucion_meses} meses`
            : "—"
        }
      />
      <Row label="Fecha límite presentación" value={fmtFecha(d.fecha_limite_presentacion)} />
      <Row label="Apertura de sobres" value={fmtFecha(d.fecha_apertura_sobres)} />
      <Row label="Visita a obra" value={fmtFecha(d.fecha_visita_obra)} />
    </Bloque>
  );
}

function BloqueSolvencia({ d }: { d: PliegoExtracted }) {
  const empty =
    !d.clasificacion_grupo &&
    d.solvencia_economica_volumen_anual == null &&
    d.solvencia_tecnica_obras_similares_importe == null;
  if (empty) return null;

  const clasif = d.clasificacion_grupo
    ? `${d.clasificacion_grupo}${d.clasificacion_subgrupo ?? ""}${
        d.clasificacion_categoria ? "-" + d.clasificacion_categoria : ""
      }`
    : null;

  return (
    <Bloque eyebrow="Requisitos" titulo="Solvencia exigida">
      <Row label="Clasificación" value={clasif ?? "No exige"} />
      <Row
        label="Volumen anual mínimo"
        value={fmtEur(d.solvencia_economica_volumen_anual)}
      />
      <Row
        label="Obras similares — importe"
        value={fmtEur(d.solvencia_tecnica_obras_similares_importe)}
      />
      <Row
        label="Obras similares — cantidad"
        value={
          d.solvencia_tecnica_numero_obras != null
            ? `${d.solvencia_tecnica_numero_obras} obras${
                d.solvencia_tecnica_anos_referencia
                  ? ` (últimos ${d.solvencia_tecnica_anos_referencia} años)`
                  : ""
              }`
            : "—"
        }
      />
    </Bloque>
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
          d.pct_criterios_subjetivos != null || d.pct_criterios_objetivos != null
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
            ? FORMULA_TIPO_LABELS[d.formula_tipo] ?? d.formula_tipo
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
        <Row
          label="Umbral de saciedad"
          value={`${d.umbral_saciedad_pct}%`}
        />
      )}
      {d.mejoras_descripcion && (
        <Row label="Mejoras valorables" value={d.mejoras_descripcion} />
      )}
    </Bloque>
  );
}

// ─── M5 Calculadora (vive dentro del flujo M3) ─────────────────────────────

function parseTemerariaThreshold(text: string | null | undefined): number | null {
  // Best-effort regex sobre el extracto literal de baja temeraria. Cubre
  // patrones comunes castellano + catalán. Devuelve null si no encuentra
  // un umbral numérico claro — el frontend cae a "evalúa manualmente".
  if (!text) return null;
  // "X unidades porcentuales" / "X unitats percentuals"
  const m1 = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:unidades porcentuales|unitats percentuals)/i,
  );
  if (m1) {
    const v = parseFloat(m1[1].replace(",", "."));
    if (v >= 5 && v <= 50) return v;
  }
  // "más de X%" / "superior(es) al X%" / "més d(e) X%"
  const m2 = text.match(
    /(?:m[áa]s\s+de|m[ée]s\s+d[e']?|superior(?:es)?\s+(?:al|en\s+m[áa]s\s+de)|inferior(?:es)?\s+(?:al|en\s+m[áa]s\s+de))\s+(?:un\s+|una\s+)?(\d+(?:[.,]\d+)?)\s*(?:%|por\s+ciento|per\s+cent)/i,
  );
  if (m2) {
    const v = parseFloat(m2[1].replace(",", "."));
    if (v >= 5 && v <= 50) return v;
  }
  return null;
}

function Calculadora({ d }: { d: PliegoExtracted }) {
  const presupuesto = d.presupuesto_base_sin_iva;
  const [bajaPct, setBajaPct] = useState(10);

  if (!presupuesto || presupuesto <= 0) return null;

  const importe = presupuesto * (1 - bajaPct / 100);
  const importeAhorro = presupuesto * (bajaPct / 100);

  const temerariaPct = parseTemerariaThreshold(d.baja_temeraria_extracto);
  const distancia = temerariaPct != null ? temerariaPct - bajaPct : null;
  const enZonaTemeraria = distancia != null && distancia <= 0;
  const cercaDeTemeraria = distancia != null && distancia > 0 && distancia <= 2;

  const saciedadPct = d.umbral_saciedad_pct ?? null;
  const esLinealSaciedad =
    d.formula_tipo === "lineal_con_saciedad" &&
    saciedadPct != null &&
    saciedadPct > 0;
  const puntosPctEstimado = esLinealSaciedad
    ? Math.min(bajaPct / saciedadPct!, 1) * 100
    : null;
  const enSaciedad = esLinealSaciedad && bajaPct >= saciedadPct!;

  const setBajaSafe = (v: number) =>
    setBajaPct(Math.max(0, Math.min(50, isFinite(v) ? v : 0)));

  return (
    <section className="overflow-hidden rounded-2xl bg-foreground p-6 text-surface">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-surface/60">
            M5 · Calculadora de oferta
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight">
            Tu oferta económica
          </h2>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-surface/60">
              Baja sobre presupuesto base
            </span>
            <div className="mt-3 flex items-baseline gap-2">
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={bajaPct}
                onChange={(e) => setBajaSafe(Number(e.target.value))}
                className="w-28 rounded-md bg-surface/10 px-2 py-1.5 font-mono text-3xl font-semibold text-surface focus:outline-none focus:ring-2 focus:ring-surface/30"
              />
              <span className="font-mono text-3xl font-semibold">%</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={0.5}
              value={Math.min(bajaPct, 30)}
              onChange={(e) => setBajaSafe(Number(e.target.value))}
              className="mt-3 w-full accent-surface"
            />
            <div className="mt-1 flex justify-between text-[10px] text-surface/40">
              <span>0%</span>
              <span>10%</span>
              <span>20%</span>
              <span>30%</span>
            </div>
          </label>
        </div>

        <div className="md:text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-surface/60">
            Importe oferta (sin IVA)
          </p>
          <p className="display-num mt-1 text-3xl text-surface">
            {fmtEur(importe)}
          </p>
          <p className="mt-0.5 text-xs text-surface/60">
            ahorro de {fmtEur(importeAhorro)} sobre el presupuesto base
          </p>
        </div>
      </div>

      {/* Estado vs baja temeraria */}
      {enZonaTemeraria && (
        <div className="mt-5 rounded-lg bg-danger/30 px-3 py-2 text-sm">
          <strong>Zona de baja temeraria.</strong> Tu baja del {bajaPct}% supera o iguala el umbral del {temerariaPct}%. Necesitarás justificación detallada (LCSP art. 149) o quedarás excluida.
        </div>
      )}
      {!enZonaTemeraria && cercaDeTemeraria && (
        <div className="mt-5 rounded-lg bg-warning/30 px-3 py-2 text-sm">
          A {distancia!.toFixed(1)} pp del umbral temerario ({temerariaPct}%). Margen ajustado.
        </div>
      )}
      {!enZonaTemeraria && !cercaDeTemeraria && temerariaPct != null && (
        <div className="mt-5 rounded-lg bg-success/20 px-3 py-2 text-sm">
          Oferta segura — {distancia!.toFixed(1)} pp por debajo del umbral temerario ({temerariaPct}%).
        </div>
      )}

      {/* Estimación de puntos económicos (solo si fórmula lineal con saciedad) */}
      {esLinealSaciedad && (
        <div className="mt-3 rounded-lg bg-surface/10 px-3 py-2 text-sm">
          {enSaciedad ? (
            <>
              Has alcanzado el umbral de saciedad del {saciedadPct}%. Bajar más
              <strong> no aumenta</strong> tu puntuación económica.
            </>
          ) : (
            <>
              Estimación de puntos económicos asumiendo lineal con saciedad al{" "}
              {saciedadPct}%: <strong>{Math.round(puntosPctEstimado!)}%</strong> del máximo.
            </>
          )}
        </div>
      )}

      {/* Notas de referencia */}
      <div className="mt-5 border-t border-surface/10 pt-3 text-xs text-surface/60">
        {temerariaPct == null && d.baja_temeraria_extracto && (
          <p className="mb-1.5">
            ⓘ No se pudo extraer un umbral numérico del literal del pliego — juzga manualmente con la cláusula del bloque &ldquo;Criterios de valoración&rdquo; arriba.
          </p>
        )}
        {!d.baja_temeraria_extracto && (
          <p className="mb-1.5">
            ⓘ El pliego no parece definir un umbral de baja temeraria. Por defecto LCSP fija 25% bajo presupuesto base.
          </p>
        )}
        <p>
          Presupuesto base:{" "}
          <span className="font-mono text-surface">{fmtEur(presupuesto)}</span>
          {d.formula_tipo && d.formula_tipo !== "no_detectado" && (
            <>
              {" · "}Fórmula: {FORMULA_TIPO_LABELS[d.formula_tipo] ?? d.formula_tipo}
            </>
          )}
        </p>
      </div>
    </section>
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

// ─── Recomendación panel ───────────────────────────────────────────────────

const veredictoStyle: Record<
  Veredicto,
  { color: string; bg: string; ring: string; icon: LucideIcon }
> = {
  ir: { color: "text-success", bg: "bg-success/10", ring: "ring-success/25", icon: CheckCircle2 },
  ir_con_riesgo: {
    color: "text-warning",
    bg: "bg-warning/10",
    ring: "ring-warning/25",
    icon: AlertTriangle,
  },
  no_ir: { color: "text-danger", bg: "bg-danger/10", ring: "ring-danger/25", icon: XCircle },
  incompleto: {
    color: "text-muted-foreground",
    bg: "bg-muted/40",
    ring: "ring-border",
    icon: Info,
  },
};

function RecomendacionPanel({
  recomendacion,
  loading,
}: {
  recomendacion: Recomendacion | undefined;
  loading: boolean;
}) {
  if (loading || !recomendacion) {
    return (
      <div className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recomendación
        </p>
        <div className="mt-3 h-32 animate-pulse rounded-lg bg-muted/40" />
      </div>
    );
  }

  const style = veredictoStyle[recomendacion.veredicto];
  const Icon = style.icon;

  return (
    <div className={`rounded-2xl p-6 ring-1 ${style.bg} ${style.ring}`}>
      <p className={`text-xs font-medium uppercase tracking-wider ${style.color}`}>
        Recomendación
      </p>
      <div className="mt-2 flex items-start gap-2">
        <Icon className={`mt-1 h-5 w-5 shrink-0 ${style.color}`} strokeWidth={2} />
        <h2 className="font-serif text-xl font-medium leading-tight">
          {recomendacion.titulo}
        </h2>
      </div>

      {recomendacion.razones_a_favor.length > 0 && (
        <ReasonList
          label="A favor"
          tone="success"
          items={recomendacion.razones_a_favor}
        />
      )}
      {recomendacion.razones_riesgo.length > 0 && (
        <ReasonList
          label="A vigilar"
          tone="warning"
          items={recomendacion.razones_riesgo}
        />
      )}
      {recomendacion.razones_no.length > 0 && (
        <ReasonList
          label="En contra"
          tone="danger"
          items={recomendacion.razones_no}
        />
      )}

      {recomendacion.razones_a_favor.length === 0 &&
        recomendacion.razones_riesgo.length === 0 &&
        recomendacion.razones_no.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            La extracción no detectó suficiente información para evaluar
            automáticamente. Revisa el pliego original.
          </p>
        )}
    </div>
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
    <div className="mt-5">
      <p
        className={`text-[11px] font-semibold uppercase tracking-wider ${labelColor}`}
      >
        {label}
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((r, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
            <span>{r}</span>
          </li>
        ))}
      </ul>
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
