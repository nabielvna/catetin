import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";
import { type BalanceSummary, summarize } from "@/domain/balance";
import { addDays, type LocalDate, todayIn } from "@/domain/dates";
import type { Currency } from "@/domain/money";
import type { Actor } from "@/services/context";

export async function balanceSummary(actor: Actor): Promise<BalanceSummary> {
  const rows = await db.execute<{ creditor_id: string; debtor_id: string; currency: Currency; remaining: string }>(sql`
    select creditor_id, debtor_id, currency, sum(amount - paid) as remaining
    from obligation
    where status = 'ACTIVE' and paid < amount
      and (creditor_id = ${actor.partyId} or debtor_id = ${actor.partyId})
    group by creditor_id, debtor_id, currency`);
  return summarize(
    actor.partyId,
    rows.map((r) => ({
      creditorId: r.creditor_id,
      debtorId: r.debtor_id,
      currency: r.currency,
      remaining: Number(r.remaining),
    })),
  );
}

export type DueItem = {
  obligationId: string;
  counterpartId: string;
  counterpartName: string;
  title: string;
  dueOn: LocalDate;
  remaining: number;
  currency: Currency;
  direction: "THEY_OWE" | "I_OWE";
  groupName: string | null;
};

export async function dueSoon(actor: Actor, now = new Date(), days = 7): Promise<DueItem[]> {
  const today = todayIn(actor.timezone, now);
  const until = addDays(today, days);
  const rows = await db.execute<{
    id: string;
    creditor_id: string;
    debtor_id: string;
    title: string;
    due_on: string;
    remaining: string;
    currency: Currency;
    other_name: string;
    group_name: string | null;
  }>(sql`
    select o.id, o.creditor_id, o.debtor_id, o.title, o.due_on, (o.amount - o.paid) as remaining, o.currency,
      coalesce(
        (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId}
          and pa.party_id = case when o.creditor_id = ${actor.partyId} then o.debtor_id else o.creditor_id end),
        (select p.display_name from party p
          where p.id = case when o.creditor_id = ${actor.partyId} then o.debtor_id else o.creditor_id end)
      ) as other_name,
      g.name as group_name
    from obligation o
    left join groups g on g.id = o.group_id
    where o.status = 'ACTIVE' and o.paid < o.amount and o.due_on is not null and o.due_on <= ${until}
      and (o.creditor_id = ${actor.partyId} or o.debtor_id = ${actor.partyId})
    order by o.due_on, o.created_at
    limit 20`);
  return rows.map((r) => {
    const theyOwe = r.creditor_id === actor.partyId;
    return {
      obligationId: r.id,
      counterpartId: theyOwe ? r.debtor_id : r.creditor_id,
      counterpartName: r.other_name,
      title: r.title,
      dueOn: r.due_on,
      remaining: Number(r.remaining),
      currency: r.currency,
      direction: theyOwe ? "THEY_OWE" : "I_OWE",
      groupName: r.group_name,
    };
  });
}

export async function hasAnything(actor: Actor): Promise<boolean> {
  const rows = await db.execute<{ ok: number }>(sql`
    select 1 as ok from pair where (party_low = ${actor.partyId} or party_high = ${actor.partyId}) and merged_into is null
    union all
    select 1 from group_member where party_id = ${actor.partyId} and status in ('ACTIVE', 'INVITED', 'PENDING')
    limit 1`);
  return rows.length > 0;
}
