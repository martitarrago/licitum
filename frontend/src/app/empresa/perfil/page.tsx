"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import {
  empresaApi,
  TAMANO_PYME_LABELS,
  type Empresa,
  type EmpresaPatch,
  type TamanoPyme,
} from "@/lib/api/empresa";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import { CustomSelect } from "@/components/ui/CustomSelect";

const QUERY_KEY = ["empresa", EMPRESA_DEMO_ID] as const;

const TAMANO_OPTIONS = (
  Object.entries(TAMANO_PYME_LABELS) as [TamanoPyme, string][]
).map(([value, label]) => ({ value, label }));

type FormState = {
  nombre: string;
  cif: string;
  email: string;
  telefono: string;
  iae: string;
  cnae: string;
  tamano_pyme: TamanoPyme | "";
  direccion_calle: string;
  direccion_codigo_postal: string;
  direccion_ciudad: string;
  direccion_provincia: string;
  direccion_pais: string;
  representante_nombre: string;
  representante_nif: string;
  representante_cargo: string;
  volumen_negocio_n: string;
  volumen_negocio_n1: string;
  volumen_negocio_n2: string;
  plantilla_media: string;
};

const empty: FormState = {
  nombre: "",
  cif: "",
  email: "",
  telefono: "",
  iae: "",
  cnae: "",
  tamano_pyme: "",
  direccion_calle: "",
  direccion_codigo_postal: "",
  direccion_ciudad: "",
  direccion_provincia: "",
  direccion_pais: "ES",
  representante_nombre: "",
  representante_nif: "",
  representante_cargo: "",
  volumen_negocio_n: "",
  volumen_negocio_n1: "",
  volumen_negocio_n2: "",
  plantilla_media: "",
};

function fromEmpresa(e: Empresa): FormState {
  return {
    nombre: e.nombre,
    cif: e.cif,
    email: e.email,
    telefono: e.telefono ?? "",
    iae: e.iae ?? "",
    cnae: e.cnae ?? "",
    tamano_pyme: (e.tamano_pyme as TamanoPyme) ?? "",
    direccion_calle: e.direccion_calle ?? "",
    direccion_codigo_postal: e.direccion_codigo_postal ?? "",
    direccion_ciudad: e.direccion_ciudad ?? "",
    direccion_provincia: e.direccion_provincia ?? "",
    direccion_pais: e.direccion_pais ?? "ES",
    representante_nombre: e.representante_nombre ?? "",
    representante_nif: e.representante_nif ?? "",
    representante_cargo: e.representante_cargo ?? "",
    volumen_negocio_n: e.volumen_negocio_n ?? "",
    volumen_negocio_n1: e.volumen_negocio_n1 ?? "",
    volumen_negocio_n2: e.volumen_negocio_n2 ?? "",
    plantilla_media: e.plantilla_media != null ? String(e.plantilla_media) : "",
  };
}

function toPatch(form: FormState, original: Empresa): EmpresaPatch {
  const patch: EmpresaPatch = {};
  const setStr = (
    key: keyof EmpresaPatch,
    formVal: string,
    origVal: string | null,
  ) => {
    const trimmed = formVal.trim();
    const newVal = trimmed === "" ? null : trimmed;
    if (newVal !== origVal) (patch as Record<string, unknown>)[key] = newVal;
  };
  const setNum = (
    key: keyof EmpresaPatch,
    formVal: string,
    origVal: string | number | null,
  ) => {
    const trimmed = formVal.trim();
    if (trimmed === "") {
      if (origVal !== null) (patch as Record<string, unknown>)[key] = null;
      return;
    }
    const parsed = Number(trimmed.replace(",", "."));
    if (isNaN(parsed)) return;
    const origNum =
      typeof origVal === "string" ? Number(origVal) : (origVal ?? null);
    if (parsed !== origNum) (patch as Record<string, unknown>)[key] = parsed;
  };

  if (form.nombre.trim() && form.nombre.trim() !== original.nombre)
    patch.nombre = form.nombre.trim();
  if (form.cif.trim() && form.cif.trim() !== original.cif)
    patch.cif = form.cif.trim();
  if (form.email.trim() && form.email.trim() !== original.email)
    patch.email = form.email.trim();

  setStr("telefono", form.telefono, original.telefono);
  setStr("iae", form.iae, original.iae);
  setStr("cnae", form.cnae, original.cnae);
  if (form.tamano_pyme !== (original.tamano_pyme ?? "")) {
    patch.tamano_pyme = form.tamano_pyme === "" ? null : form.tamano_pyme;
  }
  setStr("direccion_calle", form.direccion_calle, original.direccion_calle);
  setStr(
    "direccion_codigo_postal",
    form.direccion_codigo_postal,
    original.direccion_codigo_postal,
  );
  setStr("direccion_ciudad", form.direccion_ciudad, original.direccion_ciudad);
  setStr(
    "direccion_provincia",
    form.direccion_provincia,
    original.direccion_provincia,
  );
  setStr("direccion_pais", form.direccion_pais, original.direccion_pais);
  setStr(
    "representante_nombre",
    form.representante_nombre,
    original.representante_nombre,
  );
  setStr("representante_nif", form.representante_nif, original.representante_nif);
  setStr(
    "representante_cargo",
    form.representante_cargo,
    original.representante_cargo,
  );
  setNum("volumen_negocio_n", form.volumen_negocio_n, original.volumen_negocio_n);
  setNum(
    "volumen_negocio_n1",
    form.volumen_negocio_n1,
    original.volumen_negocio_n1,
  );
  setNum(
    "volumen_negocio_n2",
    form.volumen_negocio_n2,
    original.volumen_negocio_n2,
  );
  setNum("plantilla_media", form.plantilla_media, original.plantilla_media);
  return patch;
}

export default function PerfilPage() {
  const qc = useQueryClient();
  const { data: empresa, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => empresaApi.get(EMPRESA_DEMO_ID),
  });

  const [form, setForm] = useState<FormState>(empty);
  const [savedTick, setSavedTick] = useState(0);

  useEffect(() => {
    if (empresa) setForm(fromEmpresa(empresa));
  }, [empresa]);

  const save = useMutation({
    mutationFn: (patch: EmpresaPatch) =>
      empresaApi.patch(EMPRESA_DEMO_ID, patch),
    onSuccess: (updated) => {
      qc.setQueryData(QUERY_KEY, updated);
      setSavedTick((t) => t + 1);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!empresa) return;
    const patch = toPatch(form, empresa);
    if (Object.keys(patch).length === 0) return;
    save.mutate(patch);
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted/50" />
        <div className="mt-6 h-96 animate-pulse rounded-2xl bg-muted/30" />
      </div>
    );
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      onSubmit={submit}
      className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6"
    >
      <header className="mb-10 animate-fade-up">
        <p className="eyebrow mb-3">Empresa · M2</p>
        <h1 className="display-h text-4xl leading-[1] sm:text-5xl">perfil</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Datos identificativos, dirección, representante legal y volumen de
          negocio. Alimentan el DEUC del Sobre A y la solvencia económica
          declarada en cada licitación.
        </p>
      </header>

      <div className="space-y-8">
        <Section title="Identificación">
          <Field label="Razón social" required>
            <Input value={form.nombre} onChange={(v) => set("nombre", v)} />
          </Field>
          <Two>
            <Field label="CIF" required>
              <Input
                value={form.cif}
                onChange={(v) => set("cif", v.toUpperCase())}
                mono
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                value={form.email}
                onChange={(v) => set("email", v)}
              />
            </Field>
          </Two>
          <Two>
            <Field label="Teléfono">
              <Input value={form.telefono} onChange={(v) => set("telefono", v)} />
            </Field>
            <Field label="Tamaño empresa">
              <CustomSelect
                value={form.tamano_pyme}
                options={[{ value: "", label: "Sin especificar" }, ...TAMANO_OPTIONS]}
                onChange={(v) => set("tamano_pyme", v as TamanoPyme | "")}
              />
            </Field>
          </Two>
          <Two>
            <Field label="IAE" hint="Epígrafe del Impuesto de Actividades Económicas">
              <Input value={form.iae} onChange={(v) => set("iae", v)} mono />
            </Field>
            <Field label="CNAE" hint="Clasificación Nacional de Actividades Económicas">
              <Input value={form.cnae} onChange={(v) => set("cnae", v)} mono />
            </Field>
          </Two>
        </Section>

        <Section title="Dirección">
          <Field label="Calle y número">
            <Input
              value={form.direccion_calle}
              onChange={(v) => set("direccion_calle", v)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="CP">
              <Input
                value={form.direccion_codigo_postal}
                onChange={(v) => set("direccion_codigo_postal", v)}
                mono
              />
            </Field>
            <Field label="Ciudad">
              <Input
                value={form.direccion_ciudad}
                onChange={(v) => set("direccion_ciudad", v)}
              />
            </Field>
            <Field label="Provincia">
              <Input
                value={form.direccion_provincia}
                onChange={(v) => set("direccion_provincia", v)}
              />
            </Field>
          </div>
          <Field label="País" hint="Código ISO 3166-1 alpha-2 (por defecto ES)">
            <Input
              value={form.direccion_pais}
              onChange={(v) => set("direccion_pais", v.toUpperCase())}
              mono
              maxLength={3}
              className="max-w-[120px]"
            />
          </Field>
        </Section>

        <Section
          title="Representante legal"
          help="La persona física que firma en nombre de la empresa (apoderado/a)."
        >
          <Field label="Nombre completo">
            <Input
              value={form.representante_nombre}
              onChange={(v) => set("representante_nombre", v)}
            />
          </Field>
          <Two>
            <Field label="NIF">
              <Input
                value={form.representante_nif}
                onChange={(v) => set("representante_nif", v.toUpperCase())}
                mono
              />
            </Field>
            <Field label="Cargo">
              <Input
                value={form.representante_cargo}
                onChange={(v) => set("representante_cargo", v)}
              />
            </Field>
          </Two>
        </Section>

        <Section
          title="Solvencia económica"
          help="Volumen anual de negocio (tres últimos ejercicios) y plantilla media. Acredita solvencia económica/técnica en pliegos sin clasificación obligatoria."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Año actual (€)">
              <Input
                value={form.volumen_negocio_n}
                onChange={(v) => set("volumen_negocio_n", v)}
                mono
              />
            </Field>
            <Field label="Año anterior (€)">
              <Input
                value={form.volumen_negocio_n1}
                onChange={(v) => set("volumen_negocio_n1", v)}
                mono
              />
            </Field>
            <Field label="Hace dos años (€)">
              <Input
                value={form.volumen_negocio_n2}
                onChange={(v) => set("volumen_negocio_n2", v)}
                mono
              />
            </Field>
          </div>
          <Field label="Plantilla media anual">
            <Input
              value={form.plantilla_media}
              onChange={(v) => set("plantilla_media", v.replace(/[^0-9]/g, ""))}
              mono
              className="max-w-[160px]"
            />
          </Field>
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
              Guardar cambios
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

// ─── Helpers de UI ──────────────────────────────────────────────────────────

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
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  mono = false,
  maxLength,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  mono?: boolean;
  maxLength?: number;
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      className={`w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30 ${
        mono ? "font-mono" : ""
      } ${className}`}
    />
  );
}
