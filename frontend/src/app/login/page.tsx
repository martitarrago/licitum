"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message === "Invalid login credentials"
        ? "Email o contraseña incorrectos"
        : error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="grid h-screen w-full place-items-center bg-surface px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Image
            src="/logo.png"
            alt="Licitum"
            width={5995}
            height={784}
            className="h-auto w-40"
            priority
          />
        </div>

        <div className="mb-8 text-center">
          <p className="eyebrow mb-2">Acceso privado</p>
          <h1 className="display-h text-3xl text-foreground">
            entra a tu cuenta
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Tu radar y tus pliegos te están esperando.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground shadow-inset-soft outline-none transition-colors focus:border-foreground focus:ring-1 focus:ring-foreground"
              placeholder="tu@empresa.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground shadow-inset-soft outline-none transition-colors focus:border-foreground focus:ring-1 focus:ring-foreground"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-8 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/65">
          Licitum · Acceso restringido
        </p>
      </div>
    </div>
  );
}
