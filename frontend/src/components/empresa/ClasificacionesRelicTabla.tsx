import type { ClasificacionRelic } from "@/lib/api/relic";

interface Props {
  items: ClasificacionRelic[];
}

const tipusLabel: Record<string, string> = {
  OBRES: "Obras",
  SERVEIS: "Servicios",
};

export function ClasificacionesRelicTabla({ items }: Props) {
  // Orden estable: por sigles_cl (A1, B1, C, C1, …)
  const sorted = [...items].sort((a, b) =>
    a.sigles_cl.localeCompare(b.sigles_cl),
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Sigles</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Descripción</th>
            <th className="px-4 py-3">Categoría</th>
            <th className="px-4 py-3">Otorgada</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-border last:border-b-0 ${
                c.suspensio ? "opacity-50" : ""
              }`}
            >
              <td className="px-4 py-3 font-mono font-medium">{c.sigles_cl}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {tipusLabel[c.tipus_cl] ?? c.tipus_cl}
              </td>
              <td className="px-4 py-3">
                {c.subgrup_cl_text ?? (
                  <span className="text-muted-foreground italic">
                    nivel grupo
                  </span>
                )}
                {c.suspensio && (
                  <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
                    Suspendida
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {c.categoria !== null ? (
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-foreground/[0.07] font-mono text-xs font-semibold ring-1 ring-inset ring-foreground/10">
                    {c.categoria}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {fmtFecha(c.data_atorgament)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtFecha(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
