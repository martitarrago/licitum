"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MODULE_GROUPS, type Module, type SubModule } from "./modules";

const RAIL_WIDTH = 64; // px — anchura del rail colapsado, reservada en el layout
const EXPANDED_WIDTH = 256; // px — anchura cuando hovered
const CLOSE_DELAY_MS = 200; // pequeño delay al salir para evitar parpadeo
// Curva tipo iOS — acelera muy poco al inicio y frena con gracia al final.
// Sensación claramente más "premium" que el ease-out estándar.
const SMOOTH_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const TRANSITION_MS = 320;

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
        className="h-7 w-7"
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
}: {
  module: Module;
  pathname: string;
  collapsed: boolean;
}) {
  const Icon = module.icon;
  const isParentActive =
    pathname === module.href || pathname.startsWith(module.href + "/");
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
                pathname === sub.href || pathname.startsWith(sub.href + "/")
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
  // Hover-driven: el sidebar arranca colapsado y se expande al pasar el ratón.
  // Pequeño delay al salir para evitar parpadeo si el cursor pasa de largo.
  const [hovered, setHovered] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function handleEnter() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setHovered(true);
  }

  function handleLeave() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  }

  const collapsed = !hovered;

  return (
    // El <aside> reserva siempre el ancho del rail (64px) en el layout flex,
    // así el contenido principal NO se desplaza al expandir el sidebar.
    // El panel interno (absolute) crece sobre el main al hacer hover.
    <aside
      style={{ width: RAIL_WIDTH }}
      className="relative h-screen shrink-0"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <div
        style={{
          width: hovered ? EXPANDED_WIDTH : RAIL_WIDTH,
          transitionProperty: "width, box-shadow",
          transitionDuration: `${TRANSITION_MS}ms`,
          transitionTimingFunction: SMOOTH_EASING,
        }}
        className={[
          "absolute inset-y-0 left-0 flex flex-col",
          "border-r border-border bg-surface-raised",
          // Sombra suave solo cuando flota sobre el contenido
          hovered ? "z-40 shadow-xl" : "z-10",
        ].join(" ")}
      >
        {/* BRAND */}
        <div
          className={[
            "flex items-center pt-5 pb-4",
            collapsed ? "justify-center px-2" : "px-5",
          ].join(" ")}
        >
          <LogoMark collapsed={collapsed} />
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
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* FOOTER — empresa demo */}
        <div className={["border-t border-border", collapsed ? "px-2 py-2" : "px-3 py-3"].join(" ")}>
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
