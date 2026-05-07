"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import {
  documentosApi,
  TIPO_DOCUMENTO_LABELS,
  type DocumentoEmpresa,
  type EstadoDocumento,
  type ResumenSaludDocumental,
} from "@/lib/api/documentos";
import { useEmpresaId } from "@/lib/auth";
import { DocumentosUploadModal } from "@/components/empresa/DocumentosUploadModal";

export default function DocumentosPage() {
  const empresaId = useEmpresaId();
  const QUERY_KEYS = {
    list: ["documentos", empresaId] as const,
    resumen: ["documentos-resumen", empresaId] as const,
  };
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: QUERY_KEYS.list,
    queryFn: () => documentosApi.list(empresaId),
  });
  const resumen = useQuery({
    queryKey: QUERY_KEYS.resumen,
    queryFn: () => documentosApi.resumenSalud(empresaId),
  });

  const del = useMutation({
    mutationFn: (id: string) => documentosApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.list });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.resumen });
    },
  });

  const onDelete = (d: DocumentoEmpresa) => {
    if (
      confirm(
        `¿Borrar "${d.titulo ?? TIPO_DOCUMENTO_LABELS[d.tipo]}"? Si tenía PDF, también se borrará.`,
      )
    ) {
      del.mutate(d.id);
    }
  };

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-end gap-4">
        <button onClick={() => setOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Nuevo documento
        </button>
      </div>

      {resumen.data && <SaludDocumental data={resumen.data} />}

      <section className="mt-8">
        <h2 className="mb-3 font-serif text-xl font-medium">Todos los documentos</h2>
        {list.isLoading ? (
          <div className="h-48 animate-pulse rounded-2xl bg-muted/30" />
        ) : !list.data || list.data.length === 0 ? (
          <EmptyState onAdd={() => setOpen(true)} />
        ) : (
          <DocumentosTabla items={list.data} onDelete={onDelete} />
        )}
      </section>

      {open && <DocumentosUploadModal onClose={() => setOpen(false)} />}
    </>
  );
}

// ─── Salud documental KPI ───────────────────────────────────────────────────

function SaludDocumental({ data }: { data: ResumenSaludDocumental }) {
  const pct = data.total === 0 ? 100 : Math.round((data.vigentes / data.total) * 100);
  const color =
    pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger";

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Salud documental</p>
          <p className={`display-num mt-2 text-5xl leading-none ${color}`}>
            {pct}%
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            documentos al día — {data.vigentes} de {data.total}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-8">
          <Stat label="Vigentes" value={data.vigentes} dotClass="bg-success" />
          <Stat label="A caducar" value={data.a_caducar} dotClass="bg-warning" />
          <Stat label="Caducados" value={data.caducados} dotClass="bg-danger" />
        </div>
      </div>

      {data.proximos_a_caducar.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <p className="eyebrow mb-3">Atención inmediata</p>
          <ul className="space-y-2">
            {data.proximos_a_caducar.map((d) => {
              const dotColor = d.estado === "caducado" ? "bg-danger" : "bg-warning";
              return (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`}
                      aria-hidden="true"
                    />
                    <span className="font-medium">
                      {TIPO_DOCUMENTO_LABELS[d.tipo]}
                    </span>
                    {d.titulo && (
                      <span className="text-muted-foreground">— {d.titulo}</span>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDeadline(d.dias_a_caducidad)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: number;
  dotClass: string;
}) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} aria-hidden="true" />
        <span className="display-num text-2xl">{value}</span>
      </div>
      <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

// ─── Tabla ──────────────────────────────────────────────────────────────────

function DocumentosTabla({
  items,
  onDelete,
}: {
  items: DocumentoEmpresa[];
  onDelete: (d: DocumentoEmpresa) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-surface-raised ring-1 ring-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Título</th>
            <th className="px-4 py-3">Emisión</th>
            <th className="px-4 py-3">Caducidad</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr
              key={d.id}
              className="border-b border-border last:border-b-0 hover:bg-muted/20"
            >
              <td className="px-4 py-3 font-medium">
                {TIPO_DOCUMENTO_LABELS[d.tipo]}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {d.titulo ?? <span className="italic">—</span>}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {fmtFecha(d.fecha_emision)}
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {fmtFecha(d.fecha_caducidad)}
              </td>
              <td className="px-4 py-3">
                <EstadoBadge estado={d.estado} dias={d.dias_a_caducidad} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  {d.pdf_url && (
                    <a
                      href={`/api/v1/empresa/documentos/${d.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                      title="Ver PDF"
                    >
                      <ExternalLink className="h-4 w-4" strokeWidth={2} />
                    </a>
                  )}
                  <button
                    onClick={() => onDelete(d)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                    title="Borrar"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EstadoBadge({
  estado,
  dias,
}: {
  estado: EstadoDocumento;
  dias: number | null;
}) {
  if (estado === "vigente") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
        Vigente
      </span>
    );
  }
  if (estado === "a_caducar") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
        <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
        {dias != null ? `${dias} d` : "A caducar"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
      <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-hidden="true" />
      {dias != null ? `${Math.abs(dias)} d caducado` : "Caducado"}
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-20 text-center">
      <h3 className="font-display text-2xl font-bold tracking-tight">
        Aún no has subido ningún documento
      </h3>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Sube tu certificado de Hacienda al corriente, el de Seguridad Social y
        las pólizas. Te avisaremos antes de que caduquen.
      </p>
      <button onClick={onAdd} className="btn-primary mt-6">
        <Plus className="h-4 w-4" strokeWidth={2} />
        Subir el primero
      </button>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtFecha(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDeadline(dias: number | null): string {
  if (dias == null) return "sin caducidad";
  if (dias < 0) return `caducó hace ${Math.abs(dias)} d`;
  if (dias === 0) return "caduca hoy";
  if (dias === 1) return "caduca mañana";
  return `caduca en ${dias} d`;
}
