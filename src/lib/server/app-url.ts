import "server-only";

import { headers } from "next/headers";

import { env } from "@/lib/server/env";

export function allowedHosts(): string[] {
  const e = env();
  return [new URL(e.APP_URL).host, ...e.APP_ALLOWED_HOSTS];
}

export function hostAllowed(host: string, patterns: string[]): boolean {
  const h = host.toLowerCase();
  return patterns.some((p) => {
    const re = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[a-z0-9.:-]*");
    return new RegExp(`^${re}$`).test(h);
  });
}

export async function requestAppUrl(): Promise<string> {
  const fallback = env().APP_URL;
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return fallback;
  }
  const host = h.get("x-forwarded-host")?.split(",")[0]?.trim() ?? h.get("host");
  if (!host || !hostAllowed(host, allowedHosts())) return fallback;
  const fwd = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    fwd === "http" || fwd === "https" ? fwd : /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}
