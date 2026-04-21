import { type LucideIcon } from "lucide-react";

interface ModulePlaceholderProps {
  titulo: string;
  descripcion: string;
  icon: LucideIcon;
}

export function ModulePlaceholder({ titulo, descripcion, icon: Icon }: ModulePlaceholderProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
        <Icon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold text-foreground mb-1">{titulo}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{descripcion}</p>
      <div className="mt-4 rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-foreground ring-1 ring-border">
        Próximamente
      </div>
    </main>
  );
}
