"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, FileUp, X } from "lucide-react";
import { certificadosApi } from "@/lib/api/certificados";
import { EMPRESA_DEMO_ID } from "@/lib/constants";

interface UploadModalProps {
  onClose: () => void;
}

export function UploadModal({ onClose }: UploadModalProps) {
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

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setUploading(true);
    setProgress(0);

    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("empresa_id", EMPRESA_DEMO_ID);

    try {
      const cert = await certificadosApi.upload(fd, setProgress);
      await qc.invalidateQueries({ queryKey: ["certificados"] });
      onClose();
      router.push(`/solvencia/certificados/${cert.id}/revisar`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir el archivo");
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-surface-raised ring-1 ring-border shadow-md">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-foreground">
            Subir certificado de obra
          </h2>
          {!uploading && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {/* Zona drop */}
          {!file ? (
            <div
              role="button"
              tabIndex={0}
              aria-label="Zona de subida de PDF"
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              className={`
                flex cursor-pointer flex-col items-center justify-center gap-4
                rounded-xl border-2 border-dashed py-14 text-center
                transition-colors
                ${
                  dragging
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    : "border-border bg-muted hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/10"
                }
              `}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/30">
                <FileUp className="h-7 w-7 text-primary-500" aria-hidden="true" />
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
            /* Archivo seleccionado */
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5">
                <FileUp className="h-4 w-4 flex-shrink-0 text-primary-500" aria-hidden="true" />
                <span className="truncate text-sm font-medium text-foreground">
                  {file.name}
                </span>
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

              <p className="text-xs text-muted-foreground">
                Extraeremos la información del certificado automáticamente. En el
                siguiente paso podrás revisar y corregir los datos antes de validarlos.
                Suele tardar entre 30 y 60 segundos.
              </p>

              {/* Barra de progreso */}
              {uploading && (
                <div className="space-y-1.5">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-right text-xs tabular-nums text-muted-foreground">
                    {progress}%
                  </p>
                </div>
              )}

              {/* Error */}
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
                  className="
                    inline-flex items-center gap-2 rounded-lg
                    bg-primary-500 px-4 py-2 text-sm font-medium text-white
                    transition-colors hover:bg-primary-700
                    disabled:pointer-events-none disabled:opacity-60
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500
                  "
                >
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  {uploading ? "Subiendo…" : "Subir certificado"}
                </button>
              </div>
            </div>
          )}

          {/* Error en zona drop */}
          {!file && error && (
            <p className="mt-2 text-center text-sm text-danger">{error}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={onFileInput}
          tabIndex={-1}
        />
      </div>
    </div>
  );
}
