import { realtimeToken } from "@/integrations/realtime/token";
import { supabasePublicKey } from "@/integrations/supabase/keys";
import { env } from "@/lib/server/env";
import { getActor } from "@/services/auth";

export async function GET() {
  const actor = await getActor();
  if (!actor) return new Response(null, { status: 401 });
  const e = env();
  const key = supabasePublicKey();
  const token = e.REALTIME_DRIVER === "supabase" && e.SUPABASE_URL && key ? realtimeToken(actor.userId) : null;
  if (!token) return Response.json({ driver: e.REALTIME_DRIVER === "none" ? "none" : "pg" });
  return Response.json(
    { driver: "supabase", url: e.SUPABASE_URL, anonKey: key, token, topic: `user:${actor.userId}` },
    { headers: { "cache-control": "no-store" } },
  );
}
