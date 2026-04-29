"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { label: string; href: string }[] = [
  { label: "Resumen", href: "/empresa/solvencia" },
  { label: "Certificados", href: "/empresa/solvencia/certificados" },
  { label: "Clasificaciones", href: "/empresa/solvencia/clasificaciones" },
  { label: "RELIC", href: "/empresa/solvencia/relic" },
];

function isActive(pathname: string, href: string): boolean {
  // El tab "Resumen" solo activo en el path exacto; los demás también si el
  // path entra en una subruta (ej. revisar un certificado).
  if (href === "/empresa/solvencia") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function SolvenciaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          solvencia
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Qué has hecho y qué acreditas: certificados de obra y clasificaciones
          (manuales + RELIC). Alimenta el filtro hard del motor (clasificación)
          y el bloque IV del DEUC. El volumen de negocio se declara en
          Identidad.
        </p>
      </header>

      <nav className="mb-8 border-b border-border" aria-label="Secciones de solvencia">
        <ul className="-mb-px flex flex-wrap gap-x-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  className={[
                    "inline-block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  ].join(" ")}
                  aria-current={active ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {children}
    </div>
  );
}
