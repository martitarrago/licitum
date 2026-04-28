"use client";

type Pregunta = {
  numero: string;
  pregunta: string;
  detalle: string;
};

const PREGUNTAS: Pregunta[] = [
  {
    numero: "01",
    pregunta: "¿Cuántas obras llevas en paralelo como máximo?",
    detalle: "Techo histórico declarado. Filtro hard: sin esto, el match recomienda obras que no te caben.",
  },
  {
    numero: "02",
    pregunta: "¿Cuántas tienes ahora mismo?",
    detalle: "Vivo. Toggle visible en la home — un trimestre saturado se marca aquí sin tocar el resto.",
  },
  {
    numero: "03",
    pregunta: "Presupuesto mínimo y máximo por obra que te interesa.",
    detalle: "Por debajo, no compensa el coste de presentar. Por arriba, no te cabe ni en UTE.",
  },
  {
    numero: "04",
    pregunta: "¿En qué comarcas/provincias quieres trabajar?",
    detalle: "Preferida / OK / evitar. Es ranking, no filtro hard — un trabajo en zona evitar a buen precio sigue apareciendo, con peso menor.",
  },
  {
    numero: "05",
    pregunta: "¿Qué tipos de obra (CPV) son tu core?",
    detalle: "Core / secundario / no interesa. División CPV (2 dígitos) — granularidad suficiente para distinguir edificación, civil, instalaciones.",
  },
  {
    numero: "06",
    pregunta: "¿Aceptas UTE?",
    detalle: "Sí o no. Si sí, te aparecen pliegos donde solo cabes en UTE.",
  },
  {
    numero: "07",
    pregunta: "Estado actual de aceptación.",
    detalle: "Acepta / selectivo / no acepta. Toggle global por encima de todo lo anterior.",
  },
];

export default function PreferenciasPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="mb-8 max-w-2xl text-sm text-muted-foreground">
        Qué te interesa. Esto no se deduce de tus certificados ni del
        histórico PSCP — lo declaras tú. Es el ranking del motor de match,
        no los filtros. Backend listo, wizard en construcción — sprint 3.
      </p>

      <ol className="space-y-4">
        {PREGUNTAS.map((p) => (
          <li
            key={p.numero}
            className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border"
          >
            <div className="flex items-baseline gap-4">
              <span className="font-mono text-xs text-muted-foreground">
                {p.numero}
              </span>
              <div>
                <h3 className="font-serif text-base font-medium">
                  {p.pregunta}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {p.detalle}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 text-xs uppercase tracking-wider text-muted-foreground">
        Estado · backend en producción tras migración 0018 · wizard pendiente
      </p>
    </div>
  );
}
