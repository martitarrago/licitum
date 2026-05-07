"use client";

import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, X } from "lucide-react";
import {
  documentosApi,
  TIPO_DOCUMENTO_OPTIONS,
  type TipoDocumento,
} from "@/lib/api/documentos";
import { useEmpresaId } from "@/lib/auth";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DatePicker } from "@/components/ui/DatePicker";

interface Props {
  onClose: () => void;
}

export function DocumentosUploadModal({ onClose }: Props) {
  const empresaId = useEmpresaId();
  const QUERY_KEYS = {
    list: ["documentos", empresaId] as const,
    resumen: ["documentos-resumen", empresaId] as const,
  };
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoDocumento | "">("");
  const [titulo, setTitulo] = useState("");
  const [emision, setEmision] = useState<string | undefined>(undefined);
  const [caducidad, setCaducidad] = useState<string | undefined>(undefined);
  const [notas, setNotas] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (!tipo) throw new Error("Selecciona el tipo de documento");
      const payload = {
        tipo,
        titulo: titulo.trim() || undefined,
        fecha_emision: emision,
        fecha_caducidad: caducidad,
        notas: notas.trim() || undefined,
      };
      if (pdf) {
        return documentosApi.uploadConPdf(empresaId, payload, pdf);
      }
      return documentosApi.createManual({
        empresa_id: empresaId,
        ...payload,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.list });
      qc.invalidateQueries({ queryKey: QUERY_KEYS.resumen });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-surface-raised p-6 ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-xl font-medium">
              Nuevo documento
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hacienda, Seguridad Social, pólizas, ISOs, REA, TC2…
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Tipo de documento <span className="text-danger">*</span>
            </span>
            <div className="mt-1.5">
              <CustomSelect
                value={tipo}
                options={[
                  { value: "", label: "Selecciona…" },
                  ...TIPO_DOCUMENTO_OPTIONS,
                ]}
                onChange={(v) => setTipo(v as TipoDocumento | "")}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Título (opcional)
            </span>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="p.ej. Hacienda — junio 2026"
              className="mt-1.5 w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Fecha emisión
              </span>
              <div className="mt-1.5">
                <DatePicker value={emision ?? ""} onChange={(v) => setEmision(v || undefined)} />
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Fecha caducidad
              </span>
              <div className="mt-1.5">
                <DatePicker
                  value={caducidad ?? ""}
                  onChange={(v) => setCaducidad(v || undefined)}
                />
              </div>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Notas (opcional)
            </span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="mt-1.5 w-full rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30"
            />
          </label>

          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              PDF (opcional)
            </span>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
              >
                <FileUp className="h-4 w-4" strokeWidth={2} />
                {pdf ? pdf.name : "Adjuntar PDF"}
              </button>
              {pdf && (
                <button
                  type="button"
                  onClick={() => setPdf(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Quitar
                </button>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-surface px-3.5 py-2 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending || !tipo}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-surface transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              {create.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Guardando…
                </>
              ) : (
                "Guardar"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
