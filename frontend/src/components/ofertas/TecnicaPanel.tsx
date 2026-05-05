"use client";

import { Construction } from "lucide-react";

interface Props {
  expediente: string;
  pctSubjetivos: number | null;
  motivo?: string;
}

/**
 * Panel "Memoria técnica" del workspace de ofertas.
 *
 * Hoy es placeholder porque M5 (redactor IA de memoria técnica) no se
 * ha construido todavía. Cuando esté, este componente alojará el flujo
 * completo: análisis del PCAP → secciones detectadas → redacción
 * por bloques → preview + .docx. Por ahora le explicamos al usuario que
 * tiene que aportar memoria técnica fuera del sistema y la juntará con
 * el resto de la oferta al subirla firmada.
 */
export function TecnicaPanel({ pctSubjetivos, motivo }: Props) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-amber-500/[0.06] p-7 ring-1 ring-amber-500/25 shadow-card">
        <div className="flex items-start gap-3">
          <Construction
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400"
            strokeWidth={2}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-1.5 text-amber-700 dark:text-amber-400">
              Memoria técnica · próximamente
            </p>
            <h2 className="font-display text-xl font-bold tracking-tight">
              {pctSubjetivos != null && pctSubjetivos > 0
                ? `Este pliego pondera juicio de valor en un ${pctSubjetivos.toFixed(0)}%`
                : "Memoria técnica del proyecto"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {motivo ??
                "El pliego exige memoria técnica además de la oferta económica."}{" "}
              El redactor con IA llega en una próxima versión.
            </p>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Mientras tanto, redacta tú la memoria con tu propia plantilla.
              Cuando la tengas firmada, súbela junto al resto de la oferta en
              el bloque{" "}
              <span className="font-semibold text-foreground">
                Presentación
              </span>{" "}
              al final de esta página.
            </p>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <p className="eyebrow mb-2">Mientras llega el redactor IA</p>
        <h3 className="font-display text-lg font-bold tracking-tight">
          Pasos típicos de la memoria técnica
        </h3>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-foreground">1.</span>
            <span>
              Lee bien la sección de criterios de juicio de valor del PCAP —
              suele indicar qué quiere ver el órgano (programa de trabajo,
              plan de calidad, mejoras, equipo asignado…).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-foreground">2.</span>
            <span>
              Estructura la memoria en los bloques que pide el pliego. No
              añadas más — el órgano valora lo que pide, no lo que decides
              tú aportar.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-foreground">3.</span>
            <span>
              Adapta cada bloque al objeto concreto de esta licitación. Las
              memorias copiadas de otras ofertas se notan y restan
              puntuación.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-foreground">4.</span>
            <span>
              Respeta el límite de páginas si lo hay. Excederlo puede
              suponer la inadmisión del bloque entero.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono font-semibold text-foreground">5.</span>
            <span>
              Guarda la memoria en PDF firmado y súbela en el bloque
              Presentación junto a declaración + oferta económica.
            </span>
          </li>
        </ol>
      </section>
    </div>
  );
}
