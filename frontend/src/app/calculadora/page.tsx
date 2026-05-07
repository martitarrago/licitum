"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { calculadoraApi, type OfertaListItem } from "@/lib/api/calculadora";
import { useEmpresaId } from "@/lib/auth";

export default function CalculadoraListPage() {
  const empresaId = useEmpresaId();
  const QUERY_KEY = ["oferta-economica-list", empresaId] as const;
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => calculadoraApi.list(empresaId),
  });

  const del = useMutation({
    mutationFn: (id: string) => calculadoraApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const onDelete = (item: OfertaListItem) => {
    if (
      confirm(
        `¿Borrar esta versión del histórico? (${item.expediente}, ${fmtFecha(item.created_at)})`,
      )
    ) {
      del.mutate(item.id);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-10 animate-fade-up">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          calculadora económica
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Histórico de versiones de oferta económica calculadas. Cada versión
          guarda los inputs (presupuesto, fórmula del pliego, baja propuesta) y
          el resultado al momento — útil para comparar escenarios antes de
          presentar la oferta definitiva.
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
  item: OfertaListItem;
  onDelete: (i: OfertaListItem) => void;
}) {
  const importe = parseFloat(item.importe_ofertado);
  const baja = parseFloat(item.baja_pct);
  return (
    <li className="card-interactive p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {item.expediente}
            </p>
            {item.entra_en_temeraria && (
              <span className="rounded-md bg-danger/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-danger ring-1 ring-inset ring-danger/25">
                Temeraria
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
            <div>
              <p className="eyebrow mb-0.5">Oferta</p>
              <p className="display-num text-xl text-foreground">
                {fmtEur(importe)}
              </p>
            </div>
            <div>
              <p className="eyebrow mb-0.5">Baja</p>
              <p className="display-num text-xl text-foreground">
                {baja.toFixed(2)}%
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Guardada el{" "}
            <strong className="text-foreground">{fmtFecha(item.created_at)}</strong>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={`/calculadora/licitacion/${encodeURIComponent(item.expediente)}`}
            className="rounded-lg bg-foreground px-4 py-2 text-xs font-medium text-surface transition-opacity hover:opacity-85"
          >
            Abrir →
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
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/30" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="card flex flex-col items-center px-6 py-20 text-center">
      <h3 className="font-display text-2xl font-bold tracking-tight">
        Aún no has calculado ninguna oferta
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Desde el análisis de un pliego, abre el espacio de trabajo de la
        licitación y entra en la calculadora. Te guía con la fórmula del
        pliego, el umbral temerario y la baja media histórica del órgano.
      </p>
      <Link href="/pliegos" className="btn-primary mt-6">
        Ver pliegos analizados
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

function fmtEur(v: number): string {
  if (!isFinite(v)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}
