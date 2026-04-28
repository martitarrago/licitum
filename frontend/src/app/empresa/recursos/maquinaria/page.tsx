"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import {
  PROPIEDAD_LABELS,
  PROPIEDAD_OPTIONS,
  maquinariaApi,
  type MaquinariaCreatePayload,
  type MaquinariaEmpresa,
  type MaquinariaPatchPayload,
  type PropiedadMaquinaria,
} from "@/lib/api/maquinaria";

const QUERY_KEY = ["maquinaria", EMPRESA_DEMO_ID] as const;

type FormState = {
  tipo: string;
  marca: string;
  modelo: string;
  anio: string;
  matricula: string;
  propiedad: PropiedadMaquinaria;
  itv_caducidad: string;
  notas: string;
};

const empty: FormState = {
  tipo: "",
  marca: "",
  modelo: "",
  anio: "",
  matricula: "",
  propiedad: "propia",
  itv_caducidad: "",
  notas: "",
};

function fromApi(m: MaquinariaEmpresa): FormState {
  return {
    tipo: m.tipo,
    marca: m.marca ?? "",
    modelo: m.modelo ?? "",
    anio: m.anio != null ? String(m.anio) : "",
    matricula: m.matricula ?? "",
    propiedad: m.propiedad,
    itv_caducidad: m.itv_caducidad ?? "",
    notas: m.notas ?? "",
  };
}

function buildPatch(f: FormState): MaquinariaPatchPayload {
  const num = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };
  return {
    tipo: f.tipo.trim(),
    marca: f.marca.trim() === "" ? null : f.marca.trim(),
    modelo: f.modelo.trim() === "" ? null : f.modelo.trim(),
    anio: num(f.anio),
    matricula: f.matricula.trim() === "" ? null : f.matricula.trim(),
    propiedad: f.propiedad,
    itv_caducidad: f.itv_caducidad === "" ? null : f.itv_caducidad,
    notas: f.notas.trim() === "" ? null : f.notas.trim(),
  };
}

function buildCreate(f: FormState): MaquinariaCreatePayload {
  return { empresa_id: EMPRESA_DEMO_ID, ...buildPatch(f) } as MaquinariaCreatePayload;
}

export default function MaquinariaPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => maquinariaApi.list(EMPRESA_DEMO_ID),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaquinariaEmpresa | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setModalOpen(true);
  };
  const openEdit = (m: MaquinariaEmpresa) => {
    setEditing(m);
    setForm(fromApi(m));
    setModalOpen(true);
  };
  const close = () => setModalOpen(false);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? maquinariaApi.patch(editing.id, buildPatch(form))
        : maquinariaApi.create(buildCreate(form)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      close();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => maquinariaApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.tipo.trim() === "") return;
    save.mutate();
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Inventario operativo: camiones, retros, compresores, encofrados.
          Sobre B y match suave para pliegos con maquinaria especial.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Añadir equipo
        </button>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : !data || data.length === 0 ? (
        <Empty onCreate={openCreate} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <Th>Tipo</Th>
                <Th>Marca / modelo</Th>
                <Th className="text-right">Año</Th>
                <Th>Matrícula</Th>
                <Th>Propiedad</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-border/60 last:border-0"
                >
                  <Td className="font-medium">{m.tipo}</Td>
                  <Td className="text-muted-foreground">
                    {[m.marca, m.modelo].filter(Boolean).join(" · ") || "—"}
                  </Td>
                  <Td className="text-right tabular-nums">{m.anio ?? "—"}</Td>
                  <Td className="font-mono text-xs">{m.matricula ?? "—"}</Td>
                  <Td>{PROPIEDAD_LABELS[m.propiedad]}</Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(m)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Eliminar ${m.tipo}?`)) {
                            remove.mutate(m.id);
                          }
                        }}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal onClose={close}>
          <form onSubmit={submit} className="p-6">
            <h3 className="font-serif text-lg font-medium">
              {editing ? "Editar maquinaria" : "Añadir maquinaria"}
            </h3>

            <div className="mt-5 space-y-4">
              <Field label="Tipo / descripción" required>
                <Input
                  value={form.tipo}
                  onChange={(v) => setForm((s) => ({ ...s, tipo: v }))}
                />
              </Field>
              <Two>
                <Field label="Marca">
                  <Input
                    value={form.marca}
                    onChange={(v) => setForm((s) => ({ ...s, marca: v }))}
                  />
                </Field>
                <Field label="Modelo">
                  <Input
                    value={form.modelo}
                    onChange={(v) => setForm((s) => ({ ...s, modelo: v }))}
                  />
                </Field>
              </Two>
              <Two>
                <Field label="Año">
                  <Input
                    value={form.anio}
                    onChange={(v) =>
                      setForm((s) => ({ ...s, anio: v.replace(/[^0-9]/g, "") }))
                    }
                    mono
                  />
                </Field>
                <Field label="Matrícula">
                  <Input
                    value={form.matricula}
                    onChange={(v) =>
                      setForm((s) => ({ ...s, matricula: v.toUpperCase() }))
                    }
                    mono
                  />
                </Field>
              </Two>
              <Two>
                <Field label="Propiedad">
                  <CustomSelect
                    value={form.propiedad}
                    options={PROPIEDAD_OPTIONS}
                    onChange={(v) =>
                      setForm((s) => ({
                        ...s,
                        propiedad: v as PropiedadMaquinaria,
                      }))
                    }
                  />
                </Field>
                <Field label="Caducidad ITV">
                  <DatePicker
                    value={form.itv_caducidad}
                    onChange={(v) =>
                      setForm((s) => ({ ...s, itv_caducidad: v }))
                    }
                    placeholder="Seleccionar…"
                    aria-label="Caducidad ITV"
                  />
                </Field>
              </Two>
              <Field label="Notas">
                <textarea
                  value={form.notas}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, notas: e.target.value }))
                  }
                  rows={2}
                  className="w-full resize-y rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30"
                />
              </Field>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={save.isPending || form.tipo.trim() === ""}
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90 disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Guardar cambios" : "Añadir"}
              </button>
            </div>
            {save.isError && (
              <p className="mt-3 text-sm text-danger">
                {save.error instanceof Error
                  ? save.error.message
                  : "Error al guardar"}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── UI helpers ─────────────────────────────────────────────────────────────

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <th className={`px-4 py-2.5 font-medium ${className}`}>{children}</th>;
}

function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl bg-surface-raised p-10 text-center ring-1 ring-border">
      <p className="text-sm text-muted-foreground">
        Aún no hay maquinaria registrada.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        Añadir primer equipo
      </button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
      ))}
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-surface-raised shadow-elev-3 ring-1 ring-border">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
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
    </label>
  );
}

function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function Input({
  value,
  onChange,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30 ${
        mono ? "font-mono" : ""
      }`}
    />
  );
}
