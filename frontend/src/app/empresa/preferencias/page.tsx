"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Save, Trash2 } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import {
  CPV_DIVISIONES,
  ESTADO_ACEPTACION_LABELS,
  PRIORIDAD_CPV_LABELS,
  PRIORIDAD_TERRITORIO_LABELS,
  PROVINCIAS,
  preferenciasApi,
  type EmpresaPreferencias,
  type EstadoAceptacion,
  type PreferenciaCpv,
  type PreferenciaTerritorio,
  type PreferenciasUpsertPayload,
  type PrioridadCpv,
  type PrioridadTerritorio,
} from "@/lib/api/preferencias";

const QUERY_KEY = ["preferencias", EMPRESA_DEMO_ID] as const;

type FormState = {
  obras_simultaneas_max: string;
  obras_simultaneas_actual: string;
  presupuesto_min_interes: string;
  presupuesto_max_interes: string;
  apetito_ute: boolean;
  estado_aceptacion: EstadoAceptacion;
  notas: string;
  territorios: PreferenciaTerritorio[];
  cpvs: PreferenciaCpv[];
};

const empty: FormState = {
  obras_simultaneas_max: "",
  obras_simultaneas_actual: "",
  presupuesto_min_interes: "",
  presupuesto_max_interes: "",
  apetito_ute: false,
  estado_aceptacion: "acepta",
  notas: "",
  territorios: [],
  cpvs: [],
};

function fromApi(p: EmpresaPreferencias): FormState {
  return {
    obras_simultaneas_max:
      p.obras_simultaneas_max != null ? String(p.obras_simultaneas_max) : "",
    obras_simultaneas_actual:
      p.obras_simultaneas_actual != null
        ? String(p.obras_simultaneas_actual)
        : "",
    presupuesto_min_interes: p.presupuesto_min_interes ?? "",
    presupuesto_max_interes: p.presupuesto_max_interes ?? "",
    apetito_ute: p.apetito_ute,
    estado_aceptacion: p.estado_aceptacion,
    notas: p.notas ?? "",
    territorios: p.territorios.map((t) => ({
      comarca_codigo: t.comarca_codigo,
      provincia_codigo: t.provincia_codigo,
      prioridad: t.prioridad,
    })),
    cpvs: p.cpvs.map((c) => ({
      cpv_division: c.cpv_division,
      prioridad: c.prioridad,
    })),
  };
}

function toPayload(f: FormState): PreferenciasUpsertPayload {
  const num = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    return Number.isNaN(n) ? null : n;
  };
  return {
    obras_simultaneas_max: num(f.obras_simultaneas_max),
    obras_simultaneas_actual: num(f.obras_simultaneas_actual),
    presupuesto_min_interes: num(f.presupuesto_min_interes),
    presupuesto_max_interes: num(f.presupuesto_max_interes),
    apetito_ute: f.apetito_ute,
    estado_aceptacion: f.estado_aceptacion,
    notas: f.notas.trim() === "" ? null : f.notas.trim(),
    territorios: f.territorios,
    cpvs: f.cpvs,
  };
}

export default function PreferenciasPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => preferenciasApi.get(EMPRESA_DEMO_ID),
  });

  const [form, setForm] = useState<FormState>(empty);
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    if (data) setForm(fromApi(data));
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: PreferenciasUpsertPayload) =>
      preferenciasApi.upsert(EMPRESA_DEMO_ID, payload),
    onSuccess: (updated) => {
      qc.setQueryData(QUERY_KEY, updated);
      setSavedTick((t) => t + 1);
    },
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(toPayload(form));
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="h-8 w-48 animate-pulse rounded bg-muted/50" />
        <div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted/30" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
      <div className="space-y-8">
        <Section
          title="Estado de aceptación"
          help="Toggle global por encima de todo lo demás. Si está en «no acepta», nada del match aparece en tu home."
        >
          <Field label="Estado actual">
            <CustomSelect
              value={form.estado_aceptacion}
              options={(Object.entries(ESTADO_ACEPTACION_LABELS) as [
                EstadoAceptacion,
                string,
              ][]).map(([value, label]) => ({ value, label }))}
              onChange={(v) => set("estado_aceptacion", v as EstadoAceptacion)}
            />
          </Field>
        </Section>

        <Section
          title="Capacidad operativa"
          help="Filtro hard: una obra que no te cabe nunca debería aparecer recomendada."
        >
          <Two>
            <Field label="Obras en paralelo (máx histórico)">
              <Input
                value={form.obras_simultaneas_max}
                onChange={(v) =>
                  set("obras_simultaneas_max", v.replace(/[^0-9]/g, ""))
                }
                mono
                className="max-w-[160px]"
              />
            </Field>
            <Field label="Obras ahora mismo">
              <Input
                value={form.obras_simultaneas_actual}
                onChange={(v) =>
                  set("obras_simultaneas_actual", v.replace(/[^0-9]/g, ""))
                }
                mono
                className="max-w-[160px]"
              />
            </Field>
          </Two>
        </Section>

        <Section
          title="Presupuesto que te interesa"
          help="Filtro hard. Por debajo no compensa el coste de presentar; por encima no te cabe ni en UTE."
        >
          <Two>
            <Field label="Mínimo (€)">
              <Input
                value={form.presupuesto_min_interes}
                onChange={(v) => set("presupuesto_min_interes", v)}
                mono
              />
            </Field>
            <Field label="Máximo (€)">
              <Input
                value={form.presupuesto_max_interes}
                onChange={(v) => set("presupuesto_max_interes", v)}
                mono
              />
            </Field>
          </Two>
        </Section>

        <Section title="UTE">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={form.apetito_ute}
              onChange={(e) => set("apetito_ute", e.target.checked)}
              className="h-4 w-4 rounded border-border accent-foreground"
            />
            <span>
              Acepto licitaciones donde solo encajo en UTE (con socio).
            </span>
          </label>
        </Section>

        <Section
          title="Territorios"
          help="Ranking, no filtro: las preferidas suben la puntuación, las marcadas como evitar la bajan (no las descartan)."
        >
          <TerritoriosEditor
            value={form.territorios}
            onChange={(t) => set("territorios", t)}
          />
        </Section>

        <Section
          title="Tipo de obra (CPV)"
          help="División CPV (2 dígitos). Core = línea principal. No interesa = filtro negativo."
        >
          <CpvsEditor
            value={form.cpvs}
            onChange={(c) => set("cpvs", c)}
          />
        </Section>

        <Section title="Notas">
          <textarea
            value={form.notas}
            onChange={(e) => set("notas", e.target.value)}
            rows={3}
            placeholder="Cualquier preferencia que no encaje arriba…"
            className="w-full resize-y rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30"
          />
        </Section>
      </div>

      <div className="mt-10 flex items-center gap-4">
        <button
          type="submit"
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-foreground/90 disabled:opacity-50"
        >
          {save.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" strokeWidth={2} />
              Guardar preferencias
            </>
          )}
        </button>
        {save.isSuccess && savedTick > 0 && (
          <span
            key={savedTick}
            className="inline-flex items-center gap-1.5 text-sm text-success"
          >
            <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
            Guardado
          </span>
        )}
        {save.isError && (
          <span className="text-sm text-danger">
            {save.error instanceof Error
              ? save.error.message
              : "Error al guardar"}
          </span>
        )}
      </div>
    </form>
  );
}

// ─── Editores anidados ──────────────────────────────────────────────────────

function TerritoriosEditor({
  value,
  onChange,
}: {
  value: PreferenciaTerritorio[];
  onChange: (v: PreferenciaTerritorio[]) => void;
}) {
  const usadas = useMemo(
    () =>
      new Set(
        value
          .map((t) => t.provincia_codigo)
          .filter((p): p is string => p != null),
      ),
    [value],
  );
  const disponibles = PROVINCIAS.filter((p) => !usadas.has(p.codigo));

  const add = (codigo: string) => {
    onChange([
      ...value,
      { comarca_codigo: null, provincia_codigo: codigo, prioridad: "ok" },
    ]);
  };
  const update = (idx: number, patch: Partial<PreferenciaTerritorio>) => {
    const next = value.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Aún no has añadido ninguna provincia. Añade las que te interesen
          con su prioridad.
        </p>
      )}
      {value.map((t, idx) => {
        const prov = PROVINCIAS.find((p) => p.codigo === t.provincia_codigo);
        return (
          <div
            key={idx}
            className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 ring-1 ring-border"
          >
            <span className="flex-1 text-sm">
              {prov ? prov.nombre : t.provincia_codigo ?? t.comarca_codigo}
            </span>
            <div className="w-44">
              <CustomSelect
                value={t.prioridad}
                options={(Object.entries(PRIORIDAD_TERRITORIO_LABELS) as [
                  PrioridadTerritorio,
                  string,
                ][]).map(([value, label]) => ({ value, label }))}
                onChange={(v) =>
                  update(idx, { prioridad: v as PrioridadTerritorio })
                }
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-muted-foreground transition-colors hover:text-danger"
              aria-label="Quitar territorio"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
      {disponibles.length > 0 && (
        <div className="pt-2">
          <CustomSelect
            value=""
            options={[
              { value: "", label: "Añadir provincia…" },
              ...disponibles.map((p) => ({ value: p.codigo, label: p.nombre })),
            ]}
            onChange={(v) => v && add(v as string)}
          />
        </div>
      )}
    </div>
  );
}

function CpvsEditor({
  value,
  onChange,
}: {
  value: PreferenciaCpv[];
  onChange: (v: PreferenciaCpv[]) => void;
}) {
  const usadas = useMemo(
    () => new Set(value.map((c) => c.cpv_division)),
    [value],
  );
  const disponibles = CPV_DIVISIONES.filter((c) => !usadas.has(c.codigo));

  const add = (codigo: string) => {
    onChange([
      ...value,
      { cpv_division: codigo, prioridad: "secundario" },
    ]);
  };
  const update = (idx: number, patch: Partial<PreferenciaCpv>) => {
    const next = value.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Sin CPVs marcados. El motor recomendará en función de tu histórico
          de certificados, sin sesgo de preferencias.
        </p>
      )}
      {value.map((c, idx) => {
        const cpv = CPV_DIVISIONES.find((d) => d.codigo === c.cpv_division);
        return (
          <div
            key={idx}
            className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2 ring-1 ring-border"
          >
            <span className="flex-1 text-sm">
              {cpv ? cpv.nombre : c.cpv_division}
            </span>
            <div className="w-44">
              <CustomSelect
                value={c.prioridad}
                options={(Object.entries(PRIORIDAD_CPV_LABELS) as [
                  PrioridadCpv,
                  string,
                ][]).map(([value, label]) => ({ value, label }))}
                onChange={(v) => update(idx, { prioridad: v as PrioridadCpv })}
              />
            </div>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-muted-foreground transition-colors hover:text-danger"
              aria-label="Quitar CPV"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
      {disponibles.length > 0 && (
        <div className="pt-2">
          <CustomSelect
            value=""
            options={[
              { value: "", label: "Añadir división CPV…" },
              ...disponibles.map((c) => ({ value: c.codigo, label: c.nombre })),
            ]}
            onChange={(v) => v && add(v as string)}
          />
        </div>
      )}
    </div>
  );
}

// ─── Helpers UI ─────────────────────────────────────────────────────────────

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
      <h2 className="font-serif text-lg font-medium">{title}</h2>
      {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && (
        <span className="mt-1 block text-xs text-muted-foreground/80">
          {hint}
        </span>
      )}
    </label>
  );
}

function Input({
  value,
  onChange,
  mono = false,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30 ${
        mono ? "font-mono" : ""
      } ${className}`}
    />
  );
}
