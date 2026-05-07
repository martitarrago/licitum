"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";

const FULLSCREEN_ROUTES = ["/login"];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = FULLSCREEN_ROUTES.some((r) => pathname.startsWith(r));

  if (isFullscreen) {
    return (
      <main className="flex h-screen flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    );
  }
  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
