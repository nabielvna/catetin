import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/database/client";
import { feedback } from "@/database/schema/feedback";
import { notificationPref, pushSubscription } from "@/database/schema/notifications";
import { profile } from "@/database/schema/users";
import { DomainError } from "@/domain/errors";
import { newId } from "@/lib/server/ids";
import type { Actor } from "@/services/context";
import { DEFAULT_CHANNELS, type NotificationTopic } from "@/services/notifications/types";

export const TOPICS: NotificationTopic[] = ["ACTION", "INFO", "REMINDER"];

export async function getSettings(actor: Actor) {
  const [p] = await db.select().from(profile).where(eq(profile.userId, actor.userId));
  const prefs = await db.select().from(notificationPref).where(eq(notificationPref.userId, actor.userId));
  const matrix = TOPICS.map((topic) => ({
    topic,
    PUSH: prefs.find((x) => x.topic === topic && x.channel === "PUSH")?.enabled ?? DEFAULT_CHANNELS[topic].PUSH,
    EMAIL: prefs.find((x) => x.topic === topic && x.channel === "EMAIL")?.enabled ?? DEFAULT_CHANNELS[topic].EMAIL,
  }));
  return {
    quietStart: p?.quietStart ?? 21,
    quietEnd: p?.quietEnd ?? 8,
    digest: (p?.digest ?? "WEEKLY") as "WEEKLY" | "DAILY" | "OFF",
    prefs: matrix,
  };
}

export async function setPref(
  actor: Actor,
  input: { topic: NotificationTopic; channel: "PUSH" | "EMAIL"; enabled: boolean },
) {
  await db
    .insert(notificationPref)
    .values({ userId: actor.userId, ...input })
    .onConflictDoUpdate({
      target: [notificationPref.userId, notificationPref.topic, notificationPref.channel],
      set: { enabled: input.enabled },
    });
}

export async function setQuietHours(actor: Actor, input: { start: number; end: number }) {
  for (const h of [input.start, input.end]) {
    if (!Number.isInteger(h) || h < 0 || h > 23) throw new DomainError("INVALID_INPUT");
  }
  await db
    .update(profile)
    .set({ quietStart: input.start, quietEnd: input.end })
    .where(eq(profile.userId, actor.userId));
}

export async function setDigestFrequency(actor: Actor, digest: "WEEKLY" | "DAILY" | "OFF") {
  await db.update(profile).set({ digest }).where(eq(profile.userId, actor.userId));
}

export async function savePushSubscription(
  actor: Actor,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null },
  sessionId: string | null,
) {
  await db
    .insert(pushSubscription)
    .values({ id: newId(), userId: actor.userId, ...sub, userAgent: sub.userAgent ?? null, sessionId })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId: actor.userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent ?? null, sessionId },
    });
}

export async function removePushSubscription(actor: Actor, endpoint: string) {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, actor.userId)));
}

export async function sendFeedback(actor: Actor, message: string, context: Record<string, unknown>) {
  const m = message.trim();
  if (!m || m.length > 5000) throw new DomainError("INVALID_INPUT");

  const [row] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from feedback where user_id = ${actor.userId} and created_at > now() - interval '1 day'`);
  if ((row?.n ?? 0) >= 10) throw new DomainError("RATE_LIMITED");
  await db.insert(feedback).values({ id: newId(), userId: actor.userId, message: m, context });
}
