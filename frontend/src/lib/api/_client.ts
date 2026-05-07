/**
 * Wrapper de fetch con Authorization Bearer del JWT de Supabase.
 *
 * Todos los lib/api/*.ts deberían usarlo en lugar de fetch() directo.
 * Si no hay sesión, manda el request sin Authorization (el middleware
 * del backend lo dejará pasar sólo en APP_ENV=dev).
 */

import { getAccessToken } from "@/lib/auth";

export type ApiFetchInit = RequestInit & { skipAuth?: boolean };

export async function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (!init.skipAuth) {
    const token = await getAccessToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const { skipAuth, ...rest } = init;
  return fetch(path, { ...rest, headers });
}

/**
 * Variante que parsea JSON y propaga errores con detail del backend.
 */
export async function apiFetchJSON<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(detail.detail ?? res.statusText);
  }
  return res.json() as Promise<T>;
}
