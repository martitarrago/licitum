"use client";

import Link from "next/link";

type Card = {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
};

const CARDS: Card[] = [
  {
    href: "/empresa/certificados",
    eyebrow: "Solvencia técnica",
    title: "Certificados de obra",
    body: "Acreditan lo que has construido. La IA extrae los datos del PDF y agrega anualidad media por grupo ROLECE — la base del Sobre A · IV.C.1a y de las obras de referencia narradas del Sobre B.",
  },
  {
    href: "/empresa/clasificaciones",
    eyebrow: "Clasificación oficial",
    title: "ROLECE manual",
    body: "Grupos y subgrupos introducidos a mano cuando RELIC no cubre o trabajas fuera de Cataluña. Atajo de solvencia en pliegos con clasificación obligatoria.",
  },
  {
    href: "/empresa/relic",
    eyebrow: "Clasificación oficial",
    title: "RELIC sincronizado",
    body: "Registre Electrònic d'Empreses Licitadores i Classificades de Catalunya. Sincronización diaria por número registral. Reduce el Sobre A a «consta en RELIC nº X».",
  },
];

export default function SolvenciaPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <p className="mb-8 max-w-3xl text-sm text-muted-foreground">
        Qué has hecho y cuánto facturas. Filtro hard del motor de match
        (clasificación + volumen) y bloque IV del DEUC. La solvencia técnica
        se calcula sola desde tus certificados; la económica la declaras tú.
      </p>

      <section className="mb-10 rounded-2xl bg-surface-raised p-6 ring-1 ring-border">
        <p className="eyebrow">Solvencia técnica calculada</p>
        <h2 className="font-serif text-lg font-medium">
          Anualidad media derivada de tus certificados
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          KPI calculado automáticamente con tus certificados de obra
          validados. Pendiente de pintar en esta pantalla — el endpoint
          <code className="mx-1 rounded bg-surface px-1 py-0.5 font-mono text-xs">
            /api/v1/empresa/certificados/resumen-solvencia
          </code>
          ya lo expone.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="card-interactive flex flex-col p-6"
          >
            <p className="eyebrow">{card.eyebrow}</p>
            <h3 className="mt-1 font-serif text-base font-medium">
              {card.title}
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
