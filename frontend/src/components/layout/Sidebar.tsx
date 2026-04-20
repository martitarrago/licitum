"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
import { MODULES, type Module, type SubModule } from "./modules";

function SoonBadge() {
  return (
    <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
      Próx.
    </span>
  );
}

function SubNavItem({ sub, isActive }: { sub: SubModule; isActive: boolean }) {
  return (
    <Link
      href={sub.href}
      className={[
        "relative flex items-center gap-2 rounded-md py-1.5 pl-10 pr-3 text-sm transition-colors",
        isActive
          ? "font-medium text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      {isActive && (
        <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-r-full bg-primary-500" />
      )}
      {sub.label}
    </Link>
  );
}

function NavItem({ module, pathname }: { module: Module; pathname: string }) {
  const isParentActive = pathname.startsWith(module.href);
  const showChildren = module.children && isParentActive;

  if (!module.available) {
    return (
      <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/50 cursor-default select-none">
        <module.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{module.label}</span>
        <SoonBadge />
      </div>
    );
  }

  return (
    <div>
      <Link
        href={module.children ? module.children[0].href : module.href}
        className={[
          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
          isParentActive && !module.children
            ? "bg-primary-500/10 font-medium text-foreground"
            : isParentActive
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        ].join(" ")}
      >
        {isParentActive && !module.children && (
          <span className="absolute left-0 inset-y-1.5 w-0.5 rounded-r-full bg-primary-500" />
        )}
        <module.icon
          className={[
            "h-4 w-4 shrink-0",
            isParentActive ? "text-primary-500" : "",
          ].join(" ")}
          aria-hidden="true"
        />
        <span className="flex-1 truncate">{module.label}</span>
      </Link>

      {showChildren && (
        <div className="mt-0.5 space-y-0.5">
          {module.children!.map((sub) => (
            <SubNavItem
              key={sub.href}
              sub={sub}
              isActive={pathname === sub.href || pathname.startsWith(sub.href + "/")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-border bg-surface-raised">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-500">
          <span className="text-xs font-bold text-white">L</span>
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Licitum
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegación principal">
        <div className="space-y-0.5">
          {MODULES.map((module) => (
            <NavItem key={module.id} module={module} pathname={pathname} />
          ))}
        </div>
      </nav>

      {/* Footer — empresa demo */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">Empresa Demo</p>
            <p className="truncate text-[10px] text-muted-foreground">Sin autenticación</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
