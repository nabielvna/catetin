import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";

export async function runCleanup(): Promise<void> {
  await db.execute(sql`delete from app_rate_limit where window_end < now()`);
  await db.execute(sql`delete from auth_rate_limit where last_request < (extract(epoch from now()) * 1000 - 86400000)`);
  await db.execute(sql`delete from verification where expires_at < now() - interval '1 day'`);
  await db.execute(sql`delete from session where expires_at < now()`);

  await db.execute(sql`delete from assistant_thread where updated_at < now() - interval '24 hours'`);

  await db.execute(
    sql`delete from notification where channel <> 'INBOX' and status in ('SENT', 'SKIPPED', 'FAILED') and created_at < now() - interval '30 days'`,
  );
  await db.execute(sql`delete from notification where channel = 'INBOX' and created_at < now() - interval '180 days'`);
  await db.execute(
    sql`update invite set revoked_at = now() where revoked_at is null and expires_at < now() - interval '7 days'`,
  );
}
