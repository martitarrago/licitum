"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FileUp, PenLine, X } from "lucide-react";
import { certificadosApi } from "@/lib/api/certificados";
import { EMPRESA_DEMO_ID } from "@/lib/constants";
import { DatePicker } from "@/components/ui/DatePicker";
import { CustomSelect } from "@/components/ui/CustomSelect";

interface UploadModalProps {
  onClose: () => void;
}

const TIPOS_DOCUMENTO = [
  { value: "cert_buena_ejecucion", label: "Certificado de buena ejecución" },
  { value: "acta_recepcion", label: "Acta de recepción" },
  { value: "cert_rolece", label: "Certificado ROLECE" },
  { value: "contrato_adjudicacion", label: "Contrato de adjudicación" },
  { value: "certificacion_parcial", label: "Certificación parcial" },
  { value: "asistencia_tecnica", label: "Asistencia técnica" },
  { value: "subcontratacion", label: "Subcontratación" },
  { value: "otro", label: "Otro" },
];

type Tab = "pdf" | "manual";

// ─── Pestaña PDF ────────────────────────────────────────────────────────────

function TabPdf({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const acceptFile = useCallback((f: File) => {
    if (f.type !== "application/pdf") {
      setError("Solo se aceptan archivos PDF.");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      setError("El archivo supera el tamaño máximo de 25 MB.");
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) acceptFile(f);
    },
    [acceptFile],
  );

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);

    const fakeInterval = setInterval(() => {
      setProgress((p) => (p < 80 ? Math.min(p + 3, 80) : p));
    }, 400);

    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("empresa_id", EMPRESA_DEMO_ID);

    try {
      const cert = await certificadosApi.upload(fd, () => {});
      clearInterval(fakeInterval);
      setProgress(100);
      await qc.invalidateQueries({ queryKey: ["certificados"] });
      onClose();
      router.push(`/empresa/certificados/${cert.id}/revisar`);
    } catch (err) {
      clearInterval(fakeInterval);
      setError(err instanceof Error ? err.message : "Error al subir el archivo");
      setUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      {!file ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Zona de subida de PDF"
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
          }}
          className={[
            "flex cursor-pointer flex-col items-center justify-center gap-4",
            "rounded-xl border-2 border-dashed py-14 text-center transition-colors",
            dragging
              ? "border-foreground bg-muted"
              : "border-border bg-muted hover:border-foreground/40 hover:bg-muted/80",
          ].join(" ")}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FileUp className="h-7 w-7 text-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              Arrastra tu certificado aquí
            </p>
            <p className="text-xs text-muted-foreground">
              o haz clic para seleccionarlo · PDF · máx. 25 MB
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
            <FileUp className="h-4 w-4 flex-shrink-0 text-foreground" aria-hidden="true" />
            <span className="truncate text-sm font-medium text-foreground">{file.name}</span>
            <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground tabular-nums">
              {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            {!uploading && (
              <button
                onClick={() => setFile(null)}
                className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Quitar archivo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="rounded-lg bg-muted px-4 py-3 space-y-1">
            <p className="text-sm font-medium text-foreground">
              Extraeremos la información automáticamente
            </p>
            <p className="text-sm text-muted-foreground">
              En el siguiente paso podrás revisar y corregir los datos antes de
              validarlos. Suele tardar entre 30 y 60 segundos.
            </p>
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-all duration-[2000ms] ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-right text-xs tabular-nums text-muted-foreground">
                {progress < 100 ? "Subiendo…" : "Procesando…"}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 ring-1 ring-danger/25">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-danger mt-0.5" aria-hidden="true" />
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <button
              onClick={() => setFile(null)}
              disabled={uploading}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            >
              ← Cambiar archivo
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:opacity-85 disabled:pointer-events-none disabled:opacity-60"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              {uploading ? "Subiendo…" : "Subir y extraer información"}
            </button>
          </div>
        </div>
      )}

      {!file && error && (
        <p className="mt-2 text-center text-sm text-danger">{error}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
        tabIndex={-1}
      />
    </div>
  );
}

// ─── Pestaña Manual ─────────────────────────────────────────────────────────

function TabManual({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tipoDocumento, setTipoDocumento] = useState("");
  const [titulo, setTitulo] = useState("");
  const [organismo, setOrganismo] = useState("");
  const [importe, setImporte] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [expediente, setExpediente] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tipoDocumento) {
      setError("El tipo de documento es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await certificadosApi.createManual({
        empresa_id: EMPRESA_DEMO_ID,
        tipo_documento: tipoDocumento,
        titulo: titulo || undefined,
        organismo: organismo || undefined,
        importe_adjudicacion: importe ? parseFloat(importe) : undefined,
        fecha_inicio: fechaInicio || undefined,
        fecha_fin: fechaFin || undefined,
        numero_expediente: expediente || undefined,
      });
      await qc.invalidateQueries({ queryKey: ["certificados"] });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
      setSaving(false);
    }
  };

  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";
  const inputClass =
    "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/20";

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div>
        <label className={labelClass}>Tipo de documento *</label>
        <CustomSelect
          value={tipoDocumento}
          onChange={setTipoDocumento}
          options={TIPOS_DOCUMENTO}
          placeholder="Selecciona el tipo…"
        />
      </div>

      <div>
        <label className={labelClass}>Título / descripción de la obra</label>
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          maxLength={512}
          placeholder="Ej: Pavimentació carrer Major, Reus"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Organismo contratante</label>
        <input
          type="text"
          value={organismo}
          onChange={(e) => setOrganismo(e.target.value)}
          maxLength={255}
          placeholder="Ej: Ajuntament de Reus"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Importe (€ sin IVA)</label>
          <input
            type="number"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            min="0"
            step="0.01"
            placeholder="0.00"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Nº expediente</label>
          <input
            type="text"
            value={expediente}
            onChange={(e) => setExpediente(e.target.value)}
            maxLength={128}
            placeholder="Ej: 2023/OB/042"
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Fecha inicio</label>
          <DatePicker value={fechaInicio} onChange={setFechaInicio} />
        </div>
        <div>
          <label className={labelClass}>Fecha fin / recepción</label>
          <DatePicker value={fechaFin} onChange={setFechaFin} />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 ring-1 ring-danger/25">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-danger mt-0.5" aria-hidden="true" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="flex justify-end gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !tipoDocumento}
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-colors hover:opacity-85 disabled:pointer-events-none disabled:opacity-60"
        >
          <PenLine className="h-4 w-4" aria-hidden="true" />
          {saving ? "Guardando…" : "Guardar certificado"}
        </button>
      </div>
    </form>
  );
}

// ─── Modal contenedor ────────────────────────────────────────────────────────

export function UploadModal({ onClose }: UploadModalProps) {
  const [tab, setTab] = useState<Tab>("pdf");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-surface-raised ring-1 ring-border shadow-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            Añadir certificado de obra
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {(["pdf", "manual"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "flex items-center gap-1.5 py-3 pr-4 text-sm transition-colors",
                "border-b-2 -mb-px",
                tab === t
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {t === "pdf" ? (
                <><FileUp className="h-3.5 w-3.5" aria-hidden="true" /> Subir PDF</>
              ) : (
                <><PenLine className="h-3.5 w-3.5" aria-hidden="true" /> Entrada manual</>
              )}
            </button>
          ))}
        </div>

        {tab === "pdf" ? (
          <TabPdf onClose={onClose} />
        ) : (
          <TabManual onClose={onClose} />
        )}
      </div>
    </div>
  );
}
