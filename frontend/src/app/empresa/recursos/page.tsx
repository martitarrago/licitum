"use client";

type Bloque = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
};

const BLOQUES: Bloque[] = [
  {
    eyebrow: "Equipo humano",
    title: "Personal técnico",
    body: "Jefes de obra, encargados, técnicos PRL/calidad/MA, ingenieros y arquitectos. Lo que el pliego pide nominalmente en la memoria técnica.",
    bullets: [
      "Titulación + años de experiencia",
      "Certificados de formación (PRL 60h, recurso preventivo, …)",
      "Obras en las que ha participado (FK a certificados)",
      "Subir CV en PDF y la IA extrae los datos",
    ],
  },
  {
    eyebrow: "Equipo material",
    title: "Maquinaria",
    body: "Inventario operativo: camiones, retros, compresores, encofrados. Sobre B y match suave para pliegos con maquinaria especial.",
    bullets: [
      "Tipo + marca + modelo + año",
      "Matrícula opcional",
      "Propiedad: propia / leasing / alquiler largo plazo",
      "Caducidad ITV opcional",
    ],
  },
  {
    eyebrow: "Sistemas y certificaciones",
    title: "Sistemas de gestión",
    body: "ISOs y planes propios con alcance descriptivo. El Sobre B necesita citar entidad certificadora y ámbito, no solo presentar el PDF.",
    bullets: [
      "ISO 9001 / 14001 / 45001",
      "Planes propios (calidad, MA, seguridad)",
      "CAE construcción",
      "Caducidad cuando aplique (ISOs renovables)",
    ],
  },
  {
    eyebrow: "Obras de referencia",
    title: "Narrativa de obras destacadas",
    body: "Subset de tus certificados de obra marcados como destacados, con narrativa redactada para reuso directo en la memoria del Sobre B.",
    bullets: [
      "Marca destacado_sobre_b en certificados existentes",
      "200-500 palabras describiendo retos y resultados",
      "Fotos opcionales",
      "Editor con prompt asistido (planificado)",
    ],
  },
];

export default function RecursosPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <p className="mb-8 max-w-3xl text-sm text-muted-foreground">
        Qué llevas a la obra. La pestaña que habilita el Sobre B (memoria
        técnica) sin redactar a mano. Backend listo, UI en construcción —
        empezamos a poblarla en sprint 4.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {BLOQUES.map((b) => (
          <article
            key={b.title}
            className="rounded-2xl bg-surface-raised p-6 ring-1 ring-border"
          >
            <p className="eyebrow">{b.eyebrow}</p>
            <h3 className="mt-1 font-serif text-base font-medium">{b.title}</h3>
            <p className="mt-3 text-sm text-muted-foreground">{b.body}</p>
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground/90">
              {b.bullets.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="mt-10 text-xs uppercase tracking-wider text-muted-foreground">
        Estado · backend en producción tras migración 0018 · UI pendiente
      </p>
    </div>
  );
}
