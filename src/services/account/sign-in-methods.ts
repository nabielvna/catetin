import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/database/client";
import { account } from "@/database/schema/auth";
import type { Actor } from "@/services/context";

export async function signInMethods(actor: Actor): Promise<{ google: { linkedAt: string } | null }> {
  const [row] = await db
    .select({ createdAt: account.createdAt })
    .from(account)
    .where(and(eq(account.userId, actor.userId), eq(account.providerId, "google")))
    .limit(1);
  return { google: row ? { linkedAt: row.createdAt.toISOString() } : null };
}
