import "server-only";

import { env } from "@/lib/server/env";

export function supabaseServerKey(): string | undefined {
  const e = env();
  return e.SUPABASE_SECRET_KEY ?? e.SUPABASE_SERVICE_ROLE_KEY;
}

export function supabasePublicKey(): string | undefined {
  const e = env();
  return e.SUPABASE_PUBLISHABLE_KEY ?? e.SUPABASE_ANON_KEY;
}

export function supabaseHeaders(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return key.startsWith("sb_") ? { apikey: key, ...extra } : { apikey: key, authorization: `Bearer ${key}`, ...extra };
}
