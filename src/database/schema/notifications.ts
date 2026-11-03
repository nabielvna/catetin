import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { activity } from "./activity";
import { session, user } from "./auth";
import { createdAt, inList, ts } from "./columns";

export const NOTIFICATION_CHANNELS = ["INBOX", "PUSH", "EMAIL"] as const;

export const NOTIFICATION_STATUSES = ["PENDING", "SENT", "FAILED", "SKIPPED"] as const;

export type NotificationPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;

  template?: string;
  data?: Record<string, unknown>;
};

export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey(),
    activityId: bigint("activity_id", { mode: "number" }).references(() => activity.id),
    type: text("type").notNull(),
    recipientUserId: uuid("recipient_user_id").references(() => user.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email"),
    channel: text("channel", { enum: NOTIFICATION_CHANNELS }).notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    payload: jsonb("payload").$type<NotificationPayload>().notNull(),
    status: text("status", { enum: NOTIFICATION_STATUSES }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
    readAt: ts("read_at"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notification_dispatch_idx")
      .on(t.nextAttemptAt)
      .where(sql`status = 'PENDING' and channel <> 'INBOX'`),
    index("notification_inbox_idx").on(t.recipientUserId, t.channel, t.createdAt),
    check("notification_channel_ck", inList("channel", NOTIFICATION_CHANNELS)),
    check("notification_status_ck", inList("status", NOTIFICATION_STATUSES)),
    check("notification_recipient_ck", sql`recipient_user_id is not null or recipient_email is not null`),
  ],
);

export const pushSubscription = pgTable(
  "push_subscription",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),

    sessionId: uuid("session_id").references(() => session.id, { onDelete: "cascade" }),
    lastUsedAt: ts("last_used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscription_user_idx").on(t.userId), index("push_subscription_session_idx").on(t.sessionId)],
);

export const notificationPref = pgTable(
  "notification_pref",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    topic: text("topic").notNull(),
    channel: text("channel", { enum: NOTIFICATION_CHANNELS }).notNull(),
    enabled: boolean("enabled").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topic, t.channel] })],
);

export const emailSuppression = pgTable("email_suppression", {
  email: text("email").primaryKey(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});
