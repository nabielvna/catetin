import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { notification, notificationPref } from "@/database/schema/index";
import { newId } from "@/lib/server/ids";
import type { Effects } from "@/services/effects";
import {
  DEFAULT_CHANNELS,
  NOTIFICATION_TYPES,
  type NotificationData,
  type NotificationType,
  type StoredPayload,
} from "@/services/notifications/types";

export type Recipient = {
  userId: string;

  data?: NotificationData;
};

export type EnqueueInput = {
  type: NotificationType;
  recipients: Recipient[];
  data: NotificationData;
  url: string;
  activityId?: number | null;

  dedupeBase?: string;
  tag?: string;

  notBefore?: Date;
};

async function prefsFor(tx: DbOrTx, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, boolean>();
  const rows = await tx.select().from(notificationPref).where(inArray(notificationPref.userId, userIds));
  return new Map(rows.map((r) => [`${r.userId}:${r.topic}:${r.channel}`, r.enabled]));
}

export async function enqueue(tx: Tx, fx: Effects, input: EnqueueInput): Promise<void> {
  const recipients = dedupeRecipients(input.recipients);
  if (recipients.length === 0) return;
  const topic = NOTIFICATION_TYPES[input.type];
  const prefs = await prefsFor(
    tx,
    recipients.map((r) => r.userId),
  );
  const base = input.dedupeBase ?? (input.activityId ? `act:${input.activityId}` : newId());

  const rows: Array<typeof notification.$inferInsert> = [];
  for (const r of recipients) {
    const payload: StoredPayload = {
      type: input.type,
      url: input.url,
      data: { ...input.data, ...r.data },
      tag: input.tag,
    };
    rows.push({
      id: newId(),
      activityId: input.activityId ?? null,
      type: input.type,
      recipientUserId: r.userId,
      channel: "INBOX",
      dedupeKey: `${base}:${input.type}:${r.userId}:INBOX`,
      payload: payload as never,
      status: "SENT",
      sentAt: new Date(),
    });
    for (const channel of ["PUSH", "EMAIL"] as const) {
      const enabled = prefs.get(`${r.userId}:${topic}:${channel}`) ?? DEFAULT_CHANNELS[topic][channel];
      if (!enabled) continue;
      rows.push({
        id: newId(),
        activityId: input.activityId ?? null,
        type: input.type,
        recipientUserId: r.userId,
        channel,
        dedupeKey: `${base}:${input.type}:${r.userId}:${channel}`,
        payload: payload as never,
        status: "PENDING",
        nextAttemptAt: input.notBefore ?? new Date(),
      });
    }
  }
  const inserted = await tx
    .insert(notification)
    .values(rows)
    .onConflictDoNothing({ target: notification.dedupeKey })
    .returning({ channel: notification.channel, userId: notification.recipientUserId });
  if (inserted.some((r) => r.channel !== "INBOX")) fx.dispatch = true;
  fx.refreshUsers(
    inserted.filter((r) => r.channel === "INBOX").map((r) => r.userId),
    { scope: "inbox" },
  );
}

function dedupeRecipients(rs: Recipient[]): Recipient[] {
  const seen = new Map<string, Recipient>();
  for (const r of rs) if (!seen.has(r.userId)) seen.set(r.userId, r);
  return [...seen.values()];
}

export async function markRead(tx: DbOrTx, userId: string, ids: string[] | "all") {
  const where =
    ids === "all"
      ? and(eq(notification.recipientUserId, userId), eq(notification.channel, "INBOX"))
      : and(eq(notification.recipientUserId, userId), eq(notification.channel, "INBOX"), inArray(notification.id, ids));
  await tx.update(notification).set({ readAt: new Date() }).where(where);
}
