"use client";

import { useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Loader2,
  Printer,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { sobreAApi } from "@/lib/api/sobre_a";

export default function SobreADetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["sobre-a", params.id],
    queryFn: () => sobreAApi.get(params.id),
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
            href="/sobre-a"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Histórico
          </Link>
          {data && (
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {data.expediente}
              </p>
              {data.usa_relic && (
                <span className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-foreground/10">
                  <ShieldCheck className="h-3 w-3" strokeWidth={2.25} />
                  RELIC
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <p className="hidden text-xs text-muted-foreground sm:block">
            Revisa el documento → imprime o guarda como PDF → firma
          </p>
          <button
            onClick={onPrint}
            disabled={!data}
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-surface transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" strokeWidth={2} />
            Imprimir / guardar como PDF
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
              No se pudo cargar el Sobre A
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
            title={`Sobre A — ${data.expediente}`}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-same-origin allow-modals"
          />
        )}
      </main>
    </div>
  );
}
