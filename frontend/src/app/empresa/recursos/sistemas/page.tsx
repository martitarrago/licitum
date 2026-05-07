"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { useEmpresaId } from "@/lib/auth";
import {
  TIPO_SISTEMA_LABELS,
  TIPO_SISTEMA_OPTIONS,
  sistemasGestionApi,
  type SistemaGestionCreatePayload,
  type SistemaGestionEmpresa,
  type SistemaGestionPatchPayload,
  type TipoSistemaGestion,
} from "@/lib/api/sistemas_gestion";

type FormState = {
  tipo: TipoSistemaGestion;
  fecha_emision: string;
  fecha_caducidad: string;
  entidad_certificadora: string;
  alcance: string;
  notas: string;
};

const empty: FormState = {
  tipo: "iso_9001",
  fecha_emision: "",
  fecha_caducidad: "",
  entidad_certificadora: "",
  alcance: "",
  notas: "",
};

function fromApi(s: SistemaGestionEmpresa): FormState {
  return {
    tipo: s.tipo,
    fecha_emision: s.fecha_emision ?? "",
    fecha_caducidad: s.fecha_caducidad ?? "",
    entidad_certificadora: s.entidad_certificadora ?? "",
    alcance: s.alcance ?? "",
    notas: s.notas ?? "",
  };
}

function buildPatch(f: FormState): SistemaGestionPatchPayload {
  return {
    tipo: f.tipo,
    fecha_emision: f.fecha_emision === "" ? null : f.fecha_emision,
    fecha_caducidad: f.fecha_caducidad === "" ? null : f.fecha_caducidad,
    entidad_certificadora:
      f.entidad_certificadora.trim() === ""
        ? null
        : f.entidad_certificadora.trim(),
    alcance: f.alcance.trim() === "" ? null : f.alcance.trim(),
    notas: f.notas.trim() === "" ? null : f.notas.trim(),
  };
}

function buildCreate(f: FormState, empresaId: string): SistemaGestionCreatePayload {
  return { empresa_id: empresaId, ...buildPatch(f) } as SistemaGestionCreatePayload;
}

function estadoCaducidad(fecha: string | null): {
  label: string;
  cls: string;
} {
  if (!fecha) return { label: "Sin caducidad", cls: "bg-muted text-muted-foreground" };
  const dias = Math.floor(
    (new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (dias < 0) return { label: "Caducado", cls: "bg-danger/10 text-danger" };
  if (dias <= 30)
    return { label: `Caduca en ${dias}d`, cls: "bg-warning/10 text-warning" };
  return { label: "Vigente", cls: "bg-success/10 text-success" };
}

export default function SistemasGestionPage() {
  const empresaId = useEmpresaId();
  const QUERY_KEY = ["sistemas-gestion", empresaId] as const;
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => sistemasGestionApi.list(empresaId),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SistemaGestionEmpresa | null>(null);
  const [form, setForm] = useState<FormState>(empty);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setModalOpen(true);
  };
  const openEdit = (s: SistemaGestionEmpresa) => {
    setEditing(s);
    setForm(fromApi(s));
    setModalOpen(true);
  };
  const close = () => setModalOpen(false);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? sistemasGestionApi.patch(editing.id, buildPatch(form))
        : sistemasGestionApi.create(buildCreate(form, empresaId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      close();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => sistemasGestionApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          ISOs y planes propios con alcance descriptivo. El Sobre B necesita
          citar entidad certificadora y ámbito, no solo presentar el PDF.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Añadir sistema
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
                <Th>Certificadora</Th>
                <Th>Caducidad</Th>
                <Th>Estado</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => {
                const est = estadoCaducidad(s.fecha_caducidad);
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <Td className="font-medium">{TIPO_SISTEMA_LABELS[s.tipo]}</Td>
                    <Td className="text-muted-foreground">
                      {s.entidad_certificadora ?? "—"}
                    </Td>
                    <Td className="font-mono text-xs">
                      {s.fecha_caducidad ?? "—"}
                    </Td>
                    <Td>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${est.cls}`}
                      >
                        {est.label}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`¿Eliminar ${TIPO_SISTEMA_LABELS[s.tipo]}?`)) {
                              remove.mutate(s.id);
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <Modal onClose={close}>
          <form onSubmit={submit} className="p-6">
            <h3 className="font-serif text-lg font-medium">
              {editing ? "Editar sistema" : "Añadir sistema de gestión"}
            </h3>

            <div className="mt-5 space-y-4">
              <Field label="Tipo" required>
                <CustomSelect
                  value={form.tipo}
                  options={TIPO_SISTEMA_OPTIONS}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, tipo: v as TipoSistemaGestion }))
                  }
                />
              </Field>
              <Field label="Entidad certificadora">
                <Input
                  value={form.entidad_certificadora}
                  onChange={(v) =>
                    setForm((s) => ({ ...s, entidad_certificadora: v }))
                  }
                />
              </Field>
              <Two>
                <Field label="Fecha emisión">
                  <DatePicker
                    value={form.fecha_emision}
                    onChange={(v) =>
                      setForm((s) => ({ ...s, fecha_emision: v }))
                    }
                    placeholder="Seleccionar…"
                    aria-label="Fecha emisión"
                  />
                </Field>
                <Field label="Fecha caducidad">
                  <DatePicker
                    value={form.fecha_caducidad}
                    onChange={(v) =>
                      setForm((s) => ({ ...s, fecha_caducidad: v }))
                    }
                    placeholder="Seleccionar…"
                    aria-label="Fecha caducidad"
                  />
                </Field>
              </Two>
              <Field label="Alcance">
                <textarea
                  value={form.alcance}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, alcance: e.target.value }))
                  }
                  rows={3}
                  placeholder="Ámbito cubierto por la certificación…"
                  className="w-full resize-y rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30"
                />
              </Field>
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
                disabled={save.isPending}
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
        Aún no hay sistemas de gestión registrados.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        Añadir primer sistema
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
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30"
    />
  );
}
