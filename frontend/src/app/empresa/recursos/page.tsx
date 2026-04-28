"use client";

const KPIS: { label: string; valor: string; nota: string }[] = [
  { label: "Personal técnico", valor: "—", nota: "jefes obra · encargados · PRL · técnicos" },
  { label: "Maquinaria", valor: "—", nota: "equipos propios · leasing · alquiler" },
  { label: "Sistemas de gestión", valor: "—", nota: "ISOs · planes propios · CAE" },
  { label: "Obras destacadas", valor: "—", nota: "subset narrado para Sobre B" },
];

export default function RecursosResumenPage() {
  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Backend en producción tras migración 0018. La UI de cada bloque
        empieza a poblarse en sprint 4 — junto con los pilotos catalanes
        que validen granularidad de personal y maquinaria.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl bg-surface-raised p-5 ring-1 ring-border"
          >
            <p className="eyebrow">{k.label}</p>
            <p className="display-num mt-2 text-3xl">{k.valor}</p>
            <p className="mt-1 text-xs text-muted-foreground">{k.nota}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
