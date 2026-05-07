"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { FileSignature, Loader2 } from "lucide-react";
import { sobreAApi } from "@/lib/api/sobre_a";
import { useEmpresaId } from "@/lib/auth";

interface Props {
  expediente: string;
  variant?: "primary" | "secondary";
}

export function GenerarSobreABoton({ expediente, variant = "secondary" }: Props) {
  const router = useRouter();
  const empresaId = useEmpresaId();

  const generar = useMutation({
    mutationFn: () => sobreAApi.generar(expediente, empresaId),
    onSuccess: (data) => {
      router.push(`/sobre-a/${data.id}`);
    },
  });

  const cls =
    variant === "primary"
      ? "inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-surface transition-opacity hover:opacity-85 disabled:opacity-50"
      : "inline-flex items-center gap-2 rounded-lg bg-surface px-5 py-2.5 text-sm font-medium text-muted-foreground ring-1 ring-border transition-colors hover:text-foreground disabled:opacity-50";

  return (
    <button
      onClick={() => generar.mutate()}
      disabled={generar.isPending}
      className={cls}
      title={
        generar.error instanceof Error
          ? generar.error.message
          : "Generar Sobre A"
      }
    >
      {generar.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSignature className="h-4 w-4" strokeWidth={2} />
      )}
      Generar Sobre A
    </button>
  );
}
