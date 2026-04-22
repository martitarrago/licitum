"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Pencil,
  Power,
  X,
} from "lucide-react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  clasificacionesApi,
  type ClasificacionCreate,
  type ClasificacionRolece,
  type ClasificacionUpdate,
} from "@/lib/api/clasificaciones";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import {
  CATALOGO_JCCPE,
  CATEGORIAS_ROLECE,
  getSubgrupos,
  getNombreSubgrupo,
} from "@/lib/jccpe";

// ─── Estado de caducidad ──────────────────────────────────────────────────────

type EstadoClasificacion = "activa" | "proxima_caducar" | "caducada" | "inactiva";

function computeEstado(c: ClasificacionRolece): EstadoClasificacion {
  if (!c.activa) return "inactiva";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const caducidad = new Date(c.fecha_caducidad);
  if (caducidad < hoy) return "caducada";
  const umbral = new Date(hoy);
  umbral.setDate(umbral.getDate() + 90);
  if (caducidad <= umbral) return "proxima_caducar";
  return "activa";
}

const estadoConfig: Record<
  EstadoClasificacion,
  { label: string; badge: string; iconColor: string }
> = {
  activa: {
    label: "Activa",
    badge: "bg-success/10 ring-success/25 dark:bg-success/20",
    iconColor: "text-success",
  },
  proxima_caducar: {
    label: "Caduca pronto",
    badge: "bg-warning/10 ring-warning/25 dark:bg-warning/20",
    iconColor: "text-warning",
  },
  caducada: {
    label: "Caducada",
    badge: "bg-danger/10 ring-danger/25 dark:bg-danger/20",
    iconColor: "text-danger",
  },
  inactiva: {
    label: "Inactiva",
    badge: "bg-muted ring-border",
    iconColor: "text-muted-foreground",
  },
};

function EstadoBadge({ estado }: { estado: EstadoClasificacion }) {
  const { label, badge, iconColor } = estadoConfig[estado];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${badge} ${iconColor}`}
      role="status"
    >
      {label}
    </span>
  );
}

// ─── Form state ────────────────────────────────────────────────────────────────

interface RowForm {
  grupo: string;
  subgrupo: string;
  categoria: string;
  fecha_obtencion: string;
  fecha_caducidad: string;
}

const emptyForm: RowForm = {
  grupo: "",
  subgrupo: "",
  categoria: "",
  fecha_obtencion: "",
  fecha_caducidad: "",
};

function fromClasificacion(c: ClasificacionRolece): RowForm {
  return {
    grupo: c.grupo,
    subgrupo: c.subgrupo,
    categoria: c.categoria,
    fecha_obtencion: c.fecha_obtencion,
    fecha_caducidad: c.fecha_caducidad,
  };
}

function validateForm(f: RowForm): string | null {
  if (!f.grupo || !f.subgrupo || !f.categoria) return "Grupo, subgrupo y categoría son obligatorios.";
  if (!f.fecha_obtencion || !f.fecha_caducidad) return "Las fechas son obligatorias.";
  if (f.fecha_caducidad <= f.fecha_obtencion)
    return "La fecha de caducidad debe ser posterior a la de obtención.";
  return null;
}

// ─── Shared cell/input styles ─────────────────────────────────────────────────

const tdCls = "px-4 py-3 text-sm text-foreground";
const thCls =
  "px-4 py-3 text-left text-[10px] tracking-wide text-muted-foreground/40";

// ─── Edit row ─────────────────────────────────────────────────────────────────

function EditRow({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
  animate,
}: {
  form: RowForm;
  onChange: (f: RowForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  animate?: boolean;
}) {
  const subgrupos = getSubgrupos(form.grupo);

  const set = (key: keyof RowForm, value: string) => {
    const next = { ...form, [key]: value };
    if (key === "grupo") next.subgrupo = "";
    onChange(next);
  };

  return (
    <>
      {/* Fila de inputs */}
      <tr className={`bg-muted/60 ${animate ? "animate-fade-in" : ""}`}>
        <td className="px-4 py-2">
          <CustomSelect
            options={CATALOGO_JCCPE.map((g) => ({
              value: g.codigo,
              label: `${g.codigo} — ${g.nombre}`,
            }))}
            value={form.grupo}
            onChange={(v) => set("grupo", v)}
            placeholder="Grupo…"
            disabled={saving}
            aria-label="Grupo"
          />
        </td>
        <td className="px-4 py-2">
          <CustomSelect
            options={subgrupos.map((s) => ({
              value: s.codigo,
              label: `${form.grupo}${s.codigo} — ${s.nombre}`,
            }))}
            value={form.subgrupo}
            onChange={(v) => set("subgrupo", v)}
            placeholder="Subgrupo…"
            disabled={saving || !form.grupo}
            aria-label="Subgrupo"
          />
        </td>
        <td className="px-4 py-2">
          <CustomSelect
            options={CATEGORIAS_ROLECE.map((c) => ({
              value: c.value,
              label: c.label,
            }))}
            value={form.categoria}
            onChange={(v) => set("categoria", v)}
            placeholder="Cat.…"
            disabled={saving}
            aria-label="Categoría"
          />
        </td>
        <td className="px-4 py-2">
          <DatePicker
            value={form.fecha_obtencion}
            onChange={(v) => set("fecha_obtencion", v)}
            disabled={saving}
            placeholder="Obtenida…"
            aria-label="Fecha obtención"
          />
        </td>
        <td className="px-4 py-2">
          <DatePicker
            value={form.fecha_caducidad}
            onChange={(v) => set("fecha_caducidad", v)}
            disabled={saving}
            placeholder="Caduca…"
            aria-label="Fecha caducidad"
          />
        </td>
        <td className="px-4 py-2" />
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-colors hover:opacity-85 disabled:opacity-50"
              aria-label="Guardar"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
              aria-label="Cancelar"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </td>
      </tr>
      {/* Fila de error — ocupa el ancho completo */}
      {error && (
        <tr className="bg-muted/60">
          <td colSpan={7} className="px-4 pb-3 pt-0">
            <p className="rounded-lg bg-danger/10 px-3 py-1.5 text-xs text-danger ring-1 ring-danger/25">
              {error}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Tabla principal ──────────────────────────────────────────────────────────

const QUERY_KEY = ["clasificaciones", EMPRESA_DEMO_ID] as const;

export interface ClasificacionesTablaHandle {
  startNew: () => void;
}

export const ClasificacionesTabla = forwardRef<
  ClasificacionesTablaHandle,
  { clasificaciones: ClasificacionRolece[] }
>(function ClasificacionesTablaInner({ clasificaciones }, ref) {
  const qc = useQueryClient();

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<RowForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const createMutation = useMutation({
    mutationFn: (data: ClasificacionCreate) => clasificacionesApi.create(data),
    onSuccess: () => { invalidate(); cancelEdit(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClasificacionUpdate }) =>
      clasificacionesApi.update(id, data),
    onSuccess: () => { invalidate(); cancelEdit(); },
    onError: (e: Error) => setFormError(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) =>
      clasificacionesApi.update(id, { activa }),
    onSuccess: () => { invalidate(); setTogglingId(null); },
    onError: () => setTogglingId(null),
  });

  function startEdit(c: ClasificacionRolece) {
    setEditingId(c.id);
    setForm(fromClasificacion(c));
    setFormError(null);
  }

  function startNew() {
    setEditingId("new");
    setForm(emptyForm);
    setFormError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
  }

  useImperativeHandle(ref, () => ({ startNew }));

  function handleSave() {
    const err = validateForm(form);
    if (err) { setFormError(err); return; }
    setFormError(null);

    if (editingId === "new") {
      createMutation.mutate({
        empresa_id: EMPRESA_DEMO_ID,
        grupo: form.grupo,
        subgrupo: form.subgrupo,
        categoria: form.categoria,
        fecha_obtencion: form.fecha_obtencion,
        fecha_caducidad: form.fecha_caducidad,
      });
    } else if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: {
          grupo: form.grupo,
          subgrupo: form.subgrupo,
          categoria: form.categoria,
          fecha_obtencion: form.fecha_obtencion,
          fecha_caducidad: form.fecha_caducidad,
        },
      });
    }
  }

  function handleToggleActiva(c: ClasificacionRolece) {
    setTogglingId(c.id);
    toggleMutation.mutate({ id: c.id, activa: !c.activa });
  }

  const isSaving =
    createMutation.isPending ||
    (updateMutation.isPending && editingId !== null);

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/60">
            <th className={thCls}>Grupo</th>
            <th className={thCls}>Subgrupo</th>
            <th className={thCls}>Categoría</th>
            <th className={thCls}>Obtenida</th>
            <th className={thCls}>Caduca</th>
            <th className={thCls}>Estado</th>
            <th className={`${thCls} text-right`}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clasificaciones.map((c) => {
            const estado = computeEstado(c);
            const isEditing = editingId === c.id;
            const isToggling = togglingId === c.id;

            if (isEditing) {
              return (
                <EditRow
                  key={c.id}
                  form={form}
                  onChange={setForm}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  saving={isSaving}
                  error={formError}
                />
              );
            }

            return (
              <tr
                key={c.id}
                className={`border-b border-border last:border-0 transition-colors hover:bg-muted/30 ${!c.activa ? "opacity-60" : ""}`}
              >
                {/* Grupo */}
                <td className={tdCls}>
                  <span className="font-mono font-semibold text-foreground">
                    {c.grupo}
                  </span>
                </td>

                {/* Subgrupo */}
                <td className={tdCls}>
                  <span
                    className="font-mono text-foreground"
                    title={getNombreSubgrupo(c.grupo, c.subgrupo)}
                  >
                    {c.grupo}{c.subgrupo}
                  </span>
                </td>

                {/* Categoría */}
                <td className={`${tdCls} tabular-nums`}>
                  {c.categoria}
                </td>

                {/* Fechas */}
                <td className={`${tdCls} tabular-nums text-muted-foreground`}>
                  {c.fecha_obtencion}
                </td>
                <td className={`${tdCls} tabular-nums ${estado === "proxima_caducar" ? "font-semibold text-warning" : estado === "caducada" ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                  {c.fecha_caducidad}
                </td>

                {/* Estado */}
                <td className={tdCls}>
                  <EstadoBadge estado={estado} />
                </td>

                {/* Acciones */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => startEdit(c)}
                      disabled={editingId !== null || isToggling}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      title="Editar"
                      aria-label={`Editar clasificación ${c.grupo}${c.subgrupo}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => handleToggleActiva(c)}
                      disabled={editingId !== null || isToggling}
                      className={`rounded-md p-1.5 transition-colors disabled:pointer-events-none disabled:opacity-40 ${c.activa ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "text-success hover:bg-success/10"}`}
                      title={c.activa ? "Desactivar" : "Reactivar"}
                      aria-label={c.activa ? `Desactivar ${c.grupo}${c.subgrupo}` : `Reactivar ${c.grupo}${c.subgrupo}`}
                    >
                      <Power className={`h-3.5 w-3.5 ${isToggling ? "animate-pulse" : ""}`} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {/* Fila de nueva clasificación */}
          {editingId === "new" && (
            <EditRow
              form={form}
              onChange={setForm}
              onSave={handleSave}
              onCancel={cancelEdit}
              saving={isSaving}
              error={formError}
              animate
            />
          )}

          {/* Empty state inline */}
          {clasificaciones.length === 0 && editingId !== "new" && (
            <tr>
              <td
                colSpan={7}
                className="px-4 py-10 text-center text-sm text-muted-foreground"
              >
                No hay clasificaciones registradas. Añade la primera.
              </td>
            </tr>
          )}
        </tbody>
      </table>

    </div>
  );
});
