"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export type EmpresaActual = {
  empresaId: string;
  email: string;
  userId: string;
};

const EMPRESA_DEMO_FALLBACK = "00000000-0000-0000-0000-000000000001";

/**
 * Resuelve la empresa actual del usuario logado leyendo `app_metadata.empresa_id`
 * del JWT de Supabase. Si no hay sesión (p.ej. dev sin auth), cae a
 * EMPRESA_DEMO_FALLBACK para no romper componentes.
 *
 * En producción la sesión la garantiza middleware.ts (redirige a /login).
 */
/**
 * Devuelve la empresa actual con fallback demo desde el primer render —
 * de modo que `empresa.empresaId` SIEMPRE está definido y los useQuery
 * pueden disparar sin necesidad de `enabled: !!empresaId`. Cuando Supabase
 * resuelve la sesión real, el state se actualiza y React Query refetcha.
 */
const FALLBACK_EMPRESA: EmpresaActual = {
  empresaId: EMPRESA_DEMO_FALLBACK,
  email: "demo@licitum.com",
  userId: "00000000-0000-0000-0000-000000000000",
};

export function useEmpresaActual(): EmpresaActual {
  const [state, setState] = useState<EmpresaActual>(FALLBACK_EMPRESA);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    let mounted = true;

    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      const user = data.user;
      if (!user) {
        setState(FALLBACK_EMPRESA);
        return;
      }
      const empresaId =
        (user.app_metadata?.empresa_id as string | undefined) ??
        EMPRESA_DEMO_FALLBACK;
      setState({
        empresaId,
        email: user.email ?? "",
        userId: user.id,
      });
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/**
 * Atajo: lee directamente el `empresaId` del hook. Pensado para componentes
 * que sólo necesitan el ID, no email ni userId.
 */
export function useEmpresaId(): string {
  return useEmpresaActual().empresaId;
}

export async function logout() {
  const supabase = getSupabaseBrowser();
  await supabase.auth.signOut();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
}

/**
 * Devuelve el access_token actual (JWT) para añadirlo a fetch como
 * Authorization: Bearer. Null si no hay sesión.
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
