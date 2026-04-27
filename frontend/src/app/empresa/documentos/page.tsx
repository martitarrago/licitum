"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Plus,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  documentosApi,
  TIPO_DOCUMENTO_LABELS,
  type DocumentoEmpresa,
  type EstadoDocumento,
  type ResumenSaludDocumental,
} from "@/lib/api/documentos";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import { DocumentosUploadModal } from "@/components/empresa/DocumentosUploadModal";

const QUERY_KEYS = {
  list: ["documentos", EMPRESA_DEMO_ID] as const,
  resumen: ["documentos-resumen", EMPRESA_DEMO_ID] as const,
};

export default function DocumentosPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: QUERY_KEYS.list,
    queryFn: () => documentosApi.list(EMPRESA_DEMO_ID),
  });
  const resumen = useQuery({
    queryKey: QUERY_KEYS.resumen,
    queryFn: () => documentosApi.resumenSalud(EMPRESA_DEMO_ID),
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
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div>
          <p className="eyebrow mb-3">Empresa · M2</p>
          <h1 className="display-h text-4xl leading-[1] sm:text-5xl">
            documentos administrativos
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Hacienda, Seguridad Social, pólizas, ISOs, REA y TC2 con sus fechas
            de caducidad. Cuando ganes una adjudicación provisional tendrás{" "}
            <strong className="text-foreground">10 días hábiles</strong> para
            presentarlos — tenerlos al día evita perder obras ya ganadas.
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Nuevo documento
        </button>
      </header>

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
    </div>
  );
}

// ─── Salud documental KPI ───────────────────────────────────────────────────

function SaludDocumental({ data }: { data: ResumenSaludDocumental }) {
  const pct = data.total === 0 ? 100 : Math.round((data.vigentes / data.total) * 100);
  const color =
    pct >= 80 ? "text-success" : pct >= 50 ? "text-warning" : "text-danger";

  return (
    <section className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Salud documental
          </p>
          <p className={`mt-1 font-serif text-4xl font-medium tracking-tight ${color}`}>
            {pct}%
          </p>
          <p className="text-sm text-muted-foreground">
            documentos al día — {data.vigentes} de {data.total}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <Stat label="Vigentes" value={data.vigentes} icon={CheckCircle2} tone="success" />
          <Stat label="A caducar" value={data.a_caducar} icon={Clock} tone="warning" />
          <Stat label="Caducados" value={data.caducados} icon={XCircle} tone="danger" />
        </div>
      </div>

      {data.proximos_a_caducar.length > 0 && (
        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Atención inmediata
          </p>
          <ul className="space-y-2">
            {data.proximos_a_caducar.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <div className="flex items-center gap-2 truncate">
                  <EstadoIcon estado={d.estado} />
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
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
      ? "text-warning"
      : "text-danger";
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5">
        <Icon className={`h-4 w-4 ${toneClass}`} strokeWidth={2} />
        <span className="text-2xl font-medium tracking-tight tabular-nums">
          {value}
        </span>
      </div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
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
      <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
        Vigente
      </span>
    );
  }
  if (estado === "a_caducar") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
        <Clock className="h-3 w-3" strokeWidth={2.5} />
        {dias != null ? `${dias} d` : "A caducar"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
      <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
      {dias != null ? `${Math.abs(dias)} d caducado` : "Caducado"}
    </span>
  );
}

function EstadoIcon({ estado }: { estado: EstadoDocumento }) {
  if (estado === "caducado") {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-danger" strokeWidth={2.25} />;
  }
  return <Clock className="h-4 w-4 shrink-0 text-warning" strokeWidth={2.25} />;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-surface-raised/50 px-6 py-16 text-center">
      <FileText
        className="mx-auto h-10 w-10 text-muted-foreground"
        strokeWidth={1.5}
      />
      <h3 className="mt-4 font-serif text-lg font-medium">
        Aún no hay documentos
      </h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Sube tu certificado de Hacienda al corriente, el de Seguridad Social y
        las pólizas. Te avisaremos antes de que caduquen.
      </p>
      <button
        onClick={onAdd}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-foreground/90"
      >
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
