"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEmpresaId } from "@/lib/auth";
import { personalApi } from "@/lib/api/personal";
import { maquinariaApi } from "@/lib/api/maquinaria";
import { sistemasGestionApi } from "@/lib/api/sistemas_gestion";
import { certificadosApi } from "@/lib/api/certificados";

interface KpiSpec {
  label: string;
  nota: string;
  href: string;
  count: number | null;
  loading: boolean;
}

function Kpi({ k }: { k: KpiSpec }) {
  const empty = !k.loading && (k.count ?? 0) === 0;
  return (
    <Link
      href={k.href}
      className="card-interactive group rounded-2xl bg-surface-raised p-5 ring-1 ring-border transition-colors hover:bg-surface"
    >
      <p className="eyebrow">{k.label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        {k.loading ? (
          <span className="display-num inline-block h-9 w-12 animate-pulse rounded bg-muted" />
        ) : (
          <span className="display-num text-3xl tabular-nums">{k.count ?? 0}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{k.nota}</p>
      <p className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-foreground/80 transition-colors group-hover:text-foreground">
        {empty ? "Añadir el primero" : "Ver y editar"}
        <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
      </p>
    </Link>
  );
}

export default function RecursosResumenPage() {
  const empresaId = useEmpresaId();
  const personal = useQuery({
    queryKey: ["personal", empresaId],
    queryFn: () => personalApi.list(empresaId),
  });
  const maquinaria = useQuery({
    queryKey: ["maquinaria", empresaId],
    queryFn: () => maquinariaApi.list(empresaId),
  });
  const sistemas = useQuery({
    queryKey: ["sistemas-gestion", empresaId],
    queryFn: () => sistemasGestionApi.list(empresaId),
  });
  const obrasDestacadas = useQuery({
    queryKey: ["certificados-destacados", empresaId],
    queryFn: () => certificadosApi.list({ empresa_id: empresaId }),
    select: (items) => items.filter((c) => c.destacado_sobre_b).length,
  });

  const kpis: KpiSpec[] = [
    {
      label: "Personal técnico",
      nota: "jefes obra · encargados · PRL · técnicos",
      href: "/empresa/recursos/personal",
      count: personal.data?.length ?? null,
      loading: personal.isLoading,
    },
    {
      label: "Maquinaria",
      nota: "equipos propios · leasing · alquiler",
      href: "/empresa/recursos/maquinaria",
      count: maquinaria.data?.length ?? null,
      loading: maquinaria.isLoading,
    },
    {
      label: "Sistemas de gestión",
      nota: "ISOs · planes propios · CAE",
      href: "/empresa/recursos/sistemas",
      count: sistemas.data?.length ?? null,
      loading: sistemas.isLoading,
    },
    {
      label: "Obras destacadas",
      nota: "subset narrado para Sobre B",
      href: "/empresa/recursos/obras-destacadas",
      count: obrasDestacadas.data ?? null,
      loading: obrasDestacadas.isLoading,
    },
  ];

  return (
    <div className="space-y-8">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Equipo, maquinaria y sistemas de gestión que adscribes a obra. Es lo que
        habilitará la generación automática de la memoria técnica del Sobre B
        (M5, próximamente).
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Kpi key={k.label} k={k} />
        ))}
      </div>
    </div>
  );
}
