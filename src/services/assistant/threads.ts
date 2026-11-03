import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";

import { db } from "@/database/client";
import { assistantThread } from "@/database/schema/assistant";
import type { Actor } from "@/services/context";

export const IDLE_MS = 30 * 60_000;

export async function activeThread(actor: Actor, now = new Date()) {
  const [row] = await db
    .select()
    .from(assistantThread)
    .where(
      and(
        eq(assistantThread.userId, actor.userId),
        isNull(assistantThread.closedAt),
        gt(assistantThread.updatedAt, new Date(now.getTime() - IDLE_MS)),
      ),
    )
    .orderBy(desc(assistantThread.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function loadThread(actor: Actor, id: string): Promise<unknown[]> {
  const [row] = await db
    .select({ messages: assistantThread.messages })
    .from(assistantThread)
    .where(and(eq(assistantThread.id, id), eq(assistantThread.userId, actor.userId), isNull(assistantThread.closedAt)));
  return Array.isArray(row?.messages) ? row.messages : [];
}

export async function saveThread(actor: Actor, id: string, messages: unknown[]) {
  await db
    .insert(assistantThread)
    .values({ id, userId: actor.userId, messages, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: assistantThread.id,
      set: { messages, updatedAt: new Date() },
      setWhere: eq(assistantThread.userId, actor.userId),
    });
}

export async function closeThread(actor: Actor, id: string) {
  await db.delete(assistantThread).where(and(eq(assistantThread.id, id), eq(assistantThread.userId, actor.userId)));
}
