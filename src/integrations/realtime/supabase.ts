import "server-only";

import { supabaseHeaders, supabaseServerKey } from "@/integrations/supabase/keys";
import { env } from "@/lib/server/env";

import type { RealtimeMessage } from "./types";

export async function publishSupabase(users: string[], message: RealtimeMessage): Promise<void> {
  const url = env().SUPABASE_URL;
  const key = supabaseServerKey();
  if (!url || !key) return;
  const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: supabaseHeaders(key, { "content-type": "application/json" }),
    body: JSON.stringify({
      messages: users.map((userId) => ({ topic: `user:${userId}`, event: "change", payload: message, private: true })),
    }),
  });
  if (!response.ok) throw new Error(`realtime broadcast ${response.status}`);
}
