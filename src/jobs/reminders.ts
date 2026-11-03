import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";
import { notification } from "@/database/schema/notifications";
import { addDays, hourIn, todayIn } from "@/domain/dates";
import { isInstallmentPlan, nextInstallment } from "@/domain/installments";
import type { Currency } from "@/domain/money";
import { OVERDUE_MAX_DAYS, REMINDER_HOUR, reminderFor } from "@/domain/reminders";
import { newId } from "@/lib/server/ids";
import { Effects } from "@/services/effects";
import { enqueue } from "@/services/notifications/enqueue";
import type { NotificationType } from "@/services/notifications/types";

type Row = {
  id: string;
  title: string;
  remaining: string;
  currency: Currency;
  due_on: string;
  creditor_id: string;
  debtor_id: string;
  creditor_user: string | null;
  debtor_user: string | null;
  debtor_kind: string;
  debtor_email: string | null;
  creditor_tz: string | null;
  creditor_locale: string | null;
  debtor_tz: string | null;
  creditor_name_for_debtor: string;
  debtor_name_for_creditor: string;
  creditor_display: string;
  amount: string;
  paid: string;
  installments: unknown;
};

export async function runDueReminders(now = new Date()): Promise<number> {
  const utcToday = todayIn("UTC", now);
  const rows = await db.execute<Row>(sql`
    select o.id, o.title, (o.amount - o.paid) as remaining, o.amount, o.paid, o.installments,
      o.currency, o.due_on, o.creditor_id, o.debtor_id,
      c.user_id as creditor_user, d.user_id as debtor_user, d.kind as debtor_kind, d.email as debtor_email,
      pc.timezone as creditor_tz, uc.locale as creditor_locale, pd.timezone as debtor_tz,
      coalesce((select name from party_alias where owner_user_id = d.user_id and party_id = c.id), c.display_name) as creditor_name_for_debtor,
      coalesce((select name from party_alias where owner_user_id = c.user_id and party_id = d.id), d.display_name) as debtor_name_for_creditor,
      c.display_name as creditor_display
    from obligation o
    join party c on c.id = o.creditor_id
    join party d on d.id = o.debtor_id
    left join profile pc on pc.user_id = c.user_id
    left join "user" uc on uc.id = c.user_id
    left join profile pd on pd.user_id = d.user_id
    where o.status = 'ACTIVE' and o.paid < o.amount and o.due_on is not null
      and o.due_on between ${addDays(utcToday, -OVERDUE_MAX_DAYS - 1)} and ${addDays(utcToday, 4)}`);

  let created = 0;
  const fx = new Effects();
  for (const r of rows) {
    const plan = isInstallmentPlan(r.installments) ? r.installments : null;
    const next = plan ? nextInstallment(Number(r.amount), plan, Number(r.paid)) : null;
    const data = {
      title: r.title,
      amount: next ? next.dueAmount : Number(r.remaining),
      currency: r.currency,
      ...(next && plan ? { seq: next.seq, seqTotal: plan.count } : {}),
    };

    if (r.debtor_user && r.debtor_tz && hourIn(r.debtor_tz, now) === REMINDER_HOUR) {
      const today = todayIn(r.debtor_tz, now);
      const plan = reminderFor(r.due_on, today, "DEBTOR");
      if (plan) {
        await db.transaction((tx) =>
          enqueue(tx, fx, {
            type: plan.kind as NotificationType,
            recipients: [
              {
                userId: r.debtor_user!,
                data: { counterpartName: r.creditor_name_for_debtor, direction: "I_OWE", days: plan.daysOverdue },
              },
            ],
            data,
            url: `/debts/${r.id}`,
            dedupeBase: `due:${r.id}:${today}:${plan.kind}:D`,
            tag: `due:${r.id}`,
          }),
        );
        created++;
      }
    }

    if (r.creditor_user && r.creditor_tz && hourIn(r.creditor_tz, now) === REMINDER_HOUR) {
      const today = todayIn(r.creditor_tz, now);
      const plan = reminderFor(r.due_on, today, "CREDITOR");
      if (plan) {
        await db.transaction((tx) =>
          enqueue(tx, fx, {
            type: plan.kind as NotificationType,
            recipients: [
              {
                userId: r.creditor_user!,
                data: { counterpartName: r.debtor_name_for_creditor, direction: "THEY_OWE", days: plan.daysOverdue },
              },
            ],
            data,
            url: `/debts/${r.id}`,
            dedupeBase: `due:${r.id}:${today}:${plan.kind}:C`,
            tag: `due:${r.id}`,
          }),
        );
        created++;
      }
    }

    if (
      !r.debtor_user &&
      r.debtor_kind === "MANUAL" &&
      r.debtor_email &&
      r.creditor_tz &&
      hourIn(r.creditor_tz, now) === REMINDER_HOUR
    ) {
      const today = todayIn(r.creditor_tz, now);
      const plan = reminderFor(r.due_on, today, "DEBTOR");
      if (plan && (plan.kind === "DUE_TODAY" || plan.kind === "OVERDUE")) {
        await db
          .insert(notification)
          .values({
            id: newId(),
            type: plan.kind,
            recipientEmail: r.debtor_email,
            channel: "EMAIL",
            dedupeKey: `due:${r.id}:${today}:${plan.kind}:EXT`,
            payload: {
              type: "EXTERNAL_DUE",
              url: "/",
              data: {
                ...data,
                actorName: r.creditor_display,
                days: plan.daysOverdue,
                locale: r.creditor_locale === "en" ? "en" : "id",
              },
            } as never,
            status: "PENDING",
          })
          .onConflictDoNothing();
        created++;
      }
    }
  }
  await fx.flush();
  return created;
}

import { runDigests } from "@/jobs/digest";
import { runRecurring } from "@/jobs/recurring";
import { log } from "@/lib/server/logger";
import { dispatchPending } from "@/services/notifications/dispatch";
export async function runHourlyReminders() {
  const recurring = await runRecurring().catch((err) => {
    log.error({ err }, "recurring job failed");
    return 0;
  });
  const created = await runDueReminders();
  const digests = await runDigests().catch((err) => {
    log.error({ err }, "digest job failed");
    return 0;
  });
  const sent = await dispatchPending({ limit: 200 });
  return { recurring, created, digests, sent };
}
