"use client";

import { useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Loader2,
  Printer,
  XCircle,
} from "lucide-react";
import { calculadoraApi } from "@/lib/api/calculadora";

export default function OfertaPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["oferta-economica", params.id],
    queryFn: () => calculadoraApi.get(params.id),
    staleTime: 5 * 60 * 1000,
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const onPrint = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-raised px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href={
              data
                ? `/calculadora/licitacion/${encodeURIComponent(data.expediente)}`
                : "/calculadora"
            }
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Calculadora
          </Link>
          {data && (
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {data.expediente}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <a
              href={calculadoraApi.docxUrl(data.id)}
              download
              className="inline-flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-sm font-medium text-foreground ring-1 ring-border transition-colors hover:bg-muted"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              Descargar .docx
            </a>
          )}
          <button
            onClick={onPrint}
            disabled={!data}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" strokeWidth={2} />
            Imprimir / PDF
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden bg-muted/30">
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        {isError && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <XCircle className="h-10 w-10 text-danger" />
            <p className="text-sm font-semibold text-danger">
              No se pudo cargar la oferta
            </p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Error desconocido"}
            </p>
          </div>
        )}
        {data && (
          <iframe
            ref={iframeRef}
            srcDoc={data.html}
            title={`Proposición económica — ${data.expediente}`}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-same-origin allow-modals"
          />
        )}
      </main>
    </div>
  );
}
