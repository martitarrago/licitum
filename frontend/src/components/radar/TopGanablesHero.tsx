"use client";

// Hero del Radar: cards XL para las licitaciones top según el motor.
// Threshold dinámico: score ≥70 o las 5 mejores, lo que dé menos.

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { intelApi, type ScoreCard } from "@/lib/api/intel";
import { ScoreChip } from "@/components/ui/ScoreChip";

interface Props {
  empresaId: string;
}

const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const fechaFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function HeroCard({ item }: { item: ScoreCard }) {
  const dias = diasHasta(item.fecha_limite);
  const urgente = dias !== null && dias >= 0 && dias <= 7;

  return (
    <Link
      href={`/radar/${encodeURIComponent(item.expediente)}`}
      className="card-interactive group relative flex flex-col gap-5 p-6 outline-none transition-all hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-foreground/30"
    >
      {/* Score + badge confianza */}
      <div className="flex items-start justify-between gap-3">
        <ScoreChip score={item.score} variant="lg" />
        <span
          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
          title={`Puntuación basada en ${item.data_completeness_pct}% de tu perfil`}
        >
          {item.confidence === "alta"
            ? "Alta confianza"
            : item.confidence === "media"
              ? "Confianza media"
              : "Baja confianza"}
        </span>
      </div>

      {/* Highlight enfatizado — la frase más reveladora */}
      {item.highlight && (
        <p className="font-display text-base font-medium leading-snug text-foreground">
          {item.highlight}
        </p>
      )}

      {/* Título + organismo */}
      <div className="space-y-1">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
          {item.titulo ?? item.expediente}
        </h3>
        <p className="truncate text-sm text-muted-foreground">
          {item.organismo ?? "Organismo desconocido"}
        </p>
      </div>

      {/* Importe + cierra */}
      <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div>
          <div className="eyebrow mb-1">Importe</div>
          <div className="display-num text-xl text-foreground">
            {item.importe_licitacion != null
              ? importeFormatter.format(item.importe_licitacion)
              : "—"}
          </div>
        </div>
        <div>
          <div className="eyebrow mb-1">Cierra</div>
          <div className="text-sm font-medium tabular-nums text-foreground">
            {item.fecha_limite ? fechaFormatter.format(new Date(item.fecha_limite)) : "—"}
          </div>
          {dias !== null && (
            <div
              className={`mt-0.5 text-xs tabular-nums ${
                urgente ? "font-semibold text-danger" : "text-muted-foreground"
              }`}
            >
              {dias < 0
                ? "Cerrada"
                : dias === 0
                  ? "Hoy"
                  : dias === 1
                    ? "Mañana"
                    : `En ${dias} días`}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function TopGanablesHero({ empresaId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["intel", "top-ganables", empresaId],
    queryFn: () => intelApi.topGanables({ empresa_id: empresaId, limit: 5, min_score: 50 }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <section className="mb-10 animate-fade-up">
        <header className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-foreground" aria-hidden="true" />
          <h2 className="display-h text-lg sm:text-xl">hoy para ti</h2>
        </header>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-64 animate-pulse rounded-xl bg-surface-raised ring-1 ring-border"
            />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return null; // Silencioso — el feed completo absorbe el error
  }

  const items = (data?.items ?? []).filter((i) => i.score >= 70).slice(0, 5);
  // Si no hay ninguno con score≥70, mostramos los 3 con score≥50 más altos
  const fallback = items.length === 0 ? (data?.items ?? []).slice(0, 3) : [];
  const display = items.length > 0 ? items : fallback;

  if (display.length === 0) {
    return null; // No hay nada destacable — frontend cae directo al feed
  }

  const titulo =
    items.length > 0
      ? "hoy para ti"
      : "lo más cercano a ganable";
  const subtitle =
    items.length > 0
      ? `${items.length} licitaci${items.length === 1 ? "ón" : "ones"} con puntuación ≥70 según el motor`
      : "Sin obras con puntuación 70+ hoy. Estas son las más cercanas:";

  return (
    <section className="mb-10 animate-fade-up">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-foreground" aria-hidden="true" />
          <h2 className="display-h text-lg sm:text-xl">{titulo}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </header>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {display.map((item) => (
          <HeroCard key={item.licitacion_id} item={item} />
        ))}
      </div>
    </section>
  );
}
