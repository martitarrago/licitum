// Chip visual del score 0-100. Tamaño + color por bucket.
// Variantes: 'sm' para card de feed, 'lg' para hero, 'xl' para detalle.

type Variant = "sm" | "lg" | "xl";

interface Props {
  score: number;
  variant?: Variant;
  className?: string;
}

function scoreBucket(score: number): {
  bg: string;
  ring: string;
  text: string;
  label: string;
} {
  if (score >= 70) {
    return {
      bg: "bg-success/10",
      ring: "ring-success/30",
      text: "text-success",
      label: "Ganable",
    };
  }
  if (score >= 40) {
    return {
      bg: "bg-warning/10",
      ring: "ring-warning/30",
      text: "text-warning",
      label: "Marginal",
    };
  }
  return {
    bg: "bg-muted",
    ring: "ring-border",
    text: "text-muted-foreground",
    label: "Bajo",
  };
}

const variantStyles: Record<Variant, { container: string; number: string; over: string }> = {
  sm: {
    container: "rounded-full px-2.5 py-1 gap-1.5",
    number: "font-display text-base font-bold tabular-nums leading-none",
    over: "text-[9px] font-medium uppercase tracking-wider opacity-60",
  },
  lg: {
    container: "rounded-xl px-4 py-2.5 gap-2",
    number: "font-display text-3xl font-bold tabular-nums leading-none",
    over: "text-[10px] font-medium uppercase tracking-wider opacity-60",
  },
  xl: {
    container: "rounded-2xl px-6 py-4 gap-3",
    number: "font-display text-5xl font-bold tabular-nums leading-none",
    over: "text-xs font-medium uppercase tracking-wider opacity-60",
  },
};

export function ScoreChip({ score, variant = "sm", className = "" }: Props) {
  const bucket = scoreBucket(score);
  const v = variantStyles[variant];
  return (
    <div
      className={`inline-flex items-baseline ring-1 ring-inset ${bucket.bg} ${bucket.ring} ${bucket.text} ${v.container} ${className}`}
      role="status"
      aria-label={`Score ${score} de 100 — ${bucket.label}`}
    >
      <span className={v.number}>{score}</span>
      <span className={v.over}>/100</span>
    </div>
  );
}
