"use client";

import Link from "next/link";
import { SolvenciaResumen } from "@/components/empresa/SolvenciaResumen";

export default function SolvenciaResumenPage() {
  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow mb-2">Solvencia técnica calculada</p>
        <h2 className="font-serif text-lg font-medium">
          Anualidad media derivada de tus certificados
        </h2>
        <p className="mt-2 mb-6 max-w-2xl text-sm text-muted-foreground">
          KPIs calculados con tus certificados validados de los últimos
          5 años. Es lo que acreditas sin más papeleo en cualquier pliego
          que pida solvencia técnica por anualidad media (LCSP art. 88).
        </p>
        <SolvenciaResumen />
      </section>

      <section className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
        <p className="eyebrow">Solvencia económica declarada</p>
        <h2 className="font-serif text-lg font-medium">
          Volumen anual de los últimos tres ejercicios
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Esto NO se calcula con los certificados de obra: es la facturación
          total de cuentas anuales. Se introduce en{" "}
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
