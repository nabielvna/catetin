import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/database/client";
import { notification } from "@/database/schema/index";
import { awaitingCountQuery } from "@/services/approvals/queries";
import type { Actor } from "@/services/context";
import { markRead } from "@/services/notifications/enqueue";
import type { StoredPayload } from "@/services/notifications/types";
export type NotificationItem = { id: string; payload: StoredPayload; createdAt: string; read: boolean };

export async function listNotifications(actor: Actor, limit = 60): Promise<NotificationItem[]> {
  const rows = await db
    .select()
    .from(notification)
    .where(and(eq(notification.recipientUserId, actor.userId), eq(notification.channel, "INBOX")))
    .orderBy(desc(notification.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    payload: r.payload as unknown as StoredPayload,
    createdAt: r.createdAt.toISOString(),
    read: r.readAt !== null,
  }));
}

export async function inboxCounts(actor: Actor): Promise<{ awaiting: number; unread: number }> {
  const [row] = await db.execute<{ awaiting: number; unread: number }>(sql`
    select ${awaitingCountQuery(actor)} as awaiting,
      (select count(*)::int from notification n
        where n.recipient_user_id = ${actor.userId} and n.channel = 'INBOX' and n.read_at is null) as unread`);
  return { awaiting: row?.awaiting ?? 0, unread: row?.unread ?? 0 };
}

export async function readNotifications(actor: Actor, ids: string[] | "all") {
  await markRead(db, actor.userId, ids);
}
