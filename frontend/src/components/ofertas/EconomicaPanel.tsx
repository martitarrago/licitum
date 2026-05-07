"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSignature,
  Info,
  Loader2,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  calculadoraApi,
  type CalculoResultado,
  type ContextoCalculadora,
  type OfertaListItem,
  type PuntoLabel,
  type PuntoReferencia,
} from "@/lib/api/calculadora";
import { useEmpresaId } from "@/lib/auth";

const FORMULA_LABELS: Record<string, string> = {
  lineal: "Lineal directa",
  proporcional_inversa: "Proporcional inversa",
  lineal_con_saciedad: "Lineal con umbral de saciedad",
  cuadratica: "Cuadrática",
  otra: "Otra (revisar pliego)",
  no_detectado: "No detectada en el pliego",
};

const REF_LABELS: Record<PuntoLabel, string> = {
  conservadora: "Conservadora",
  competitiva: "Competitiva",
  saciedad: "Saciedad",
  techo_legal: "Techo legal",
};

const REF_HINTS: Record<PuntoLabel, string> = {
  conservadora: "Mediana histórica",
  competitiva: "P90 histórico",
  saciedad: "Umbral del PCAP",
  techo_legal: "Margen de seguridad",
};

const REF_SHORT: Record<PuntoLabel, string> = {
  conservadora: "cons.",
  competitiva: "comp.",
  saciedad: "saciedad",
  techo_legal: "techo",
};

const FUENTE_LABELS: Record<string, string> = {
  pcap: "definido por el PCAP",
  lcsp_149: "estimado por LCSP 149.2",
  fallback: "fallback conservador",
};

const fmtEur = (v: number | null | undefined): string =>
  v == null || !isFinite(v)
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(v);

const fmtEurPrecise = (v: number | null | undefined): string =>
  v == null || !isFinite(v)
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2,
      }).format(v);

const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v == null ? "—" : `${v.toFixed(digits)}%`;

interface Props {
  expediente: string;
}

/**
 * Panel "Oferta económica" del workspace de ofertas.
 *
 * Encapsula calculadora con sliders en vivo, fórmula del pliego, intel
 * histórica del órgano, recomendación inteligente y guardar versión +
 * descargar .docx.
 */
export function EconomicaPanel({ expediente }: Props) {
  const empresaId = useEmpresaId();
  const qc = useQueryClient();

  const contexto = useQuery({
    queryKey: ["calc-contexto", expediente],
    queryFn: () => calculadoraApi.contexto(expediente),
    staleTime: 5 * 60 * 1000,
  });

  const versiones = useQuery({
    queryKey: ["oferta-economica-list", empresaId, expediente],
    queryFn: () => calculadoraApi.list(empresaId, expediente),
  });

  const [bajaPct, setBajaPct] = useState<number | null>(null);
  useEffect(() => {
    if (contexto.data && bajaPct === null) {
      const sugerido =
        contexto.data.recomendacion?.pct_sugerido ??
        contexto.data.intel?.baja_avg_pct ??
        10;
      setBajaPct(Number(sugerido.toFixed(1)));
    }
  }, [contexto.data, bajaPct]);

  const [calculo, setCalculo] = useState<CalculoResultado | null>(null);
  const [calculando, setCalculando] = useState(false);
  useEffect(() => {
    if (bajaPct == null || !contexto.data) return;
    setCalculando(true);
    const handler = setTimeout(async () => {
      try {
        const r = await calculadoraApi.calcular(expediente, bajaPct);
        setCalculo(r);
      } catch {
        // noop — error visual se omite en MVP
      } finally {
        setCalculando(false);
      }
    }, 200);
    return () => clearTimeout(handler);
  }, [bajaPct, contexto.data, expediente]);

  const guardar = useMutation({
    mutationFn: () =>
      calculadoraApi.generar(expediente, empresaId, bajaPct ?? 0),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["oferta-economica-list", empresaId, expediente],
      });
      qc.invalidateQueries({
        queryKey: ["oferta-economica-list", empresaId],
      });
      qc.invalidateQueries({ queryKey: ["ofertas-list", empresaId] });
    },
  });

  if (contexto.isLoading || bajaPct == null) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (contexto.isError || !contexto.data) {
    return (
      <div className="card flex flex-col items-center px-6 py-16 text-center">
        <XCircle className="h-10 w-10 text-danger" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-danger">
          No se pudo cargar el contexto del pliego
        </p>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          {contexto.error instanceof Error
            ? contexto.error.message
            : "Asegúrate de que el pliego ya está analizado por la IA."}
        </p>
        <Link
          href={`/pliegos/${encodeURIComponent(expediente)}`}
          className="mt-4 text-sm text-foreground underline"
        >
          Ir al análisis del pliego
        </Link>
      </div>
    );
  }

  const ctx = contexto.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <ContextoPliego ctx={ctx} />
        <ContextoCompetencia ctx={ctx} />
      </div>

      <RecomendacionPanel
        ctx={ctx}
        bajaPct={bajaPct}
        onUseSuggested={(v) => setBajaPct(v)}
      />

      <SliderYResultado
        ctx={ctx}
        bajaPct={bajaPct}
        onBajaChange={setBajaPct}
        calculo={calculo}
        calculando={calculando}
      />

      <AccionesGuardar
        bajaPct={bajaPct}
        canSave={!!calculo}
        guardando={guardar.isPending}
        onGuardar={() => guardar.mutate()}
        ultimaVersion={versiones.data?.[0] ?? null}
      />

      {(versiones.data?.length ?? 0) > 1 && (
        <HistoricoVersiones
          versiones={versiones.data ?? []}
          activaId={versiones.data?.[0]?.id ?? null}
        />
      )}
    </div>
  );
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function ContextoPliego({ ctx }: { ctx: ContextoCalculadora }) {
  const formula = ctx.formula_tipo
    ? FORMULA_LABELS[ctx.formula_tipo] ?? ctx.formula_tipo
    : "No detectada";

  return (
    <section className="card p-6">
      <p className="eyebrow mb-3">Lo que pide el pliego</p>
      <dl className="space-y-3 text-sm">
        <DataRow
          label="Presupuesto base"
          value={
            ctx.presupuesto_base ? (
              <span className="display-num text-xl font-bold text-foreground">
                {fmtEur(ctx.presupuesto_base)}
              </span>
            ) : (
              <span className="text-muted-foreground">No detectado</span>
            )
          }
        />
        <DataRow label="Fórmula económica" value={formula} />
        {ctx.umbral_saciedad_pct != null && (
          <DataRow
            label="Umbral de saciedad"
            value={`${ctx.umbral_saciedad_pct.toFixed(1)}%`}
          />
        )}
        {ctx.iva_pct != null && (
          <DataRow label="IVA aplicable" value={`${ctx.iva_pct.toFixed(0)}%`} />
        )}
        {ctx.plazo_ejecucion_meses != null && (
          <DataRow
            label="Plazo ejecución"
            value={`${ctx.plazo_ejecucion_meses} meses`}
          />
        )}
        {(ctx.pct_criterios_objetivos != null ||
          ctx.pct_criterios_subjetivos != null) && (
          <DataRow
            label="Ponderación"
            value={`Objetivos ${ctx.pct_criterios_objetivos ?? "—"}% · Subjetivos ${
              ctx.pct_criterios_subjetivos ?? "—"
            }%`}
          />
        )}
      </dl>
      {ctx.formula_extracto && (
        <details className="mt-4 group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Ver fórmula literal del PCAP ↓
          </summary>
          <blockquote className="mt-2 rounded-md bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-foreground/90">
            &ldquo;{ctx.formula_extracto}&rdquo;
          </blockquote>
        </details>
      )}
      {ctx.baja_temeraria_extracto && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Cláusula de baja temeraria ↓
          </summary>
          <blockquote className="mt-2 rounded-md bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-foreground/90">
            &ldquo;{ctx.baja_temeraria_extracto}&rdquo;
          </blockquote>
        </details>
      )}
    </section>
  );
}

function ContextoCompetencia({ ctx }: { ctx: ContextoCalculadora }) {
  const intel = ctx.intel;
  const sinDatos = !intel || intel.n_obs === 0;

  return (
    <section className="card p-6">
      <p className="eyebrow mb-3">Cómo se mueve la competencia</p>
      {sinDatos ? (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info
            className="mt-0.5 h-4 w-4 shrink-0"
            strokeWidth={2}
            aria-hidden="true"
          />
          <p>
            No tenemos histórico suficiente del órgano + CPV para esta
            licitación. La recomendación se basará solo en la fórmula del
            pliego y los umbrales legales.
          </p>
        </div>
      ) : (
        <dl className="space-y-3 text-sm">
          <DataRow
            label="Mediana histórica"
            value={
              <span className="display-num text-xl font-bold text-foreground">
                {fmtPct(intel.baja_median_pct ?? intel.baja_avg_pct)}
              </span>
            }
          />
          {intel.baja_p90_pct != null && (
            <DataRow
              label="P90 (top 10% más agresivos)"
              value={fmtPct(intel.baja_p90_pct)}
            />
          )}
          {intel.baja_avg_pct != null &&
            intel.baja_median_pct != null && (
              <DataRow label="Media" value={fmtPct(intel.baja_avg_pct)} />
            )}
          {intel.ofertes_avg != null && (
            <DataRow
              label="Ofertas medias por concurso"
              value={intel.ofertes_avg.toFixed(1)}
            />
          )}
          <DataRow
            label="Observaciones"
            value={`${intel.n_obs} adjudicaciones`}
          />
        </dl>
      )}
    </section>
  );
}

function RecomendacionPanel({
  ctx,
  bajaPct,
  onUseSuggested,
}: {
  ctx: ContextoCalculadora;
  bajaPct: number;
  onUseSuggested: (v: number) => void;
}) {
  const rec = ctx.recomendacion;
  const tieneSugerencia = rec.pct_sugerido != null;
  const isSinDatos = rec.confianza === "ninguna";
  const sugLabel = rec.pct_sugerido_label;

  return (
    <section
      className={`rounded-2xl p-6 ring-1 ${
        isSinDatos ? "bg-muted/30 ring-border" : "bg-info/5 ring-info/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <Sparkles
          className={`mt-0.5 h-5 w-5 shrink-0 ${
            isSinDatos ? "text-muted-foreground" : "text-info"
          }`}
          strokeWidth={2}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className={`eyebrow mb-1.5 ${isSinDatos ? "" : "text-info"}`}>
            Recomendación inteligente
          </p>
          {tieneSugerencia ? (
            <>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                Oferta sugerida:{" "}
                <span className="display-num">{fmtPct(rec.pct_sugerido)}</span>
              </h2>
              {sugLabel && (
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {REF_LABELS[sugLabel]}
                  </span>
                  {" — "}
                  {REF_HINTS[sugLabel]}
                </p>
              )}
            </>
          ) : (
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Decide tú la baja
            </h2>
          )}
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {rec.razonamiento}
          </p>
          {rec.advertencias.length > 0 && (
            <div className="mt-4 space-y-2">
              {rec.advertencias.map((adv, i) => (
                <div
                  key={i}
                  className="flex gap-2 rounded-lg bg-warning/10 px-3 py-2.5 ring-1 ring-warning/30"
                >
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                  <p className="text-xs leading-relaxed text-foreground/90">
                    {adv}
                  </p>
                </div>
              ))}
            </div>
          )}
          {tieneSugerencia && rec.pct_sugerido != null && (
            <button
              onClick={() => onUseSuggested(rec.pct_sugerido!)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-85"
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
              Usar oferta sugerida
            </button>
          )}
          {rec.referencias.length > 1 && (
            <div className="mt-6">
              <p className="eyebrow mb-2.5">Otras referencias</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {rec.referencias.map((r) => (
                  <ReferenciaCard
                    key={r.label}
                    refPunto={r}
                    onClick={() => onUseSuggested(r.pct)}
                    isActive={Math.abs(bajaPct - r.pct) < 0.5}
                  />
                ))}
              </div>
            </div>
          )}
          {rec.techo_temerario_pct != null && rec.techo_temerario_fuente && (
            <p className="mt-4 text-[11px] text-muted-foreground">
              Umbral temerario:{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {rec.techo_temerario_pct.toFixed(1)}%
              </span>{" "}
              ({FUENTE_LABELS[rec.techo_temerario_fuente] ??
                rec.techo_temerario_fuente})
              {rec.peso_precio_pct != null && (
                <>
                  {" · "}precio pondera{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {rec.peso_precio_pct.toFixed(0)}%
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function ReferenciaCard({
  refPunto,
  onClick,
  isActive,
}: {
  refPunto: PuntoReferencia;
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={refPunto.descripcion}
      className={`group rounded-xl px-3 py-2.5 text-left ring-1 transition-all hover:ring-foreground/40 ${
        isActive
          ? "bg-foreground/[0.04] ring-foreground/50"
          : "bg-surface ring-border"
      }`}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {REF_LABELS[refPunto.label]}
        {refPunto.es_default && (
          <span className="rounded bg-foreground/10 px-1 py-0.5 text-[9px] normal-case tracking-normal text-foreground">
            sugerida
          </span>
        )}
      </p>
      <p className="display-num mt-0.5 text-lg font-bold tabular-nums text-foreground">
        {refPunto.pct.toFixed(1)}%
      </p>
      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
        {REF_HINTS[refPunto.label]}
      </p>
    </button>
  );
}

function SliderYResultado({
  ctx,
  bajaPct,
  onBajaChange,
  calculo,
  calculando,
}: {
  ctx: ContextoCalculadora;
  bajaPct: number;
  onBajaChange: (v: number) => void;
  calculo: CalculoResultado | null;
  calculando: boolean;
}) {
  const thresholdPct =
    ctx.recomendacion.techo_temerario_pct ??
    ctx.temeraria_estimada?.threshold_pct ??
    null;
  const max = useMemo(
    () =>
      thresholdPct != null
        ? Math.max(35, Math.ceil(thresholdPct * 1.3))
        : 35,
    [thresholdPct],
  );
  const pos = (pct: number) => Math.min(100, Math.max(0, (pct / max) * 100));

  const refs = ctx.recomendacion.referencias;
  const conservadora = refs.find((r) => r.label === "conservadora");
  const techoLegal = refs.find((r) => r.label === "techo_legal");
  const consPos = conservadora ? pos(conservadora.pct) : 0;
  const techoPos =
    techoLegal != null
      ? pos(techoLegal.pct)
      : thresholdPct != null
        ? pos(thresholdPct - 2)
        : null;
  const tempPos = thresholdPct != null ? pos(thresholdPct) : null;

  // 3 zonas: 0→conservadora (success), conservadora→techo (warning), techo→max (danger).
  // Si no hay threshold, el track es neutro — no inventamos zona roja.
  const trackStyle: React.CSSProperties =
    techoPos != null
      ? {
          background: `linear-gradient(to right,
      rgb(22 163 74 / 0.14) 0%,
      rgb(22 163 74 / 0.14) ${consPos}%,
      rgb(202 138 4 / 0.18) ${consPos}%,
      rgb(202 138 4 / 0.18) ${techoPos}%,
      rgb(220 38 38 / 0.20) ${techoPos}%,
      rgb(220 38 38 / 0.20) 100%)`,
        }
      : {
          background: "hsl(var(--muted) / 0.6)",
        };

  const nivel = calculo?.nivel_riesgo ?? "seguro";
  const RiesgoIcon =
    nivel === "temerario"
      ? XCircle
      : nivel === "atencion"
        ? AlertTriangle
        : nivel === "no_estimable"
          ? Info
          : CheckCircle2;
  const riesgoColors: Record<string, string> = {
    seguro: "bg-success/10 ring-success/25 text-success",
    atencion: "bg-warning/10 ring-warning/25 text-warning",
    temerario: "bg-danger/10 ring-danger/25 text-danger",
    no_estimable: "bg-muted/50 ring-border text-muted-foreground",
  };

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow mb-1.5">Tu oferta</p>
          <h2 className="font-display text-xl font-bold tracking-tight">
            Cálculo en vivo
          </h2>
        </div>
        {calculando && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            actualizando…
          </span>
        )}
      </div>

      <div className="mt-5 px-1">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Baja propuesta
          </span>
          <span className="display-num text-3xl font-bold tabular-nums text-foreground">
            {bajaPct.toFixed(2)}%
          </span>
        </div>
        <div className="relative h-7">
          {/* Track propio con zonas (success/warning/danger) */}
          <div
            className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full ring-1 ring-border/60"
            style={trackStyle}
          />
          {/* Línea vertical fina marcando el umbral temerario exacto */}
          {tempPos != null && (
            <div
              className="pointer-events-none absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-danger/60"
              style={{ left: `${tempPos}%` }}
              aria-hidden="true"
            />
          )}
          <input
            type="range"
            min={0}
            max={max}
            step={0.25}
            value={bajaPct}
            onChange={(e) => onBajaChange(Number(e.target.value))}
            className="slider-zoned absolute inset-0"
            aria-label="% de baja sobre el presupuesto base"
          />
        </div>

        {/* Marcas por referencia debajo del slider */}
        <div className="relative mt-2 h-12">
          {refs.map((r) => (
            <ReferenceMark
              key={r.label}
              refPunto={r}
              positionPct={pos(r.pct)}
              isActive={Math.abs(bajaPct - r.pct) < 0.5}
              onClick={() => onBajaChange(r.pct)}
            />
          ))}
        </div>

        <div className="mt-3 flex justify-between text-[11px] text-muted-foreground">
          <span>0%</span>
          <span>{max}%</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ResultadoBox
          label="Importe ofertado (sin IVA)"
          value={fmtEurPrecise(calculo?.importe_ofertado)}
          big
        />
        <ResultadoBox
          label="Importe total con IVA"
          value={fmtEurPrecise(calculo?.importe_total)}
        />
        <ResultadoBox
          label="Puntos económicos estimados"
          value={
            calculo?.puntos_estimados != null
              ? `${calculo.puntos_estimados.toFixed(1)} / ${calculo.puntos_max_referencia ?? 100}`
              : "—"
          }
          hint={
            ctx.formula_tipo === "no_detectado" || ctx.formula_tipo === "otra"
              ? "Sin fórmula clara — estimación no disponible"
              : "Estimado según fórmula del pliego"
          }
        />
        <ResultadoBox
          label="Frente a baja media"
          value={
            calculo?.diff_vs_baja_media != null
              ? `${calculo.diff_vs_baja_media >= 0 ? "+" : ""}${calculo.diff_vs_baja_media.toFixed(1)} pp`
              : "—"
          }
          hint={
            calculo?.diff_vs_baja_media != null && calculo.diff_vs_baja_media >= 0
              ? "Por encima de la media histórica"
              : "Por debajo de la media histórica"
          }
        />
      </div>

      <div
        className={`mt-5 flex items-start gap-3 rounded-xl p-4 ring-1 ${riesgoColors[nivel]}`}
      >
        <RiesgoIcon className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold capitalize">
            {nivel === "seguro"
              ? "Margen seguro"
              : nivel === "atencion"
                ? "Atención — cerca del umbral temerario"
                : nivel === "temerario"
                  ? "Baja temeraria"
                  : "Riesgo no estimable"}
          </p>
          <p className="mt-0.5 text-sm">
            {calculo?.nota_riesgo ??
              "Mueve el slider para ver la valoración del riesgo."}
          </p>
        </div>
      </div>
    </section>
  );
}

function ReferenceMark({
  refPunto,
  positionPct,
  isActive,
  onClick,
}: {
  refPunto: PuntoReferencia;
  positionPct: number;
  isActive: boolean;
  onClick: () => void;
}) {
  const tickColor = refPunto.es_temerario
    ? "bg-danger"
    : refPunto.es_default
      ? "bg-foreground"
      : "bg-foreground/40";
  return (
    <button
      type="button"
      onClick={onClick}
      title={refPunto.descripcion}
      className="group absolute top-0 -translate-x-1/2 flex flex-col items-center cursor-pointer"
      style={{ left: `${positionPct}%` }}
    >
      <span
        className={`block h-2 w-px ${tickColor} transition-all group-hover:h-3`}
      />
      <span
        className={`mt-1 whitespace-nowrap text-[10px] font-medium uppercase tracking-wider ${
          isActive
            ? "text-foreground"
            : "text-muted-foreground group-hover:text-foreground"
        }`}
      >
        {REF_SHORT[refPunto.label]}
      </span>
      <span
        className={`whitespace-nowrap text-[10px] font-bold tabular-nums ${
          isActive ? "text-foreground" : "text-foreground/70"
        }`}
      >
        {refPunto.pct.toFixed(1)}%
      </span>
    </button>
  );
}

function ResultadoBox({
  label,
  value,
  hint,
  big,
}: {
  label: string;
  value: string;
  hint?: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-xl bg-surface-raised p-4 ring-1 ring-border">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 display-num font-bold tabular-nums text-foreground ${
          big ? "text-2xl" : "text-lg"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function AccionesGuardar({
  bajaPct,
  canSave,
  guardando,
  onGuardar,
  ultimaVersion,
}: {
  bajaPct: number;
  canSave: boolean;
  guardando: boolean;
  onGuardar: () => void;
  ultimaVersion: OfertaListItem | null;
}) {
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1.5">Guardar versión</p>
          <h2 className="font-display text-xl font-bold tracking-tight">
            Congela este escenario
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Guarda la baja actual ({bajaPct.toFixed(2)}%) como una versión del
            histórico. Genera el documento de proposición económica
            descargable en .docx para editar y firmar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ultimaVersion && (
            <a
              href={calculadoraApi.docxUrl(ultimaVersion.id)}
              download
              className="btn-secondary"
            >
              <Download className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              Descargar última .docx
            </a>
          )}
          <button
            onClick={onGuardar}
            disabled={!canSave || guardando}
            className="btn-primary disabled:opacity-50"
          >
            {guardando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" strokeWidth={2} />
            )}
            Guardar versión
          </button>
        </div>
      </div>
      {ultimaVersion && (
        <p className="mt-4 text-xs text-muted-foreground">
          Última versión guardada:{" "}
          <span className="font-medium text-foreground">
            baja {parseFloat(ultimaVersion.baja_pct).toFixed(2)}% · oferta{" "}
            {fmtEurPrecise(parseFloat(ultimaVersion.importe_ofertado))}
          </span>
          {" — "}
          <Link
            href={`/oferta-economica/${ultimaVersion.id}`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            ver preview
          </Link>
        </p>
      )}
    </section>
  );
}

function HistoricoVersiones({
  versiones,
  activaId,
}: {
  versiones: OfertaListItem[];
  activaId: string | null;
}) {
  return (
    <section className="card p-6">
      <p className="eyebrow mb-1.5">Histórico de versiones</p>
      <h2 className="font-display text-xl font-bold tracking-tight">
        {versiones.length} escenarios guardados
      </h2>
      <ul className="mt-5 divide-y divide-border">
        {versiones.map((it) => {
          const importe = parseFloat(it.importe_ofertado);
          const baja = parseFloat(it.baja_pct);
          return (
            <li
              key={it.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <span className="display-num text-base font-bold tabular-nums text-foreground">
                    {baja.toFixed(2)}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    → {fmtEurPrecise(importe)}
                  </span>
                  {it.id === activaId && (
                    <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      Activa
                    </span>
                  )}
                  {it.entra_en_temeraria && (
                    <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-danger">
                      Temeraria
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(it.created_at).toLocaleString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={calculadoraApi.docxUrl(it.id)}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border transition-colors hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={2} />
                  .docx
                </a>
                <Link
                  href={`/oferta-economica/${it.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-border transition-colors hover:bg-muted"
                >
                  <FileSignature className="h-3.5 w-3.5" strokeWidth={2} />
                  Preview
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-full sm:w-44 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-foreground">{value}</dd>
    </div>
  );
}
