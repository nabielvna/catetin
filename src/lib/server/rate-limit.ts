import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "@/database/client";
import { appRateLimit } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";

export async function increment(key: string, windowSeconds: number): Promise<number> {
  const [row] = await db.execute<{ count: number }>(sql`
    insert into app_rate_limit (key, count, window_end)
    values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when app_rate_limit.window_end < now() then 1 else app_rate_limit.count + 1 end,
      window_end = case when app_rate_limit.window_end < now() then now() + make_interval(secs => ${windowSeconds}) else app_rate_limit.window_end end
    returning count`);
  return Number(row?.count ?? 0);
}

export async function decrement(key: string): Promise<void> {
  await db.execute(sql`
    update app_rate_limit set count = greatest(count - 1, 0)
    where key = ${key} and window_end > now()`);
}

export async function peek(key: string): Promise<number> {
  const [row] = await db
    .select({ count: appRateLimit.count })
    .from(appRateLimit)
    .where(and(eq(appRateLimit.key, key), gt(appRateLimit.windowEnd, sql`now()`)));
  return row?.count ?? 0;
}

export async function consume(key: string, limit: number, windowSeconds: number): Promise<void> {
  if ((await increment(key, windowSeconds)) > limit) throw new DomainError("RATE_LIMITED");
}
