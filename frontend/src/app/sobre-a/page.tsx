"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { sobreAApi, type SobreAListItem } from "@/lib/api/sobre_a";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

const QUERY_KEY = ["sobre-a", EMPRESA_DEMO_ID] as const;

export default function SobreAListPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => sobreAApi.list(EMPRESA_DEMO_ID),
  });

  const del = useMutation({
    mutationFn: (id: string) => sobreAApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const onDelete = (item: SobreAListItem) => {
    if (
      confirm(
        `¿Borrar este Sobre A del histórico? (${item.expediente}, ${fmtFecha(
          item.created_at,
        )})`,
      )
    ) {
      del.mutate(item.id);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-10 animate-fade-up">
        <p className="eyebrow mb-3">Documentación administrativa · M4</p>
        <h1 className="display-h text-4xl leading-[1] sm:text-5xl">
          sobres A generados
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Histórico de declaraciones responsables y DEUC simplificados generados
          desde Licitum. Cada generación captura un{" "}
          <strong className="text-foreground">snapshot</strong> de los datos de
          tu empresa al momento — meses después puedes consultar exactamente qué
          firmaste, aunque los datos hayan cambiado.
        </p>
      </header>

      {list.isLoading ? (
        <Skeleton />
      ) : !list.data || list.data.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {list.data.map((item) => (
            <Item key={item.id} item={item} onDelete={onDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({
  item,
  onDelete,
}: {
  item: SobreAListItem;
  onDelete: (i: SobreAListItem) => void;
}) {
  return (
    <li className="card-interactive p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {item.expediente}
            </p>
            {item.usa_relic ? (
              <span className="rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ring-foreground/10">
                RELIC
              </span>
            ) : (
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Declaración detallada
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Generado el{" "}
            <strong className="text-foreground">
              {fmtFecha(item.created_at)}
            </strong>
            {" · "}
            <span className="text-success">Snapshot persistido</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/sobre-a/${item.id}`}
            className="rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-surface transition-opacity hover:opacity-85"
          >
            Ver →
          </Link>
          <button
            onClick={() => onDelete(item)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
            title="Borrar del histórico"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </li>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/30" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="card flex flex-col items-center px-6 py-20 text-center">
      <p className="eyebrow mb-3">Sin Sobres A</p>
      <h3 className="font-display text-2xl font-bold tracking-tight">
        Aún no has generado ningún Sobre A
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Desde el detalle de cualquier licitación del Radar pulsa{" "}
        <strong className="text-foreground">Generar Sobre A</strong>. Si tu
        empresa está en RELIC, la versión simplificada se genera
        automáticamente.
      </p>
      <Link href="/radar" className="btn-primary mt-6">
        Ir al Radar
      </Link>
    </div>
  );
}

function fmtFecha(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
