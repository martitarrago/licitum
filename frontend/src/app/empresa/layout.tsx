"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { label: string; href: string }[] = [
  { label: "Perfil", href: "/empresa/perfil" },
  { label: "Documentos", href: "/empresa/documentos" },
  { label: "Certificados", href: "/empresa/certificados" },
  { label: "Clasificaciones", href: "/empresa/clasificaciones" },
  { label: "RELIC", href: "/empresa/relic" },
];

export default function EmpresaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-6 animate-fade-up">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          empresa
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Datos vivos de tu empresa: identificación, certificaciones y
          documentos. Lo que aquí esté al día es lo que alimenta cada
          licitación.
        </p>
      </header>

      <nav
        className="mb-8 border-b border-border"
        aria-label="Secciones de empresa"
      >
        <ul className="-mb-px flex flex-wrap gap-x-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/");
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
