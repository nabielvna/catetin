import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";
import { notification } from "@/database/schema/notifications";
import { addDays, diffDays, hourIn, todayIn } from "@/domain/dates";
import { isInstallmentPlan, nextInstallment } from "@/domain/installments";
import type { Currency } from "@/domain/money";
import { REMINDER_HOUR } from "@/domain/reminders";
import { newId } from "@/lib/server/ids";

export type DigestLine = {
  title: string;
  name: string;
  amount: number;
  currency: Currency;
  dueOn: string;
  direction: "I_OWE" | "THEY_OWE";
  days: number;
  seq: number | null;
};

export type DigestData = {
  frequency: "WEEKLY" | "DAILY";
  net: Array<{ currency: Currency; amount: number }>;
  due: DigestLine[];
  overdue: DigestLine[];
  overdueMore: number;
  awaiting: number;
  disputable: number;
};

const MAX_LINES = 8;

function isMonday(tz: string, now: Date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now) === "Mon";
}

export async function buildDigest(
  user: { userId: string; partyId: string },
  today: string,
  frequency: "WEEKLY" | "DAILY",
): Promise<DigestData | null> {
  const me = user.partyId;
  const rows = await db.execute<{
    id: string;
    title: string;
    amount: string;
    paid: string;
    currency: Currency;
    due_on: string | null;
    installments: unknown;
    creditor_id: string;
    other_name: string;
  }>(sql`
    select o.id, o.title, o.amount, o.paid, o.currency, o.due_on, o.installments, o.creditor_id,
      coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${user.userId}
        and pa.party_id = case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end),
        (select p.display_name from party p where p.id = case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end)) as other_name
    from obligation o
    where (o.creditor_id = ${me} or o.debtor_id = ${me}) and o.status = 'ACTIVE' and o.paid < o.amount`);

  const net = new Map<Currency, number>();
  const due: DigestLine[] = [];
  const overdue: DigestLine[] = [];
  const horizon = addDays(today, frequency === "WEEKLY" ? 7 : 1);
  for (const r of rows) {
    const amount = Number(r.amount);
    const paid = Number(r.paid);
    const remaining = amount - paid;
    const theyOwe = r.creditor_id === me;
    net.set(r.currency, (net.get(r.currency) ?? 0) + (theyOwe ? remaining : -remaining));
    if (!r.due_on) continue;
    const plan = isInstallmentPlan(r.installments) ? r.installments : null;
    const next = plan ? nextInstallment(amount, plan, paid) : null;
    const line: DigestLine = {
      title: r.title,
      name: r.other_name,
      amount: next ? next.dueAmount : remaining,
      currency: r.currency,
      dueOn: r.due_on,
      direction: theyOwe ? "THEY_OWE" : "I_OWE",
      days: diffDays(r.due_on, today),
      seq: next ? next.seq : null,
    };
    if (r.due_on < today) overdue.push(line);
    else if (r.due_on <= horizon) due.push(line);
  }
  due.sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1));
  overdue.sort((a, b) => (a.dueOn < b.dueOn ? -1 : 1));

  const [counts] = await db.execute<{ awaiting: number; disputable: number }>(sql`
    select
      (select count(*)::int from approval_vote v join approval_request r on r.id = v.request_id
        where v.party_id = ${me} and v.decision = 'PENDING' and r.status = 'PENDING') as awaiting,
      (select count(*)::int from trust_action t
        where t.harmed_party_id = ${me} and t.disputed_at is null and t.dispute_until > now()) as disputable`);

  const netList = [...net.entries()].filter(([, v]) => v !== 0).map(([currency, amount]) => ({ currency, amount }));
  const data: DigestData = {
    frequency,
    net: netList,
    due: due.slice(0, MAX_LINES),
    overdue: overdue.slice(0, MAX_LINES),
    overdueMore: Math.max(0, overdue.length - MAX_LINES),
    awaiting: counts?.awaiting ?? 0,
    disputable: counts?.disputable ?? 0,
  };
  const actionable = due.length + overdue.length + data.awaiting + data.disputable;

  if (actionable === 0 && (frequency === "DAILY" || netList.length === 0)) return null;
  return data;
}

export async function runDigests(now = new Date()): Promise<number> {
  const users = await db.execute<{ user_id: string; party_id: string; timezone: string; digest: string }>(sql`
    select pr.user_id, pr.party_id, pr.timezone, pr.digest from profile pr
    join "user" u on u.id = pr.user_id
    where pr.digest <> 'OFF' and u.onboarded_at is not null`);
  let queued = 0;
  for (const u of users) {
    if (hourIn(u.timezone, now) !== REMINDER_HOUR) continue;
    const frequency = u.digest === "DAILY" ? "DAILY" : "WEEKLY";
    if (frequency === "WEEKLY" && !isMonday(u.timezone, now)) continue;
    const today = todayIn(u.timezone, now);
    const data = await buildDigest({ userId: u.user_id, partyId: u.party_id }, today, frequency);
    if (!data) continue;
    const inserted = await db
      .insert(notification)
      .values({
        id: newId(),
        type: "DIGEST",
        recipientUserId: u.user_id,
        channel: "EMAIL",
        dedupeKey: `digest:${u.user_id}:${today}`,
        payload: { type: "DIGEST", url: "/home", data } as never,
        status: "PENDING",
      })
      .onConflictDoNothing()
      .returning({ id: notification.id });
    queued += inserted.length;
  }
  return queued;
}
