"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEmpresaId } from "@/lib/auth";
import { empresaApi } from "@/lib/api/empresa";
import { certificadosApi } from "@/lib/api/certificados";
import { clasificacionesApi } from "@/lib/api/clasificaciones";
import { relicApi } from "@/lib/api/relic";
import { documentosApi } from "@/lib/api/documentos";
import { preferenciasApi } from "@/lib/api/preferencias";

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function pct(filled: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((filled / total) * 100);
}

function nonEmpty(v: string | number | null | undefined): boolean {
  if (v == null) return false;
  return String(v).trim() !== "";
}

export default function EmpresaResumenPage() {
  const empresaId = useEmpresaId();
  const empresa = useQuery({
    queryKey: ["empresa", empresaId],
    queryFn: () => empresaApi.get(empresaId),
  });
  const solvencia = useQuery({
    queryKey: ["resumen-solvencia", empresaId],
    queryFn: () => certificadosApi.resumenSolvencia(empresaId),
  });
  const clasif = useQuery({
    queryKey: ["clasificaciones", empresaId],
    queryFn: () => clasificacionesApi.list({ empresa_id: empresaId }),
  });
  const relic = useQuery({
    queryKey: ["relic", empresaId],
    queryFn: () => relicApi.get(empresaId),
  });
  const docs = useQuery({
    queryKey: ["documentos-resumen", empresaId],
    queryFn: () => documentosApi.resumenSalud(empresaId),
  });
  const prefs = useQuery({
    queryKey: ["preferencias", empresaId],
    queryFn: () => preferenciasApi.get(empresaId),
  });

  const e = empresa.data;

  // ── Completitud por sección (mismo cálculo que /empresa/perfil) ─────────
  const idenFilled = e
    ? [e.nombre, e.cif, e.email, e.telefono, e.iae, e.cnae, e.tamano_pyme].filter(nonEmpty).length
    : 0;
  const dirFilled = e
    ? [
        e.direccion_calle,
        e.direccion_codigo_postal,
        e.direccion_ciudad,
        e.direccion_provincia,
        e.direccion_pais,
      ].filter(nonEmpty).length
    : 0;
  const repFilled = e
    ? [
        e.representante_nombre,
        e.representante_nif,
        e.representante_cargo,
        e.poder_notario,
        e.poder_fecha_escritura,
        e.poder_protocolo,
        e.poder_registro_mercantil,
      ].filter(nonEmpty).length
    : 0;
  const ssFilled = e ? (nonEmpty(e.ccc_seguridad_social) ? 1 : 0) : 0;
  const solvFilled = e
    ? [e.volumen_negocio_n, e.volumen_negocio_n1, e.volumen_negocio_n2, e.plantilla_media]
        .filter(nonEmpty).length
    : 0;

  const perfilFilled = idenFilled + dirFilled + repFilled + ssFilled + solvFilled;
  const perfilTotal = 7 + 5 + 7 + 1 + 4;
  const perfilPct = pct(perfilFilled, perfilTotal);

  // ── Datos derivados ────────────────────────────────────────────────────
  const totalCerts = solvencia.data?.total_obras ?? 0;
  const anualidadMedia = Number(solvencia.data?.anualidad_media ?? 0);
  const volNegocioMax = e
    ? Math.max(
        Number(e.volumen_negocio_n ?? 0),
        Number(e.volumen_negocio_n1 ?? 0),
        Number(e.volumen_negocio_n2 ?? 0),
      )
    : 0;

  const manualCount = clasif.data?.filter((c) => c.activa).length ?? 0;
  const relicCount = relic.data?.clasificaciones_relic.length ?? 0;
  const proximaCaducar = clasif.data?.filter((c) => {
    if (!c.activa) return false;
    const dias = (new Date(c.fecha_caducidad).getTime() - Date.now()) / 86400000;
    return dias > 0 && dias <= 90;
  }).length ?? 0;

  const saludPct =
    docs.data && docs.data.total > 0
      ? Math.round((docs.data.vigentes / docs.data.total) * 100)
      : null;

  const territorios = prefs.data?.territorios.length ?? 0;
  const cpvsCore = prefs.data?.cpvs.filter((c) => c.prioridad === "core").length ?? 0;

  const loading =
    empresa.isLoading ||
    solvencia.isLoading ||
    clasif.isLoading ||
    relic.isLoading ||
    docs.isLoading ||
    prefs.isLoading;

  return (
    <div className="animate-fade-up">
      <header className="mb-8">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          mi empresa
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Vista única de qué tienes declarado y qué te falta. Cada bloque
          enlaza a su sección correspondiente.
        </p>
      </header>

      {/* Hero — % perfil completo */}
      <section className="card mb-6 p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Perfil completo</p>
            <p className={`display-num mt-2 text-5xl leading-none ${pctColor(perfilPct)}`}>
              {loading ? "…" : `${perfilPct}%`}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {perfilFilled} de {perfilTotal} campos rellenados
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-right sm:grid-cols-5">
            <Mini label="Identidad" pct={pct(idenFilled, 7)} />
            <Mini label="Dirección" pct={pct(dirFilled, 5)} />
            <Mini label="Representante" pct={pct(repFilled, 7)} />
            <Mini label="SS" pct={pct(ssFilled, 1)} />
            <Mini label="Solvencia ec." pct={pct(solvFilled, 4)} />
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all duration-500 ${pctBar(perfilPct)}`}
            style={{ width: `${perfilPct}%` }}
          />
        </div>
      </section>

      {/* Grid de secciones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          eyebrow="Solvencia técnica · LCSP art. 88"
          title="Obra ejecutada"
          href="/empresa/solvencia"
          loading={solvencia.isLoading}
        >
          <Stat
            big={anualidadMedia > 0 ? eur.format(anualidadMedia) : "—"}
            label="anualidad media (5 años)"
          />
          <Sub label={`${totalCerts} ${totalCerts === 1 ? "certificado" : "certificados"} validados`} />
        </Card>

        <Card
          eyebrow="Solvencia económica · LCSP art. 87"
          title="Volumen anual de negocio"
          href="/empresa/perfil"
          loading={empresa.isLoading}
        >
          <Stat
            big={volNegocioMax > 0 ? eur.format(volNegocioMax) : "—"}
            label="máximo declarado de los 3 últimos ejercicios"
          />
          <Sub
            label={
              e?.plantilla_media != null
                ? `Plantilla media: ${e.plantilla_media}`
                : "Plantilla media sin declarar"
            }
          />
        </Card>

        <Card
          eyebrow="Habilitación oficial"
          title="Clasificaciones efectivas"
          href="/empresa/solvencia/clasificaciones"
          loading={clasif.isLoading || relic.isLoading}
        >
          <Stat big={String(manualCount + relicCount)} label="grupos vigentes" />
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Pill>{manualCount} manual</Pill>
            <Pill variant="info">{relicCount} RELIC</Pill>
            {proximaCaducar > 0 && (
              <Pill variant="warning">
                {proximaCaducar} caduca{proximaCaducar === 1 ? "" : "n"} en 90 d
              </Pill>
            )}
          </div>
        </Card>

        <Card
          eyebrow="Documentación administrativa"
          title="Salud documental"
          href="/empresa/documentos"
          loading={docs.isLoading}
        >
          <Stat
            big={saludPct != null ? `${saludPct}%` : "—"}
            label={
              docs.data
                ? `${docs.data.vigentes} de ${docs.data.total} vigentes`
                : "Sin documentos cargados"
            }
            color={saludPct != null ? pctColor(saludPct) : undefined}
          />
          {docs.data && (docs.data.a_caducar > 0 || docs.data.caducados > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {docs.data.a_caducar > 0 && (
                <Pill variant="warning">{docs.data.a_caducar} a caducar</Pill>
              )}
              {docs.data.caducados > 0 && (
                <Pill variant="danger">{docs.data.caducados} caducado{docs.data.caducados === 1 ? "" : "s"}</Pill>
              )}
            </div>
          )}
        </Card>

        <Card
          eyebrow="Match"
          title="Preferencias declaradas"
          href="/empresa/preferencias"
          loading={prefs.isLoading}
        >
          <div className="space-y-2 text-sm">
            <Row k="Estado" v={prefs.data ? estadoLabel(prefs.data.estado_aceptacion) : "—"} />
            <Row
              k="Presupuesto"
              v={prefs.data ? rangoPresupuesto(prefs.data.presupuesto_min_interes, prefs.data.presupuesto_max_interes) : "—"}
            />
            <Row k="Territorios marcados" v={String(territorios)} />
            <Row k="CPV core" v={String(cpvsCore)} />
            <Row k="UTE" v={prefs.data?.apetito_ute ? "Acepta" : "No"} />
          </div>
        </Card>

        <Card
          eyebrow="Recursos para Sobre B"
          title="Equipo y maquinaria"
          href="/empresa/recursos"
          loading={false}
        >
          <p className="text-sm text-muted-foreground">
            Personal técnico, maquinaria y sistemas de gestión que adscribes a
            obra. Habilita la generación automática de la memoria técnica del
            Sobre B (M5, próximamente).
          </p>
        </Card>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function pctColor(p: number): string {
  if (p >= 80) return "text-success";
  if (p >= 50) return "text-warning";
  return "text-foreground/70";
}

function pctBar(p: number): string {
  if (p >= 80) return "bg-success";
  if (p >= 50) return "bg-warning";
  return "bg-foreground/40";
}

function Mini({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${pctColor(pct)}`}>
        {pct}%
      </p>
    </div>
  );
}

function Card({
  eyebrow,
  title,
  href,
  loading,
  children,
}: {
  eyebrow: string;
  title: string;
  href: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="card-interactive group flex flex-col rounded-2xl bg-surface-raised p-6 ring-1 ring-border transition-colors hover:bg-surface"
    >
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-1 font-serif text-lg font-medium">{title}</h2>
      <div className="mt-4 flex-1">
        {loading ? (
          <div className="space-y-2">
            <div className="h-9 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 w-48 animate-pulse rounded bg-muted/60" />
          </div>
        ) : (
          children
        )}
      </div>
      <p className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 transition-colors group-hover:text-foreground">
        Ver detalle
        <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
      </p>
    </Link>
  );
}

function Stat({
  big,
  label,
  color,
}: {
  big: string;
  label: string;
  color?: string;
}) {
  return (
    <div>
      <p className={`display-num text-3xl tabular-nums ${color ?? "text-foreground"}`}>
        {big}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Sub({ label }: { label: string }) {
  return <p className="mt-3 text-xs text-muted-foreground">{label}</p>;
}

function Pill({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "info" | "warning" | "danger";
}) {
  const cls =
    variant === "info"
      ? "bg-info/10 text-info ring-info/20"
      : variant === "warning"
        ? "bg-warning/10 text-warning ring-warning/20"
        : variant === "danger"
          ? "bg-danger/10 text-danger ring-danger/20"
          : "bg-foreground/[0.06] text-foreground/70 ring-foreground/10";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {children}
    </span>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0 last:pb-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-sm font-medium tabular-nums">{v}</span>
    </div>
  );
}

function estadoLabel(e: string): string {
  if (e === "acepta") return "Acepta licitaciones";
  if (e === "selectivo") return "Selectivo";
  if (e === "no_acepta") return "No acepta";
  return e;
}

function rangoPresupuesto(min: string | null | undefined, max: string | null | undefined): string {
  const mn = min != null ? Number(min) : null;
  const mx = max != null ? Number(max) : null;
  if (mn == null && mx == null) return "—";
  const fmt = (n: number) => eur.format(n);
  if (mn != null && mx != null) return `${fmt(mn)} – ${fmt(mx)}`;
  if (mn != null) return `≥ ${fmt(mn)}`;
  return `≤ ${fmt(mx!)}`;
}
