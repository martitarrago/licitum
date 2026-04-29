"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCcw } from "lucide-react";
import { relicApi, type EmpresaRelic } from "@/lib/api/relic";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import { ClasificacionesRelicTabla } from "@/components/empresa/ClasificacionesRelicTabla";

const QUERY_KEY = ["relic", EMPRESA_DEMO_ID] as const;

export default function RelicPage() {
  const qc = useQueryClient();
  const { data: relic, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => relicApi.get(EMPRESA_DEMO_ID),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  return (
    <>
      <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
        Sincronización <strong>automática</strong> con el Registre Electrònic
        d&apos;Empreses Licitadores i Classificades de Catalunya. Si tu empresa
        está inscrita, conéctala aquí: ahorra 30-60 minutos en cada Sobre A y
        mantiene tus clasificaciones siempre al día. Las clasificaciones
        introducidas a mano viven en la pestaña Clasificaciones.
      </p>

      {isLoading ? (
        <Skeleton />
      ) : !relic ? (
        <ConectarForm onSuccess={invalidate} />
      ) : (
        <Conectado relic={relic} onChange={invalidate} />
      )}
    </>
  );
}

// ─── Estado: cargando ───────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl bg-muted/50" />
      <div className="h-64 animate-pulse rounded-2xl bg-muted/50" />
    </div>
  );
}

// ─── Estado: sin inscripción RELIC ──────────────────────────────────────────

function ConectarForm({ onSuccess }: { onSuccess: () => void }) {
  const [n, setN] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: (n_registral: string) =>
      relicApi.sincronizar(EMPRESA_DEMO_ID, n_registral),
    onSuccess: () => {
      setError(null);
      setN("");
      onSuccess();
    },
    onError: (e: Error) => {
      // El backend devuelve 404 con detail "RELIC no tiene ninguna empresa con n_registral=..."
      setError(e.message || "Error sincronizando con RELIC");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = n.trim();
    if (trimmed.length < 3) {
      setError("Introduce un nº registral válido");
      return;
    }
    sync.mutate(trimmed);
  };

  return (
    <div className="card p-8">
      <h2 className="font-display text-2xl font-bold tracking-tight">
        Conecta tu inscripción RELIC
      </h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Introduce tu nº registral. Lo encuentras en tu tarjeta de inscripción
        RELIC. Formato típico:{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          NB1325817
        </code>{" "}
        o{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          2026007542
        </code>
        .
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:max-w-md">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Nº registral
        </label>
        <input
          type="text"
          value={n}
          onChange={(e) => {
            setN(e.target.value);
            setError(null);
          }}
          placeholder="NB1325817"
          autoFocus
          disabled={sync.isPending}
          className="rounded-lg bg-surface px-4 py-2.5 font-mono text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30 disabled:opacity-50"
        />
        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}
        <button
          type="submit"
          disabled={sync.isPending || n.trim().length < 3}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sync.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sincronizando…
            </>
          ) : (
            <>
              <RefreshCcw className="h-4 w-4" strokeWidth={2} />
              Sincronizar con RELIC
            </>
          )}
        </button>
      </form>

      <div className="mt-8 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          ¿No estás inscrito todavía?
        </p>
        <a
          href="https://relic.contractaciopublica.cat/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Solicita la inscripción en RELIC →
        </a>
      </div>
    </div>
  );
}

// ─── Estado: con inscripción sincronizada ──────────────────────────────────

function Conectado({
  relic,
  onChange,
}: {
  relic: EmpresaRelic;
  onChange: () => void;
}) {
  return (
    <div className="space-y-6">
      {relic.prohibicio && <BannerProhibicion relic={relic} />}
      <ResumenCard relic={relic} onChange={onChange} />
      {relic.clasificaciones_relic.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight">
                Sincronización · clasificaciones recibidas
              </h2>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                Vista de auditoría tras el último sync. Para gestionarlas junto
                con tus manuales, ve a la pestaña Clasificaciones.
              </p>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {relic.clasificaciones_relic.length} grupos vigentes
            </p>
          </div>
          <ClasificacionesRelicTabla items={relic.clasificaciones_relic} />
        </section>
      )}
    </div>
  );
}

// ─── Banner: prohibición de contratar ──────────────────────────────────────

function BannerProhibicion({ relic }: { relic: EmpresaRelic }) {
  const data = relic.prohibicio_data ?? {};
  return (
    <div className="rounded-2xl bg-danger/5 p-6 ring-1 ring-danger/20 shadow-card">
      <h2 className="font-display text-xl font-bold tracking-tight text-danger">
        Empresa con prohibición de contratar
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Mientras esté vigente, no podrás presentarte a licitaciones del sector
        público en el ámbito indicado.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {data.ambit_pr && <Field label="Ámbito" value={data.ambit_pr} />}
        {data.causa_legal_pr && (
          <Field label="Causa legal" value={data.causa_legal_pr} />
        )}
        {data.data_inici_pr && (
          <Field label="Inicio" value={fmtFecha(data.data_inici_pr)} />
        )}
        {data.data_fi_pr && (
          <Field label="Fin" value={fmtFecha(data.data_fi_pr)} />
        )}
      </dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

// ─── Tarjeta resumen ────────────────────────────────────────────────────────

function ResumenCard({
  relic,
  onChange,
}: {
  relic: EmpresaRelic;
  onChange: () => void;
}) {
  const sync = useMutation({
    mutationFn: () => relicApi.sincronizar(EMPRESA_DEMO_ID, relic.n_registral),
    onSuccess: () => onChange(),
  });

  const desconectar = useMutation({
    mutationFn: () => relicApi.desconectar(EMPRESA_DEMO_ID),
    onSuccess: () => onChange(),
  });

  const onDesconectar = () => {
    if (
      confirm(
        "¿Desconectar la empresa de RELIC? Borrará la inscripción local; podrás volver a sincronizarla luego.",
      )
    ) {
      desconectar.mutate();
    }
  };

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                relic.prohibicio ? "bg-danger" : "bg-success"
              }`}
              aria-hidden="true"
            />
            {relic.prohibicio ? "Inscrita · con prohibición" : "Inscrita en RELIC"}
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight">
            {relic.nom_empresa ?? "Empresa sin nombre"}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="btn-primary"
          >
            {sync.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" strokeWidth={2} />
            )}
            Sincronizar ahora
          </button>
          <button
            onClick={onDesconectar}
            disabled={desconectar.isPending}
            className="btn-secondary"
          >
            Desconectar
          </button>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 border-t border-border pt-5 sm:grid-cols-3">
        <div>
          <dt className="eyebrow">Nº registral</dt>
          <dd className="mt-1 font-mono text-sm">{relic.n_registral}</dd>
        </div>
        <div>
          <dt className="eyebrow">Última actualización RELIC</dt>
          <dd className="mt-1 text-sm">{fmtFecha(relic.data_actualitzacio)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Última sincronización</dt>
          <dd className="mt-1 text-sm">{fmtRelativo(relic.ultima_sincronizacion)}</dd>
        </div>
      </dl>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtFecha(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtRelativo(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "hace unos segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} d`;
  return fmtFecha(value);
}
