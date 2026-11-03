import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";

import { db } from "@/database/client";
import { emailSuppression, notification, profile, pushSubscription, user } from "@/database/schema/index";
import { hourIn } from "@/domain/dates";
import { type Currency, formatMoney } from "@/domain/money";
import { hoursUntilQuietEnds } from "@/domain/reminders";
import { messagesFor } from "@/i18n/messages";
import { sendMail } from "@/integrations/email/send";
import { digestEmail } from "@/integrations/email/templates/digest";
import { noticeEmail } from "@/integrations/email/templates/notification";
import { sendPush } from "@/integrations/push/server";
import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";
import { sign } from "@/lib/server/signing";
import { renderDigest } from "@/services/notifications/digest-text";
import { renderNotification } from "@/services/notifications/render";
import type { DigestData } from "@/services/notifications/types";
import type { StoredPayload } from "@/services/notifications/types";

const BACKOFF_MIN = [1, 5, 30, 120, 720];
const MAX_ATTEMPTS = BACKOFF_MIN.length;

const NON_USER_DAILY_LIMIT = 3;

type Row = typeof notification.$inferSelect;

function absolute(url: string) {
  return url.startsWith("http") ? url : `${env().APP_URL}${url}`;
}

export async function dispatchPending(opts: { limit?: number; now?: Date } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  let sent = 0;
  const rows = await db.transaction(async (tx) => {
    const picked = await tx
      .select()
      .from(notification)
      .where(
        and(
          eq(notification.status, "PENDING"),
          sql`${notification.channel} <> 'INBOX'`,
          lte(notification.nextAttemptAt, now),
        ),
      )
      .orderBy(notification.nextAttemptAt)
      .limit(opts.limit ?? 100)
      .for("update", { skipLocked: true });

    for (const r of picked) {
      await tx
        .update(notification)
        .set({ nextAttemptAt: new Date(now.getTime() + 5 * 60_000), attempts: r.attempts + 1 })
        .where(eq(notification.id, r.id));
    }
    return picked;
  });

  for (const row of rows) {
    try {
      const outcome = await deliver(row, now);
      if (outcome.status === "RESCHEDULE") {
        await db
          .update(notification)
          .set({ nextAttemptAt: outcome.at, attempts: row.attempts })
          .where(eq(notification.id, row.id));
        continue;
      }
      await db
        .update(notification)
        .set({ status: outcome.status, sentAt: outcome.status === "SENT" ? now : null, error: outcome.error ?? null })
        .where(eq(notification.id, row.id));
      if (outcome.status === "SENT") sent++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db
        .update(notification)
        .set({
          status: failed ? "FAILED" : "PENDING",
          error: String((err as Error).message ?? err).slice(0, 500),
          nextAttemptAt: new Date(now.getTime() + (BACKOFF_MIN[attempts] ?? 720) * 60_000),
        })
        .where(eq(notification.id, row.id));
      log.warn({ err, id: row.id }, "notification delivery failed");
    }
  }
  return sent;
}

type Outcome = { status: "SENT" | "SKIPPED" | "FAILED"; error?: string } | { status: "RESCHEDULE"; at: Date };

async function deliver(row: Row, now: Date): Promise<Outcome> {
  const payload = row.payload as unknown as StoredPayload;
  if (row.recipientUserId) {
    const [prof] = await db
      .select({
        timezone: profile.timezone,
        quietStart: profile.quietStart,
        quietEnd: profile.quietEnd,
        locale: user.locale,
        email: user.email,
      })
      .from(profile)
      .innerJoin(user, eq(user.id, profile.userId))
      .where(eq(profile.userId, row.recipientUserId));
    if (!prof) return { status: "SKIPPED", error: "no profile" };
    const wait = hoursUntilQuietEnds(hourIn(prof.timezone, now), { start: prof.quietStart, end: prof.quietEnd });
    if (wait > 0) return { status: "RESCHEDULE", at: new Date(now.getTime() + wait * 3_600_000) };
    const locale = prof.locale === "en" ? "en" : "id";
    if ((payload.type as string) === "DIGEST") {
      if (row.channel !== "EMAIL") return { status: "SKIPPED" };
      const mail = await digestEmail(renderDigest(payload.data as unknown as DigestData, locale, absolute("/home")));
      await sendMail({ to: prof.email, ...mail });
      return { status: "SENT" };
    }
    const text = renderNotification(payload, locale);
    if (row.channel === "PUSH") return deliverPush(row.recipientUserId, payload, text);
    if (row.channel === "EMAIL") {
      const t = messagesFor(locale).email.notice;
      const mail = await noticeEmail({
        subject: text.title,
        preview: text.body,
        heading: text.title,
        body: text.body,
        cta: t.cta,
        url: absolute(payload.url),
        footer: t.footer,
      });
      await sendMail({ to: prof.email, ...mail });
      return { status: "SENT" };
    }
    return { status: "SKIPPED" };
  }

  if (row.channel === "EMAIL" && row.recipientEmail) {
    const email = row.recipientEmail;
    const [supp] = await db.select().from(emailSuppression).where(eq(emailSuppression.email, email));
    if (supp) return { status: "SKIPPED", error: "suppressed" };
    const [cnt] = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from notification
      where recipient_email = ${email} and status = 'SENT' and sent_at > ${new Date(now.getTime() - 86_400_000).toISOString()}`);
    if ((cnt?.n ?? 0) >= NON_USER_DAILY_LIMIT) {
      return { status: "RESCHEDULE", at: new Date(now.getTime() + 12 * 3_600_000) };
    }
    const d = payload.data ?? {};

    const locale = d.locale === "en" ? "en" : "id";
    const t = messagesFor(locale).email.external;
    const actor = d.actorName ?? t.someone;
    const amount =
      d.amount !== undefined && d.currency
        ? formatMoney(d.amount, d.currency as Currency, locale === "en" ? "en-US" : "id-ID")
        : "";
    const fill = (s: string) =>
      s
        .replace(/\{actor\}/g, actor)
        .replace(/\{amount\}/g, amount)
        .replace(/\{title\}/g, d.title ?? "")
        .replace(/\{days\}/g, String(d.days ?? 0));
    const isInvite = (payload.type as string) === "INVITE_EMAIL";
    const heading = fill(isInvite ? t.inviteHeading : d.days ? t.overdueHeading : t.reminderHeading);
    const body = fill(isInvite ? t.inviteBody : t.reminderBody);
    const mail = await noticeEmail({
      subject: fill(isInvite ? t.inviteSubject : t.reminderSubject),
      preview: body,
      heading,
      body,
      cta: isInvite ? t.inviteCta : t.reminderCta,
      url: absolute(payload.url),
      footer: fill(t.footer),
      unsubscribeUrl: absolute(`/api/notifications/unsubscribe?t=${sign(email)}`),
      unsubscribeLabel: t.unsubscribe,
    });
    await sendMail({
      to: email,
      ...mail,
      headers: {
        "List-Unsubscribe": `<${absolute(`/api/notifications/unsubscribe?t=${sign(email)}`)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return { status: "SENT" };
  }
  return { status: "SKIPPED" };
}

async function deliverPush(
  userId: string,
  payload: StoredPayload,
  text: { title: string; body: string },
): Promise<Outcome> {
  const subs = await db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));
  if (subs.length === 0) return { status: "SKIPPED", error: "no subscription" };
  let delivered = 0;
  for (const s of subs) {
    try {
      const configured = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title: text.title, body: text.body, url: payload.url, tag: payload.tag },
      );
      if (!configured) return { status: "SKIPPED", error: "push not configured" };
      delivered++;
      await db.update(pushSubscription).set({ lastUsedAt: new Date() }).where(eq(pushSubscription.id, s.id));
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id));
      } else {
        throw err;
      }
    }
  }
  return delivered > 0 ? { status: "SENT" } : { status: "SKIPPED", error: "all subscriptions gone" };
}
