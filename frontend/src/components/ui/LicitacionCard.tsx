import { ScoreChip } from "./ScoreChip";

type Semaforo = "verde" | "amarillo" | "rojo";

interface LicitacionCardProps {
  titulo: string;
  organismo: string;
  importe: number;
  fechaLimite: Date;
  semaforo: Semaforo;
  cpvs: string[];
  /** Razón explicativa generada por el evaluator de solvencia. */
  razon?: string | null;
  /** Afinidad histórica 0-1. ≥0.7 implica match de organismo; 0.3-0.7 implica match de CPV. */
  afinidad?: number | null;
  /** Score de ganabilidad 0-100 del motor PSCP+M2. Si está, eclipsa el semáforo. */
  score?: number | null;
  /** Frase corta del breakdown — la mejor o la más débil señal. */
  highlight?: string | null;
  /** % de completeness M2 — para subrayar atenuación si falta info. */
  completeness?: number | null;
}

function afinidadInfo(score: number | null | undefined): string | null {
  if (score == null || score < 0.3) return null;
  if (score >= 0.7) return "Cliente conocido";
  return "Tipo de obra similar";
}

interface SemaforoStyle {
  label: string;
  stripe: string;
  badgeBg: string;
  badgeRing: string;
  textColor: string;
}

// El badge se simplifica a texto + pildora en color del semáforo (sutil),
// sin icono. El color comunica el estado por sí solo.
const semaforoStyles: Record<Semaforo, SemaforoStyle> = {
  verde: {
    label: "Cumple solvencia",
    stripe: "bg-success",
    badgeBg: "bg-success/10",
    badgeRing: "ring-success/25",
    textColor: "text-success",
  },
  amarillo: {
    label: "Solvencia ajustada",
    stripe: "bg-warning",
    badgeBg: "bg-warning/10",
    badgeRing: "ring-warning/25",
    textColor: "text-warning",
  },
  rojo: {
    label: "No cumple solvencia",
    stripe: "bg-danger",
    badgeBg: "bg-danger/10",
    badgeRing: "ring-danger/25",
    textColor: "text-danger",
  },
};

const importeFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const fechaFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function diasHasta(fecha: Date): number {
  const ms = fecha.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function textoDiasRestantes(dias: number): string {
  if (dias < 0) return "Cerrada";
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}

export function LicitacionCard({
  titulo,
  organismo,
  importe,
  fechaLimite,
  semaforo,
  cpvs,
  razon,
  afinidad,
  score,
  highlight,
  completeness,
}: LicitacionCardProps) {
  const estilo = semaforoStyles[semaforo];
  const dias = diasHasta(fechaLimite);
  const urgente = dias >= 0 && dias <= 7;
  const cerrada = dias < 0;
  const afinidadTexto = afinidadInfo(afinidad ?? null);
  const hasScore = typeof score === "number";

  return (
    <article className="card-interactive group relative flex overflow-hidden">
      {/* Franja izquierda: score si hay, fallback al semáforo */}
      <div
        className={`w-1.5 flex-shrink-0 ${
          hasScore
            ? score >= 70
              ? "bg-success"
              : score >= 40
                ? "bg-warning"
                : "bg-muted"
            : estilo.stripe
        }`}
        aria-hidden="true"
      />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Header: ScoreChip eclipsa el semáforo cuando existe */}
        <div className="space-y-1.5">
          {hasScore ? (
            <div className="flex items-center justify-between gap-2">
              <ScoreChip score={score!} variant="sm" />
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${estilo.badgeBg} ${estilo.badgeRing} ${estilo.textColor}`}
                title={razon ?? undefined}
              >
                <span className={`h-1 w-1 rounded-full ${estilo.stripe}`} aria-hidden="true" />
                {semaforo === "verde" ? "OK" : semaforo === "amarillo" ? "Ajustada" : "Limita"}
              </span>
            </div>
          ) : (
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ${estilo.badgeBg} ${estilo.badgeRing} ${estilo.textColor}`}
              role="status"
              title={razon ?? undefined}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${estilo.stripe}`} aria-hidden="true" />
              {estilo.label}
            </div>
          )}

          {/* Highlight (preferido) o razón del semáforo */}
          {highlight ? (
            <p
              className="line-clamp-2 text-[11.5px] leading-snug text-foreground/80"
              title={highlight}
            >
              {highlight}
            </p>
          ) : razon ? (
            <p
              className="line-clamp-2 text-[11px] leading-snug text-muted-foreground"
              title={razon}
            >
              {razon}
            </p>
          ) : null}
        </div>

        {/* Título + organismo */}
        <div className="space-y-1">
          <h3 className="line-clamp-2 font-display text-[17px] font-semibold leading-snug tracking-tight text-foreground">
            {titulo}
          </h3>
          <p className="truncate text-sm text-muted-foreground">{organismo}</p>
          {afinidadTexto && (
            <p
              className="text-[11px] font-medium uppercase tracking-wider text-foreground"
              title={`Afinidad histórica: ${afinidad?.toFixed(2)}`}
            >
              · {afinidadTexto}
            </p>
          )}
        </div>

        {/* Datos clave — importe + fecha */}
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <div>
            <div className="eyebrow mb-1">Importe</div>
            <div className="display-num text-xl text-foreground">
              {importeFormatter.format(importe)}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-1">Cierra</div>
            <div className="text-sm font-medium tabular-nums text-foreground">
              {fechaFormatter.format(fechaLimite)}
            </div>
            <div
              className={`mt-0.5 text-xs tabular-nums ${
                cerrada
                  ? "text-muted-foreground"
                  : urgente
                    ? "font-semibold text-danger"
                    : "text-muted-foreground"
              }`}
            >
              {textoDiasRestantes(dias)}
            </div>
          </div>
        </div>

        {/* CPVs — chips mono sin iconos */}
        {cpvs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cpvs.map((cpv) => (
              <span
                key={cpv}
                className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10.5px] tracking-tight text-muted-foreground"
              >
                {cpv}
              </span>
            ))}
          </div>
        )}

        {/* Footer con completeness — sutil */}
        {hasScore && typeof completeness === "number" && completeness < 80 && (
          <p
            className="border-t border-border pt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70"
            title={`Score basado en ${completeness}% de tu perfil M2 — completar mejora la precisión.`}
          >
            Precisión {completeness}%
          </p>
        )}
      </div>
    </article>
  );
}

// ─── Ejemplo de uso ─────────────────────────────────────────────────────

export function LicitacionCardExample() {
  return (
    <div className="mx-auto grid max-w-md gap-4 p-8">
      <LicitacionCard
        titulo="Reforma integral del pabellón deportivo municipal"
        organismo="Ajuntament de Sant Cugat del Vallès"
        importe={487500}
        fechaLimite={new Date(2026, 4, 15)}
        semaforo="verde"
        cpvs={["45212200-8", "45310000-3"]}
      />
      <LicitacionCard
        titulo="Pavimentación y mejora de aceras en el barrio de Gràcia"
        organismo="Àrea Metropolitana de Barcelona"
        importe={1245800}
        fechaLimite={new Date(2026, 3, 22)}
        semaforo="amarillo"
        cpvs={["45233252-0", "45233222-1", "45112500-0"]}
      />
      <LicitacionCard
        titulo="Construcción de nueva escuela de educación infantil CEIP Les Corts"
        organismo="Generalitat de Catalunya — Departament d'Educació"
        importe={3850000}
        fechaLimite={new Date(2026, 4, 19)}
        semaforo="rojo"
        cpvs={["45214210-5", "45300000-0", "45400000-1"]}
      />
    </div>
  );
}
