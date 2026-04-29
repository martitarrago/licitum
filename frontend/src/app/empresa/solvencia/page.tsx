"use client";

import Link from "next/link";
import { SolvenciaResumen } from "@/components/empresa/SolvenciaResumen";

export default function SolvenciaResumenPage() {
  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow mb-2">Solvencia técnica · LCSP art. 88</p>
        <h2 className="font-serif text-lg font-medium">
          Obra ejecutada por año (calculada con tus certificados)
        </h2>
        <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">
          Importe medio de obra que has ejecutado al año en los últimos
          5 años, calculado a partir de tus certificados validados. Es la
          cifra que acreditas en pliegos que piden solvencia técnica por
          anualidad media de obra similar.
        </p>
        <SolvenciaResumen />
      </section>

      <section className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
        <p className="eyebrow">Solvencia económica · LCSP art. 87</p>
        <h2 className="font-serif text-lg font-medium">
          Volumen anual de negocio (cuentas anuales)
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Es tu <strong>facturación total</strong> declarada en cuentas
          anuales — no se calcula con certificados de obra. Se introduce a
          mano en{" "}
          <Link
            href="/empresa/perfil"
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Identidad
          </Link>
          ; pendiente de añadir autocompletar desde CIF (Insight View).
        </p>
      </section>
    </div>
  );
}
