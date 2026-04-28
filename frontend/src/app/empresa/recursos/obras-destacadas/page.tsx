"use client";

export default function ObrasDestacadasPage() {
  return (
    <div className="rounded-2xl bg-surface-raised p-8 ring-1 ring-border">
      <p className="eyebrow">Obras de referencia</p>
      <h2 className="font-serif text-lg font-medium">Narrativa de obras destacadas</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Subset de tus certificados de obra marcados como destacados, con
        narrativa redactada para reuso directo en la memoria del Sobre B.
      </p>
      <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground/90">
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Marca destacado_sobre_b en certificados existentes</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>200-500 palabras describiendo retos y resultados</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Fotos opcionales</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Editor con prompt asistido (planificado)</span>
        </li>
      </ul>
      <p className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Reusa certificados_obra · UI pendiente
      </p>
    </div>
  );
}
