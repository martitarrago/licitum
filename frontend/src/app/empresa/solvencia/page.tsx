"use client";

export default function SolvenciaResumenPage() {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
        <p className="eyebrow">Solvencia técnica calculada</p>
        <h2 className="font-serif text-lg font-medium">
          Anualidad media derivada de tus certificados
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          KPI calculado automáticamente con tus certificados de obra
          validados. Pendiente de pintar — el endpoint{" "}
          <code className="mx-1 rounded bg-surface px-1 py-0.5 font-mono text-xs">
            /api/v1/empresa/certificados/resumen-solvencia
          </code>{" "}
          ya lo expone.
        </p>
      </section>

      <section className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
        <p className="eyebrow">Solvencia económica declarada</p>
        <h2 className="font-serif text-lg font-medium">
          Volumen anual de los últimos tres ejercicios
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Esto NO se calcula con tus certificados: es la facturación total de
          cuentas anuales. Hoy se introduce a mano en Identidad; pendiente de
          añadir autocompletar desde CIF (Insight View).
        </p>
      </section>
    </div>
  );
}
