"use client";

import { SolvenciaResumen } from "@/components/solvencia/SolvenciaResumen";

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estado general de tu empresa
        </p>
      </div>

      <SolvenciaResumen />
    </main>
  );
}
