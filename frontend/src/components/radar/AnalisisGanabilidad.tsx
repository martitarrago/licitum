"use client";

// Bloque hero del detalle de licitación: score grande + 6 barras de señales
// + hard filters auditables. Sustituye al semáforo como elemento principal.

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { intelApi, type SignalBreakdown, type HardFilter } from "@/lib/api/intel";
import { ScoreChip } from "@/components/ui/ScoreChip";
import { scoreTier } from "@/lib/scoreTier";

interface Props {
  licitacionId: string;
  empresaId: string;
}

const SIGNAL_LABEL: Record<string, string> = {
  competencia_esperada: "Competencia esperada",
  concentracion_organo: "Concentración del órgano",
  encaje_tecnico: "Encaje técnico",
  encaje_geografico: "Encaje geográfico",
  preferencias_match: "Preferencias declaradas",
  baja_factible: "Baja factible",
};

const HARD_FILTER_LABEL: Record<string, string> = {
  estado_aceptacion: "Estado de aceptación",
  clasificacion: "Clasificación ROLECE/RELIC",
  solvencia: "Solvencia económica",
  presupuesto: "Rango de presupuesto",
  capacidad: "Capacidad simultánea",
  preferencia_cpv: "Preferencia CPV",
  documentacion: "Documentación al día",
};

function dataQualityIndicator(q: string) {
  if (q === "completa") return { dot: "bg-success", label: "Completa" };
  if (q === "parcial") return { dot: "bg-warning", label: "Parcial" };
  return { dot: "bg-muted-foreground/50", label: "Faltante" };
}


function SignalRow({ s }: { s: SignalBreakdown }) {
  const dq = dataQualityIndicator(s.data_quality);
  const pctValue = Math.round(s.value * 100);
  const pctContrib = s.contribution.toFixed(1);
  // Cada barra se colorea por su propio valor (0-100), no por el score global.
  // Mismos 4 tiers: ≥80 azul · ≥65 verde · ≥50 ámbar · <50 rojo.
  const barColor = scoreTier(pctValue).bg;

  return (
    <div className="space-y-1.5 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-1.5 w-1.5 rounded-full ${dq.dot}`} aria-hidden="true" title={dq.label} />
          <span className="truncate text-sm font-medium text-foreground">
            {SIGNAL_LABEL[s.name] ?? s.name}
          </span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
          <span className="text-xs text-muted-foreground">peso {(s.weight * 100).toFixed(0)}%</span>
          <span className="font-display text-sm font-semibold text-foreground">+{pctContrib}</span>
        </div>
      </div>

      {/* Barra */}
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${pctValue}%` }}
        />
      </div>

      <p className="text-[12.5px] leading-snug text-muted-foreground">{s.explanation}</p>
    </div>
  );
}

function HardFilterRow({ f }: { f: HardFilter }) {
  return (
    <li className="flex items-start gap-2 py-1.5 text-xs">
      {f.fail ? (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-danger mt-0.5" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success mt-0.5" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <span className={`font-medium ${f.fail ? "text-danger" : "text-foreground"}`}>
          {HARD_FILTER_LABEL[f.name] ?? f.name}
        </span>
        <span className="ml-2 text-muted-foreground">{f.reason}</span>
      </div>
    </li>
  );
}

export function AnalisisGanabilidad({ licitacionId, empresaId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["intel", "score-detail", licitacionId, empresaId],
    queryFn: () => intelApi.scoreDetail(licitacionId, empresaId),
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <section className="card animate-pulse p-6">
        <div className="mb-4 h-12 w-32 rounded-lg bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted/50" />
          ))}
        </div>
      </section>
    );
  }

  if (isError || !data) {
    // Si todavía no se ha calculado el score (empresa nueva, primer cron),
    // mostramos un estado informativo en vez de error duro.
    return (
      <section className="card p-6">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Análisis de ganabilidad pendiente
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Las puntuaciones se calculan cada mañana. Los resultados aparecerán
              en el próximo ciclo (07:15 Madrid).
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-6 animate-fade-up">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <ScoreChip score={data.score} variant="xl" />
          <div className="space-y-1">
            <p className="eyebrow">Ganabilidad</p>
            <p className="text-sm text-muted-foreground">
              Confianza{" "}
              <span className="font-medium text-foreground">{data.confidence}</span>{" "}
              · Precisión{" "}
              <span className="font-medium text-foreground">
                {data.data_completeness_pct}%
              </span>
            </p>
            {data.descartada && data.reason_descarte && (
              <p className="mt-2 max-w-md rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/20">
                <strong>Descartada:</strong> {data.reason_descarte}
              </p>
            )}
          </div>
        </div>
        {data.computed_at && (
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            Calculado{" "}
            {new Date(data.computed_at).toLocaleString("es-ES", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </header>

      {/* Hard filters — auditoría rápida */}
      <div className="mb-5 rounded-lg bg-surface px-4 py-3 ring-1 ring-border">
        <p className="eyebrow mb-2">Requisitos básicos</p>
        <ul className="space-y-0.5">
          {data.hard_filters.map((f) => (
            <HardFilterRow key={f.name} f={f} />
          ))}
        </ul>
      </div>

      {/* Señales con barras */}
      <div>
        <p className="eyebrow mb-3">Análisis del motor</p>
        <div className="divide-y divide-border">
          {data.breakdown.map((s) => (
            <SignalRow key={s.name} s={s} />
          ))}
        </div>
      </div>
    </section>
  );
}
