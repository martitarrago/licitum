"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronsLeft, ChevronsRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { MODULE_GROUPS, type Module, type SubModule } from "./modules";

const RAIL_WIDTH = 64; // px — anchura cuando está plegado
const EXPANDED_WIDTH = 256; // px — anchura cuando está abierto
// Curva tipo iOS — acelera muy poco al inicio y frena con gracia al final.
const SMOOTH_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const TRANSITION_MS = 520;
const STORAGE_KEY = "licitum-sidebar-collapsed";

function LogoMark({ collapsed }: { collapsed: boolean }) {
  // Dos assets distintos: `logo-icon.png` (isotipo cuadrado) cuando el
  // sidebar está colapsado, `logo.png` (isotipo + wordmark) cuando expandido.
  if (collapsed) {
    return (
      <Image
        src="/logo-icon.png"
        alt="Licitum"
        width={512}
        height={512}
        className="h-10 w-10"
        priority
      />
    );
  }
  return (
    <Image
      src="/logo.png"
      alt="Licitum"
      width={5995}
      height={784}
      className="h-auto w-3/4"
      priority
    />
  );
}

function ModuleCodeTag({
  code,
  muted = false,
}: {
  code: string;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "font-mono text-[10px] font-medium tracking-wide tabular-nums",
        muted
          ? "text-muted-foreground/40"
          : "text-muted-foreground/55 group-hover/nav:text-muted-foreground/75",
      ].join(" ")}
    >
      {code}
    </span>
  );
}

function SoonTag() {
  return (
    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/45">
      pronto
    </span>
  );
}

function SubNavItem({
  sub,
  isActive,
}: {
  sub: SubModule;
  isActive: boolean;
}) {
  return (
    <Link
      href={sub.href}
      className={[
        "relative flex items-center rounded-md py-1.5 pl-[46px] pr-3 text-[13px] transition-colors duration-150",
        isActive
          ? "font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "absolute left-[22px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full transition-all",
          isActive
            ? "bg-accent-500 scale-100"
            : "bg-muted-foreground/25 scale-75",
        ].join(" ")}
      />
      {sub.label}
    </Link>
  );
}

function NavItem({
  module,
  pathname,
  collapsed,
  onItemClick,
}: {
  module: Module;
  pathname: string;
  collapsed: boolean;
  onItemClick: () => void;
}) {
  const Icon = module.icon;
  const isParentActive = module.exact
    ? pathname === module.href
    : pathname === module.href || pathname.startsWith(module.href + "/");
  const hasChildren = !!module.children?.length;
  const showChildren = hasChildren && isParentActive && !collapsed;

  if (!module.available) {
    if (collapsed) {
      return (
        <div
          title={`${module.label} · pronto`}
          className="flex cursor-default select-none items-center justify-center rounded-lg px-2 py-2 text-muted-foreground/55"
        >
          <Icon
            className="h-4 w-4 shrink-0 opacity-60"
            aria-hidden="true"
            strokeWidth={1.75}
          />
        </div>
      );
    }
    return (
      <div className="group/nav relative flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground/55">
        <Icon
          className="h-4 w-4 shrink-0 opacity-70"
          aria-hidden="true"
          strokeWidth={1.75}
        />
        <span className="flex-1 truncate">{module.label}</span>
        <SoonTag />
        <ModuleCodeTag code={module.code} muted />
      </div>
    );
  }

  return (
    <div>
      <Link
        href={hasChildren ? module.children![0].href : module.href}
        title={collapsed ? module.label : undefined}
        onClick={onItemClick}
        className={[
          "group/nav relative flex items-center rounded-lg transition-all duration-150",
          collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
          "text-sm",
          isParentActive
            ? "bg-foreground/[0.07] font-semibold text-foreground ring-1 ring-inset ring-foreground/10"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        ].join(" ")}
      >
        {isParentActive && !collapsed && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent-500"
          />
        )}
        <Icon
          className={[
            "h-4 w-4 shrink-0 transition-colors",
            isParentActive
              ? "text-foreground"
              : "text-muted-foreground group-hover/nav:text-foreground",
          ].join(" ")}
          aria-hidden="true"
          strokeWidth={isParentActive ? 2.25 : 1.75}
        />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{module.label}</span>
            <ModuleCodeTag code={module.code} />
          </>
        )}
      </Link>

      {showChildren && (
        <div className="relative mt-1 mb-2 space-y-0.5">
          <span
            aria-hidden="true"
            className="absolute left-[21px] top-1 bottom-1 w-px bg-border"
          />
          {module.children!.map((sub) => (
            <SubNavItem
              key={sub.href}
              sub={sub}
              isActive={
                sub.exact
                  ? pathname === sub.href
                  : pathname === sub.href || pathname.startsWith(sub.href + "/")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  // Toggle explícito con persistencia. Por defecto expandido.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  function expand() {
    if (!collapsed) return;
    setCollapsed(false);
    window.localStorage.setItem(STORAGE_KEY, "0");
  }

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  }

  // Cuando está plegado, todo el sidebar es clickable y al pulsarlo se abre.
  // Si el clic ocurrió sobre un Link interno (NavItem), el navegador navega
  // a la nueva ruta tras propagar este handler — el sidebar quedará abierto
  // en la nueva pantalla. Si el clic ocurrió sobre el toggle inferior, ese
  // handler hace stopPropagation y gestiona él mismo el cambio de estado.
  function handleAsideClick() {
    if (collapsed) expand();
  }

  return (
    <aside
      style={{
        width: collapsed ? RAIL_WIDTH : EXPANDED_WIDTH,
        transitionProperty: "width",
        transitionDuration: `${TRANSITION_MS}ms`,
        transitionTimingFunction: SMOOTH_EASING,
      }}
      onClick={collapsed ? handleAsideClick : undefined}
      role={collapsed ? "button" : undefined}
      aria-label={collapsed ? "Mostrar menú" : undefined}
      className={[
        "relative flex h-screen shrink-0 flex-col border-r border-border bg-surface-raised",
        collapsed ? "cursor-pointer hover:bg-muted/30" : "",
      ].join(" ")}
    >
      {/* BRAND */}
      <div
        className={[
          "flex items-center pt-5 pb-4",
          collapsed ? "justify-center px-2" : "px-5",
        ].join(" ")}
      >
        <Link href="/dashboard" aria-label="Panel de control">
          <LogoMark collapsed={collapsed} />
        </Link>
      </div>

      {/* Hair-thin divider with subtle gradient fade */}
      <div
        aria-hidden="true"
        className={[
          "h-px bg-gradient-to-r from-transparent via-border to-transparent",
          collapsed ? "mx-3" : "mx-5",
        ].join(" ")}
      />

      {/* NAV */}
      <nav
        className={[
          "flex-1 overflow-y-auto pt-4 pb-4",
          collapsed ? "px-2" : "px-3",
        ].join(" ")}
        aria-label="Navegación principal"
      >
        {MODULE_GROUPS.map((group, idx) => (
          <div
            key={group.id}
            className={idx < MODULE_GROUPS.length - 1 ? "mb-5" : ""}
          >
            {group.label && !collapsed && (
              <div className="mb-1.5 flex items-center gap-2 px-3 pt-0.5">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">
                  {group.label}
                </span>
                <span
                  aria-hidden="true"
                  className="h-px flex-1 bg-border/60"
                />
              </div>
            )}
            {group.label && collapsed && (
              <div
                aria-hidden="true"
                className="mx-2 mb-1.5 mt-0.5 h-px bg-border/60"
              />
            )}
            <div className="space-y-0.5">
              {group.modules.map((m) => (
                <NavItem
                  key={m.id}
                  module={m}
                  pathname={pathname}
                  collapsed={collapsed}
                  onItemClick={expand}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* FOOTER — toggle + empresa demo */}
      <div
        className="border-t border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Mostrar menú" : "Esconder menú"}
          title={collapsed ? "Mostrar menú" : "Esconder menú"}
          className={[
            "group/toggle flex w-full items-center text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground",
            collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2",
          ].join(" ")}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
          ) : (
            <>
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
              <span className="text-[12px] font-medium">Esconder menú</span>
            </>
          )}
        </button>

        <div className={collapsed ? "px-2 py-2" : "px-3 py-3"}>
          <button
            type="button"
            title={collapsed ? "Empresa Demo" : undefined}
            className={[
              "group/footer flex w-full items-center rounded-lg text-left transition-colors hover:bg-muted/60",
              collapsed ? "justify-center px-1 py-1.5" : "gap-3 px-2 py-2",
            ].join(" ")}
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
              <Building2
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-hidden="true"
                strokeWidth={1.75}
              />
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-surface-raised"
              />
            </span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">
                  Empresa Demo
                </p>
                <p className="truncate font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/65">
                  Plan interno · v0.1
                </p>
              </div>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
