import "server-only";

import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";

import { publishPostgres } from "./postgres";
import { publishSupabase } from "./supabase";
import type { RealtimeMessage } from "./types";

export type { RealtimeMessage } from "./types";
export { PG_CHANNEL } from "./types";

export async function publish(userIds: Iterable<string>, message: RealtimeMessage): Promise<void> {
  const users = [...new Set(userIds)];
  if (!users.length) return;
  try {
    const driver = env().REALTIME_DRIVER;
    if (driver === "pg") await publishPostgres(users, message);
    else if (driver === "supabase") await publishSupabase(users, message);
  } catch (err) {
    log.warn({ err }, "realtime publish failed");
  }
}
