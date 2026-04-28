"use client";

export default function PersonalPage() {
  return (
    <div className="rounded-2xl bg-surface-raised p-8 ring-1 ring-border">
      <p className="eyebrow">Equipo humano</p>
      <h2 className="font-serif text-lg font-medium">Personal técnico</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Jefes de obra, encargados, técnicos PRL/calidad/MA, ingenieros y
        arquitectos. Lo que el pliego pide nominalmente en la memoria
        técnica.
      </p>
      <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground/90">
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Titulación + años de experiencia</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Certificados de formación (PRL 60h, recurso preventivo, …)</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Obras participadas (FK a certificados)</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Subir CV en PDF y la IA extrae los datos</span>
        </li>
      </ul>
      <p className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Endpoint /api/v1/empresa/personal · UI pendiente
      </p>
    </div>
  );
}
