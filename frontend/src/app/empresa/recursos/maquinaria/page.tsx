"use client";

export default function MaquinariaPage() {
  return (
    <div className="rounded-2xl bg-surface-raised p-8 ring-1 ring-border">
      <p className="eyebrow">Equipo material</p>
      <h2 className="font-serif text-lg font-medium">Maquinaria</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Inventario operativo: camiones, retros, compresores, encofrados.
        Sobre B y match suave para pliegos con maquinaria especial.
      </p>
      <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground/90">
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Tipo + marca + modelo + año</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Matrícula opcional</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Propiedad: propia · leasing · alquiler largo plazo</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Caducidad ITV opcional</span>
        </li>
      </ul>
      <p className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Endpoint /api/v1/empresa/maquinaria · UI pendiente
      </p>
    </div>
  );
}
