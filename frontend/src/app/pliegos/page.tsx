"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { pliegosApi, type EstadoAnalisis, type PliegoListItem } from "@/lib/api/pliegos";

export default function PliegosListPage() {
  const list = useQuery({
    queryKey: ["pliegos-list"],
    queryFn: () => pliegosApi.list(),
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-10 animate-fade-up">
        <p className="eyebrow mb-3">Análisis IA · M3</p>
        <h1 className="display-h text-4xl leading-[1] sm:text-5xl">
          pliegos analizados
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          El análisis del PCAP es <strong className="text-foreground">cache global</strong> —
          una vez extraído por la IA, el resultado es el mismo para cualquier
          usuario. La <strong className="text-foreground">recomendación ir/no ir</strong>{" "}
          sí es por empresa: se calcula al abrir cada pliego cruzando con tus
          datos de M2.
        </p>
      </header>

      {list.isLoading ? (
        <Skeleton />
      ) : !list.data || list.data.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {list.data.map((item) => (
            <Item key={item.licitacion_id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({ item }: { item: PliegoListItem }) {
  return (
    <li>
      <Link
        href={`/pliegos/${encodeURIComponent(item.expediente)}`}
        className="group block rounded-2xl bg-surface-raised p-5 ring-1 ring-border transition-colors hover:bg-muted/30"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {item.expediente}
              </p>
              <EstadoBadge estado={item.estado} />
              {item.idioma_detectado && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                  {item.idioma_detectado}
                </span>
              )}
              {item.banderas_rojas_count != null &&
                item.banderas_rojas_count > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-warning"
                      aria-hidden="true"
                    />
                    {item.banderas_rojas_count} bandera
                    {item.banderas_rojas_count !== 1 ? "s" : ""} roja
                    {item.banderas_rojas_count !== 1 ? "s" : ""}
                  </span>
                )}
            </div>
            <h2 className="mt-3 line-clamp-2 font-display text-lg font-bold leading-snug tracking-tight">
              {item.titulo ?? "(sin título)"}
            </h2>
            {item.organismo && (
              <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                {item.organismo}
              </p>
            )}
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {item.importe_licitacion && (
                <span className="font-medium tabular-nums text-foreground">
                  {fmtEur(item.importe_licitacion)}
                </span>
              )}
              {item.fecha_limite && (
                <span>Límite {fmtFecha(item.fecha_limite)}</span>
              )}
              {item.procesado_at && (
                <span className="text-muted-foreground/70">
                  · analizado {fmtRelativo(item.procesado_at)}
                </span>
              )}
              {item.confianza_global && (
                <span className="text-muted-foreground/70">
                  · confianza {item.confianza_global}
                </span>
              )}
            </p>
          </div>
          <span
            className="mt-1 shrink-0 self-start text-muted-foreground transition-colors group-hover:text-foreground"
            aria-hidden="true"
          >
            →
          </span>
        </div>
      </Link>
    </li>
  );
}

function EstadoBadge({ estado }: { estado: EstadoAnalisis }) {
  if (estado === "completado") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        Analizado
      </span>
    );
  }
  if (estado === "procesando" || estado === "pendiente") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
        {estado === "procesando" ? "Procesando" : "En cola"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
      <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
      Falló
    </span>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/30" />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <div className="card flex flex-col items-center px-6 py-20 text-center">
      <p className="eyebrow mb-3">Sin análisis</p>
      <h3 className="font-display text-2xl font-bold tracking-tight">
        Aún no se ha analizado ningún pliego
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Desde el detalle de cualquier licitación del Radar pulsa{" "}
        <strong className="text-foreground">Analizar pliego con IA</strong>. La
        extracción tarda 30-60 segundos y se guarda en cache global — la
        próxima vez es instantánea.
      </p>
      <Link href="/radar" className="btn-primary mt-6">
        Ir al Radar
      </Link>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtEur(v: string | number | null): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!isFinite(n)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtFecha(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtRelativo(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} d`;
  return fmtFecha(value);
}
