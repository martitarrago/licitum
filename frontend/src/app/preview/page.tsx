import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { LicitacionCard } from "@/components/ui/LicitacionCard";

// ─── Página solo para desarrollo ────────────────────────────────────────
// Scratchpad visual del componente LicitacionCard. No se enlaza desde la
// navegación pública; excluir antes del build de producción.

export const metadata: Metadata = {
  title: "Preview · LicitacionCard",
  robots: { index: false, follow: false },
};

type Licitacion = ComponentProps<typeof LicitacionCard>;

// 6 licitaciones ficticias pero plausibles del contexto catalán.
// Dos por cada estado del semáforo. Las fechas están escalonadas para
// mostrar el indicador "En X días" y, en una, la variante urgente (≤7 días).
const licitaciones: Licitacion[] = [
  // ── VERDE ────────────────────────────────────────────────────────────
  {
    titulo: "Rehabilitación energética del edificio consistorial",
    organismo: "Ajuntament de Reus",
    importe: 320000,
    fechaLimite: new Date(2026, 4, 18),
    semaforo: "verde",
    cpvs: ["45453000-7", "45321000-3"],
  },
  {
    titulo: "Mantenimiento integral de parques y zonas verdes municipales",
    organismo: "Ajuntament de Girona",
    importe: 185000,
    fechaLimite: new Date(2026, 5, 2),
    semaforo: "verde",
    cpvs: ["77313000-7", "77311000-3"],
  },

  // ── AMARILLO ─────────────────────────────────────────────────────────
  {
    titulo: "Ampliación del centro de atención primaria CAP Nord",
    organismo: "Servei Català de la Salut",
    importe: 1680000,
    fechaLimite: new Date(2026, 3, 29),
    semaforo: "amarillo",
    cpvs: ["45215100-8", "45300000-0"],
  },
  {
    titulo: "Mejora de la red de saneamiento del polígono industrial Can Parellada",
    organismo: "Ajuntament de Terrassa",
    importe: 925000,
    fechaLimite: new Date(2026, 4, 7),
    semaforo: "amarillo",
    cpvs: ["45232410-9", "45232440-8", "45233140-2"],
  },

  // ── ROJO ─────────────────────────────────────────────────────────────
  {
    titulo: "Construcción de aparcamiento subterráneo en la Plaça del Mercat",
    organismo: "Ajuntament de Lleida",
    importe: 4200000,
    fechaLimite: new Date(2026, 3, 23),
    semaforo: "rojo",
    cpvs: ["45223300-9", "45221250-9", "45262310-7"],
  },
  {
    titulo: "Obra civil del tramo Zona Universitària — línea 9 del metro",
    organismo: "Infraestructures.cat — Generalitat de Catalunya",
    importe: 12500000,
    fechaLimite: new Date(2026, 4, 12),
    semaforo: "rojo",
    cpvs: ["45234100-7", "45221240-6"],
  },
];

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent ring-1 ring-inset ring-accent/25">
            Desarrollo · no producción
          </span>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">
            Preview · LicitacionCard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Seis ejemplos cubriendo los tres estados del semáforo de solvencia.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-6">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {licitaciones.map((l) => (
            <LicitacionCard key={l.titulo} {...l} />
          ))}
        </div>
      </main>
    </div>
  );
}
