"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  FileSignature,
  Loader2,
  Sparkles,
  XCircle,
} from "lucide-react";
import { GenerarSobreABoton } from "@/components/sobre-a/GenerarSobreABoton";
import { licitacionesApi } from "@/lib/api/licitaciones";
import { sobreAApi, type SobreAListItem } from "@/lib/api/sobre_a";
import { trackerApi, ESTADO_LABELS } from "@/lib/api/tracker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

const fmtFecha = (v: string | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const fmtFechaHora = (v: string): string => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function diasHasta(fecha: string | null | undefined): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const hoyUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fechaUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.ceil((fechaUtc - hoyUtc) / (1000 * 60 * 60 * 24));
}

export default function SobreAWorkspacePage({
  params,
}: {
  params: { expediente: string };
}) {
  const expediente = decodeURIComponent(params.expediente);

  const licitacion = useQuery({
    queryKey: ["licitacion", expediente, EMPRESA_DEMO_ID],
    queryFn: () => licitacionesApi.get(expediente, EMPRESA_DEMO_ID),
    staleTime: 5 * 60 * 1000,
  });

  const estado = useQuery({
    queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
    queryFn: () => trackerApi.getEstado(expediente, EMPRESA_DEMO_ID),
  });

  const snapshots = useQuery({
    queryKey: ["sobre-a-snapshots", EMPRESA_DEMO_ID, expediente],
    queryFn: () => sobreAApi.list(EMPRESA_DEMO_ID, expediente),
  });

  if (licitacion.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (licitacion.isError || !licitacion.data) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <XCircle className="h-10 w-10 text-danger" aria-hidden="true" />
          <p className="text-sm font-semibold text-danger">
            No se pudo cargar la licitación
          </p>
          <Link href="/sobre-a" className="text-sm text-muted-foreground underline">
            Volver al histórico
          </Link>
        </div>
      </main>
    );
  }

  const l = licitacion.data;
  const dias = diasHasta(l.fecha_limite);
  const cerrada = dias != null && dias < 0;
  const urgente = dias != null && dias >= 0 && dias <= 7;
  const items = snapshots.data ?? [];
  const tieneSnapshots = items.length > 0;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      {/* Volver */}
      <Link
        href={`/pliegos/${encodeURIComponent(expediente)}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al análisis del pliego
      </Link>

      {/* Header */}
      <header className="mb-8">
        <p className="eyebrow mb-2">Sobre A · espacio de trabajo</p>
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          {l.titulo ?? "Sin título"}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          {l.organismo && <span>{l.organismo}</span>}
          <span className="font-mono text-xs">{l.expediente}</span>
          {l.fecha_limite && (
            <span>
              Límite {fmtFecha(l.fecha_limite)}
              {dias != null && !cerrada && (
                <span
                  className={
                    urgente ? " font-semibold text-danger" : " text-muted-foreground"
                  }
                >
                  {" "}· en {dias} d
                </span>
              )}
              {cerrada && (
                <span className="text-muted-foreground"> · cerrada</span>
              )}
            </span>
          )}
          {estado.data && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-foreground ring-1 ring-inset ring-foreground/10">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
              {ESTADO_LABELS[estado.data.estado as keyof typeof ESTADO_LABELS] ??
                estado.data.estado}
            </span>
          )}
        </div>
      </header>

      {/* Banner — el workspace completo está en construcción */}
      <div className="mb-8 flex items-start gap-3 rounded-xl bg-info/10 px-5 py-4 text-sm ring-1 ring-info/20">
        <Sparkles
          className="mt-0.5 h-4 w-4 shrink-0 text-info"
          strokeWidth={2}
          aria-hidden="true"
        />
        <div className="leading-relaxed">
          <p className="font-medium text-foreground">
            Espacio de trabajo del Sobre A
          </p>
          <p className="mt-0.5 text-muted-foreground">
            Aquí prepararás todo lo administrativo de esta oferta: requisitos
            que pide el pliego, datos de tu empresa, generación del documento
            y subida del firmado. Por ahora puedes generar el borrador con
            tus datos actuales — las secciones de revisión y firma llegan en
            el siguiente paso.
          </p>
        </div>
      </div>

      {/* Bloque borradores */}
      <section className="card p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow mb-1.5">Borradores generados</p>
            <h2 className="font-display text-xl font-bold tracking-tight">
              {tieneSnapshots
                ? `${items.length} versión${items.length !== 1 ? "es" : ""} en el histórico`
                : "Aún no has generado ningún borrador"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tieneSnapshots
                ? "Cada vez que pulses generar se crea una versión nueva con un snapshot completo de los datos de tu empresa al momento."
                : "El primer borrador se genera con los datos actuales de tu empresa (RELIC, certificados, representante)."}
            </p>
          </div>
          <GenerarSobreABoton
            expediente={expediente}
            variant={tieneSnapshots ? "secondary" : "primary"}
          />
        </div>

        {snapshots.isLoading ? (
          <div className="mt-6 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : tieneSnapshots ? (
          <ul className="mt-6 divide-y divide-border">
            {items.map((it) => (
              <SnapshotRow key={it.id} item={it} />
            ))}
          </ul>
        ) : null}
      </section>

      {/* Acciones complementarias */}
      <div className="mt-6 flex flex-wrap gap-3 text-sm">
        <Link
          href={`/pliegos/${encodeURIComponent(expediente)}`}
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Volver al análisis del pliego
        </Link>
        <Link
          href="/empresa"
          className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Revisar datos de empresa
        </Link>
      </div>
    </main>
  );
}

function SnapshotRow({ item }: { item: SobreAListItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">
          Versión del {fmtFechaHora(item.created_at)}
        </p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {item.usa_relic ? (
            <span className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ring-foreground/10">
              RELIC
            </span>
          ) : (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
              Detallado
            </span>
          )}
          <span>Snapshot persistido</span>
        </p>
      </div>
      <Link
        href={`/sobre-a/${item.id}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3.5 py-1.5 text-xs font-medium text-foreground ring-1 ring-border transition-colors hover:bg-muted"
      >
        <FileSignature className="h-3.5 w-3.5" strokeWidth={2} />
        Ver borrador
      </Link>
    </li>
  );
}
