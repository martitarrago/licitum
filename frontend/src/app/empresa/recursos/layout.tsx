"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { label: string; href: string }[] = [
  { label: "Resumen", href: "/empresa/recursos" },
  { label: "Personal", href: "/empresa/recursos/personal" },
  { label: "Maquinaria", href: "/empresa/recursos/maquinaria" },
  { label: "Sistemas", href: "/empresa/recursos/sistemas" },
  { label: "Obras destacadas", href: "/empresa/recursos/obras-destacadas" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/empresa/recursos") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export default function RecursosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <h1 className="display-h text-3xl leading-[1.05] sm:text-4xl">
          recursos
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Qué llevas a la obra. Lo que habilita el Sobre B (memoria técnica)
          sin redactar a mano.
        </p>
      </header>

      <nav className="mb-8 border-b border-border" aria-label="Secciones de recursos">
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
