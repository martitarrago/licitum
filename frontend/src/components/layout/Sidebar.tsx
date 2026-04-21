"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2 } from "lucide-react";
import { MODULE_GROUPS, type Module, type SubModule } from "./modules";

function LogoMark() {
  return (
    <span
      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-foreground text-surface shadow-sm ring-1 ring-foreground/20"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7.5 5.5 V17 H17" />
      </svg>
      <span className="pointer-events-none absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-500 ring-2 ring-surface-raised" />
    </span>
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
}: {
  module: Module;
  pathname: string;
}) {
  const Icon = module.icon;
  const isParentActive =
    pathname === module.href || pathname.startsWith(module.href + "/");
  const hasChildren = !!module.children?.length;
  const showChildren = hasChildren && isParentActive;

  if (!module.available) {
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
        className={[
          "group/nav relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150",
          isParentActive
            ? "bg-foreground/[0.07] font-semibold text-foreground ring-1 ring-inset ring-foreground/10"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        ].join(" ")}
      >
        {isParentActive && (
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
        <span className="flex-1 truncate">{module.label}</span>
        <ModuleCodeTag code={module.code} />
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

  return (
    <aside className="relative flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface-raised">
      {/* BRAND */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <LogoMark />
        <div className="min-w-0">
          <div className="font-serif text-[19px] font-semibold leading-none tracking-[-0.01em] text-foreground">
            Licitum
          </div>
          <div className="mt-1 font-mono text-[9px] font-medium uppercase tracking-[0.22em] text-muted-foreground/60">
            Licitación · PYME
          </div>
        </div>
      </div>

      {/* Hair-thin divider with subtle gradient fade */}
      <div
        aria-hidden="true"
        className="mx-5 h-px bg-gradient-to-r from-transparent via-border to-transparent"
      />

      {/* NAV */}
      <nav
        className="flex-1 overflow-y-auto px-3 pt-4 pb-4"
        aria-label="Navegación principal"
      >
        {MODULE_GROUPS.map((group, idx) => (
          <div
            key={group.id}
            className={idx < MODULE_GROUPS.length - 1 ? "mb-5" : ""}
          >
            {group.label && (
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
            <div className="space-y-0.5">
              {group.modules.map((m) => (
                <NavItem key={m.id} module={m} pathname={pathname} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* FOOTER — empresa demo */}
      <div className="border-t border-border px-3 py-3">
        <button
          type="button"
          className="group/footer flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60"
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
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">
              Empresa Demo
            </p>
            <p className="truncate font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground/65">
              Plan interno · v0.1
            </p>
          </div>
        </button>
      </div>
    </aside>
  );
}
