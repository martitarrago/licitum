"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calculator,
  ClipboardList,
  FileSignature,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { DeclaracionPanel } from "@/components/ofertas/DeclaracionPanel";
import { EconomicaPanel } from "@/components/ofertas/EconomicaPanel";
import { PresentacionPanel } from "@/components/ofertas/PresentacionPanel";
import { TecnicaPanel } from "@/components/ofertas/TecnicaPanel";
import { licitacionesApi } from "@/lib/api/licitaciones";
import { decidirTabs, ofertasApi, type OfertaTab } from "@/lib/api/ofertas";
import { ESTADO_LABELS, type EstadoTracker, trackerApi } from "@/lib/api/tracker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

type Tab = OfertaTab;

const TAB_META: Record<
  Tab,
  { label: string; icon: typeof ClipboardList; descripcion: string }
> = {
  declaracion: {
    label: "Declaración responsable",
    icon: ClipboardList,
    descripcion: "Sobre A · datos administrativos del licitador",
  },
  economica: {
    label: "Oferta económica",
    icon: Calculator,
    descripcion: "Calculadora con fórmula del pliego e intel histórica",
  },
  tecnica: {
    label: "Memoria técnica",
    icon: FileSignature,
    descripcion: "Documentación técnica · solo si el pliego pondera juicio de valor",
  },
};

export default function OfertaWorkspacePage({
  params,
}: {
  params: { expediente: string };
}) {
  return (
    <Suspense fallback={null}>
      <Inner expediente={decodeURIComponent(params.expediente)} />
    </Suspense>
  );
}

function Inner({ expediente }: { expediente: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabActiva = (searchParams.get("tab") as Tab | null) || null;

  const licitacion = useQuery({
    queryKey: ["licitacion", expediente, EMPRESA_DEMO_ID],
    queryFn: () => licitacionesApi.get(expediente, EMPRESA_DEMO_ID),
    staleTime: 5 * 60 * 1000,
  });

  const estado = useQuery({
    queryKey: ["tracker-estado", expediente, EMPRESA_DEMO_ID],
    queryFn: () => trackerApi.getEstado(expediente, EMPRESA_DEMO_ID),
  });

  const todas = useQuery({
    queryKey: ["ofertas-list", EMPRESA_DEMO_ID, false],
    queryFn: () => ofertasApi.list(EMPRESA_DEMO_ID, false),
    staleTime: 30 * 1000,
  });
  const oferta = useMemo(
    () => todas.data?.find((o) => o.expediente === expediente) ?? null,
    [todas.data, expediente],
  );

  const decision = useMemo(() => {
    if (oferta) return decidirTabs(oferta);
    // Fallback si todavía no carga: mostrar las 3 con aviso
    return {
      tabs: ["declaracion", "economica", "tecnica"] as Tab[],
      motivo:
        "Cargando datos del pliego para determinar qué pestañas mostrar…",
    };
  }, [oferta]);

  const tab: Tab = useMemo(() => {
    if (tabActiva && decision.tabs.includes(tabActiva)) return tabActiva;
    return decision.tabs[0] ?? "declaracion";
  }, [tabActiva, decision]);

  const setTab = (next: Tab) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", next);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  if (licitacion.isLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }
  if (licitacion.isError || !licitacion.data) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <XCircle className="h-10 w-10 text-danger" aria-hidden="true" />
          <p className="text-sm font-semibold text-danger">
            No se pudo cargar la licitación
          </p>
          <Link href="/ofertas" className="text-sm text-muted-foreground underline">
            Volver al listado
          </Link>
        </div>
      </main>
    );
  }

  const l = licitacion.data;
  const dias = diasHasta(l.fecha_limite);
  const cerrada = dias != null && dias < 0;
  const urgente = dias != null && dias >= 0 && dias <= 7;
  const haPresentado = oferta?.presentado ?? false;
  const pctSubj = oferta?.pct_criterios_subjetivos
    ? parseFloat(oferta.pct_criterios_subjetivos)
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <Link
        href="/ofertas"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Preparación de ofertas
      </Link>

      {/* Header de contexto */}
      <header className="mb-8">
        <p className="eyebrow mb-2">Oferta · espacio de trabajo</p>
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          {l.titulo ?? "Sin título"}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
          {l.organismo && <span>{l.organismo}</span>}
          <span className="font-mono text-xs">{l.expediente}</span>
          {l.fecha_limite && (
            <span>
              Cierra {fmtFecha(l.fecha_limite)}
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
              {ESTADO_LABELS[estado.data.estado as EstadoTracker] ??
                estado.data.estado}
            </span>
          )}
        </div>
        <Link
          href={`/pliegos/${encodeURIComponent(expediente)}`}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ver análisis del pliego →
        </Link>
      </header>

      {/* Tabs */}
      <nav
        className="mb-2 flex flex-wrap items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Componentes de la oferta"
      >
        {decision.tabs.map((t) => {
          const meta = TAB_META[t];
          const active = t === tab;
          const Icon = meta.icon;
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={[
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors -mb-px",
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              {meta.label}
            </button>
          );
        })}
      </nav>

      <p className="mb-7 mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>{decision.motivo}</span>
      </p>

      {/* Contenido de la pestaña */}
      <div className="mb-10">
        {tab === "declaracion" && (
          <DeclaracionPanel
            expediente={expediente}
            haPresentado={haPresentado}
          />
        )}
        {tab === "economica" && <EconomicaPanel expediente={expediente} />}
        {tab === "tecnica" && (
          <TecnicaPanel
            expediente={expediente}
            pctSubjetivos={pctSubj}
            motivo={decision.motivo}
          />
        )}
      </div>

      {/* Bloque de Presentación común */}
      <PresentacionPanel expediente={expediente} />
    </main>
  );
}

function fmtFecha(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function diasHasta(fecha: string | null): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const hoyUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const fechaUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.ceil((fechaUtc - hoyUtc) / (1000 * 60 * 60 * 24));
}
