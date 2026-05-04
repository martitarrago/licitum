"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, X } from "lucide-react";
import { pliegosApi, type EstadoAnalisis, type PliegoListItem } from "@/lib/api/pliegos";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

function normaliza(s: string | null | undefined): string {
  if (!s) return "";
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function PliegosListPage() {
  const list = useQuery({
    queryKey: ["pliegos-list", EMPRESA_DEMO_ID],
    queryFn: () => pliegosApi.list(EMPRESA_DEMO_ID),
  });

  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!list.data) return [];
    const needle = normaliza(q.trim());
    if (!needle) return list.data;
    return list.data.filter((it) =>
      normaliza(it.expediente).includes(needle) ||
      normaliza(it.titulo).includes(needle) ||
      normaliza(it.organismo).includes(needle),
    );
  }, [list.data, q]);

  const total = list.data?.length ?? 0;
  const showing = filtered.length;
  const hasQuery = q.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 animate-fade-up">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          pliegos analizados
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Aquí aparecen los contratos cuyo pliego ya ha leído la IA. Para cada uno
          verás si te recomienda presentarte o no, y qué cláusulas debes vigilar.
        </p>
      </header>

      {!list.isLoading && total > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
              placeholder="Buscar por expediente, título u organismo"
              className="w-full rounded-xl bg-surface-raised py-2.5 pl-10 pr-9 text-sm ring-1 ring-border placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-foreground/40"
              aria-label="Buscar pliegos analizados"
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>
          {hasQuery && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {showing} de {total}
            </p>
          )}
        </div>
      )}

      {list.isLoading ? (
        <Skeleton />
      ) : total === 0 ? (
        <Empty />
      ) : showing === 0 ? (
        <NoMatches query={q} onClear={() => setQ("")} />
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <Item key={item.licitacion_id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <h3 className="font-display text-xl font-bold tracking-tight">
        Ningún pliego coincide con &ldquo;{query}&rdquo;
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Prueba con otro término o limpia la búsqueda.
      </p>
      <button type="button" onClick={onClear} className="btn-secondary mt-6">
        Limpiar búsqueda
      </button>
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
              {item.estado === "completado" && item.veredicto_recomendado ? (
                <VeredictoBadge veredicto={item.veredicto_recomendado} />
              ) : (
                <EstadoBadge estado={item.estado} />
              )}
              {item.confianza_global && item.estado === "completado" && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {Math.round(parseFloat(item.confianza_global) * 100)}% confianza
                </span>
              )}
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
                  · hace {fmtRelativo(item.procesado_at)}
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

function VeredictoBadge({ veredicto }: { veredicto: string }) {
  if (veredicto === "ir") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        Presentarse
      </span>
    );
  }
  if (veredicto === "ir_con_riesgo") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
        Con cautela
      </span>
    );
  }
  if (veredicto === "no_ir") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger">
        <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
        Descartar
      </span>
    );
  }
  // incompleto
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" aria-hidden="true" />
      Sin recomendación
    </span>
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
