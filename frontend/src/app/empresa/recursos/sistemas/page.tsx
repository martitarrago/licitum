"use client";

export default function SistemasGestionPage() {
  return (
    <div className="rounded-2xl bg-surface-raised p-8 ring-1 ring-border">
      <p className="eyebrow">Sistemas y certificaciones</p>
      <h2 className="font-serif text-lg font-medium">Sistemas de gestión</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        ISOs y planes propios con alcance descriptivo. El Sobre B necesita
        citar entidad certificadora y ámbito, no solo presentar el PDF.
      </p>
      <ul className="mt-5 space-y-1.5 text-sm text-muted-foreground/90">
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>ISO 9001 / 14001 / 45001</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Planes propios (calidad, MA, seguridad)</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>CAE construcción</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <span>Caducidad cuando aplique (ISOs renovables)</span>
        </li>
      </ul>
      <p className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        Endpoint /api/v1/empresa/sistemas-gestion · UI pendiente
      </p>
    </div>
  );
}
