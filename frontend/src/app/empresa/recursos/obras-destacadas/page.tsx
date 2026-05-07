"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Save, Star, StarOff } from "lucide-react";
import {
  certificadosApi,
  type CertificadoObraListItem,
} from "@/lib/api/certificados";
import { useEmpresaId } from "@/lib/auth";

type Filtro = "todos" | "destacados";

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function formatPeriodo(c: CertificadoObraListItem): string {
  if (!c.fecha_inicio && !c.fecha_fin) return "—";
  const fmt = (s: string | null) =>
    s ? new Date(s).toLocaleDateString("es-ES", { year: "numeric", month: "short" }) : "?";
  return `${fmt(c.fecha_inicio)} → ${fmt(c.fecha_fin)}`;
}

export default function ObrasDestacadasPage() {
  const empresaId = useEmpresaId();
  const QUERY_KEY = ["certificados", empresaId, "validos"] as const;
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () =>
      certificadosApi.list({
        empresa_id: empresaId,
        estado: "validado",
      }),
  });

  const certificados = useMemo(() => {
    if (!data) return [];
    return filtro === "destacados"
      ? data.filter((c) => c.destacado_sobre_b)
      : data;
  }, [data, filtro]);

  const numDestacados = data?.filter((c) => c.destacado_sobre_b).length ?? 0;

  const toggleDestacado = useMutation({
    mutationFn: ({ id, destacado }: { id: string; destacado: boolean }) =>
      certificadosApi.patch(id, { destacado_sobre_b: destacado }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const guardarNarrativa = useMutation({
    mutationFn: ({ id, narrativa }: { id: string; narrativa: string | null }) =>
      certificadosApi.patch(id, { narrativa }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      setEditando(null);
      setDraft("");
    },
  });

  const startEdit = (c: CertificadoObraListItem) => {
    setEditando(c.id);
    setDraft(c.narrativa ?? "");
  };
  const cancelEdit = () => {
    setEditando(null);
    setDraft("");
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Subset de tus certificados marcados como destacados, con narrativa
          que reusarás directamente en la memoria del Sobre B. Marca las que
          mejor representen tu capacidad para el tipo de obra que sueles
          presentar.
        </p>
        <div className="flex shrink-0 items-center gap-1 rounded-lg bg-surface-raised p-1 ring-1 ring-border">
          <FilterButton
            active={filtro === "todos"}
            onClick={() => setFiltro("todos")}
            label={`Todos · ${data?.length ?? 0}`}
          />
          <FilterButton
            active={filtro === "destacados"}
            onClick={() => setFiltro("destacados")}
            label={`Destacados · ${numDestacados}`}
          />
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : certificados.length === 0 ? (
        <Empty filtro={filtro} />
      ) : (
        <div className="space-y-3">
          {certificados.map((c) => (
            <article
              key={c.id}
              className={[
                "rounded-2xl bg-surface-raised p-5 ring-1 ring-border transition-shadow",
                c.destacado_sobre_b ? "shadow-card" : "",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium">
                    {c.titulo ?? "Certificado sin título"}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {c.organismo ?? "Organismo no informado"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="text-muted-foreground/70">
                        Importe ·{" "}
                      </span>
                      <span className="font-mono tabular-nums text-foreground/90">
                        {c.importe_adjudicacion
                          ? eur.format(Number(c.importe_adjudicacion))
                          : "—"}
                      </span>
                    </span>
                    <span>
                      <span className="text-muted-foreground/70">
                        Periodo ·{" "}
                      </span>
                      <span className="font-mono tabular-nums">
                        {formatPeriodo(c)}
                      </span>
                    </span>
                    {c.clasificacion_grupo && (
                      <span>
                        <span className="text-muted-foreground/70">
                          Grupo ·{" "}
                        </span>
                        <span className="font-mono">
                          {c.clasificacion_grupo}
                          {c.clasificacion_subgrupo
                            ? c.clasificacion_subgrupo
                            : ""}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    toggleDestacado.mutate({
                      id: c.id,
                      destacado: !c.destacado_sobre_b,
                    })
                  }
                  disabled={toggleDestacado.isPending}
                  className={[
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    c.destacado_sobre_b
                      ? "bg-foreground text-surface hover:bg-foreground/90"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  ].join(" ")}
                  aria-label={
                    c.destacado_sobre_b
                      ? "Quitar de destacados"
                      : "Marcar como destacado"
                  }
                >
                  {c.destacado_sobre_b ? (
                    <>
                      <Star className="h-3.5 w-3.5 fill-current" strokeWidth={1.75} />
                      Destacado
                    </>
                  ) : (
                    <>
                      <StarOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Marcar
                    </>
                  )}
                </button>
              </div>

              {/* Narrativa */}
              <div className="mt-4 border-t border-border/60 pt-4">
                {editando === c.id ? (
                  <div>
                    <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Narrativa para Sobre B
                    </label>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={6}
                      placeholder="Describe la obra: qué hiciste, retos, equipo, resultados. 200-500 palabras."
                      className="mt-1.5 w-full resize-y rounded-lg bg-surface px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-foreground/30"
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          guardarNarrativa.mutate({
                            id: c.id,
                            narrativa: draft.trim() === "" ? null : draft,
                          })
                        }
                        disabled={guardarNarrativa.isPending}
                        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-surface transition-colors hover:bg-foreground/90 disabled:opacity-50"
                      >
                        {guardarNarrativa.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3" />
                        )}
                        Guardar narrativa
                      </button>
                    </div>
                  </div>
                ) : c.narrativa ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Narrativa
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          Guardada
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(c)}
                          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                      {c.narrativa}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    + Añadir narrativa para Sobre B
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function FilterButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-surface"
          : "text-muted-foreground hover:bg-muted",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function Empty({ filtro }: { filtro: Filtro }) {
  return (
    <div className="rounded-2xl bg-surface-raised p-10 text-center ring-1 ring-border">
      <p className="text-sm text-muted-foreground">
        {filtro === "destacados"
          ? "Aún no has marcado ningún certificado como destacado."
          : "Aún no tienes certificados validados."}
      </p>
      <p className="mt-2 text-xs text-muted-foreground/80">
        {filtro === "destacados"
          ? "Marca con la estrella los que mejor representen tu capacidad."
          : "Sube y valida certificados desde la pestaña Solvencia → Certificados."}
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted/40" />
      ))}
    </div>
  );
}
