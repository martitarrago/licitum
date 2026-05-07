"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth";

/**
 * Inyecta automáticamente Authorization: Bearer en todos los fetch() del cliente
 * que apuntan a /api/. Patch global del fetch nativo — evita tener que tocar los
 * ~30 sitios que llaman fetch directamente.
 *
 * No afecta a XMLHttpRequest (subidas con progress); esos casos añaden el
 * header explícitamente con xhr.setRequestHeader.
 */
function useAuthorizedFetch() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const original = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let url: string;
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.href;
      else url = input.url;

      const isApi = url.startsWith("/api/") || url.includes("/api/v1/");
      if (!isApi) return original(input, init);

      const token = await getAccessToken();
      const headers = new Headers(init?.headers);
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return original(input, { ...init, headers });
    };
    return () => {
      window.fetch = original;
    };
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useAuthorizedFetch();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 10_000, retry: 1 },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
