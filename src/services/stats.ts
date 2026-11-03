import "server-only";

import { type SQL, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/client";
import { todayIn } from "@/domain/dates";
import type { Currency } from "@/domain/money";
import type { StatsInput } from "@/domain/stats";
import type { Actor } from "@/services/context";
import { labelsFor } from "@/services/labels";

const nameOf = (actor: Actor, party: SQL) => sql`coalesce(
  (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = ${party}),
  (select p.display_name from party p where p.id = ${party}))`;

export const statsInput = cache(async (actor: Actor): Promise<StatsInput> => {
  const me = actor.partyId;
  const tz = actor.timezone;
  const other = sql`(case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end)`;
  const myPairs = sql`(select id from pair where (party_low = ${me} or party_high = ${me}))`;

  const [obligations, allocations, settlements, reminders, votes, bills] = await Promise.all([
    db.execute<{
      id: string;
      pair_id: string;
      title: string;
      creditor_id: string;
      other_id: string;
      other_name: string;
      group_id: string | null;
      group_name: string | null;
      bill_id: string | null;
      amount: string;
      paid: string;
      currency: Currency;
      category: string | null;
      status: string;
      occurred_on: string;
      due_on: string | null;
      created_at: Date;
      installments: boolean;
      settled_on: string | null;
    }>(sql`
      select o.id, o.pair_id, o.title, o.creditor_id, ${other} as other_id, ${nameOf(actor, other)} as other_name,
        o.group_id, g.name as group_name, o.bill_id, o.amount, o.paid, o.currency, o.category, o.status,
        o.occurred_on, o.due_on, o.created_at, o.installments is not null as installments,
        case when o.status = 'ACTIVE' and o.paid >= o.amount then
          (select max(s.paid_on) from settlement_allocation a join settlement s on s.id = a.settlement_id
            where a.obligation_id = o.id and s.status = 'ACTIVE') end as settled_on
      from obligation o left join groups g on g.id = o.group_id
      where o.creditor_id = ${me} or o.debtor_id = ${me}`),
    db.execute<{ obligation_id: string; amount: string; paid_on: string }>(sql`
      select a.obligation_id, a.amount, s.paid_on
      from settlement_allocation a
      join settlement s on s.id = a.settlement_id and s.status = 'ACTIVE'
      join obligation o on o.id = a.obligation_id
      where o.creditor_id = ${me} or o.debtor_id = ${me}`),
    db.execute<{
      kind: "PAYMENT" | "FORGIVE" | "OFFSET" | "NETTING";
      method: string | null;
      payer_id: string;
      payee_id: string;
      amount: string;
      currency: Currency;
      paid_on: string;
      status: string;
    }>(sql`
      select s.kind, s.method, s.payer_id, s.payee_id, s.amount, s.currency, s.paid_on, s.status
      from settlement s where s.payer_id = ${me} or s.payee_id = ${me}`),
    db.execute<{ pair_id: string; actor_party_id: string | null; created_at: Date }>(sql`
      select a.pair_id, a.actor_party_id, a.created_at from activity a
      where a.type = 'REMINDER_SENT' and a.pair_id in ${myPairs}`),

    db.execute<{ party_id: string; other_id: string; created_at: Date; decided_at: Date }>(sql`
      select v.party_id, case when p.party_low = ${me} then p.party_high else p.party_low end as other_id,
        r.created_at, v.decided_at
      from approval_vote v
      join approval_request r on r.id = v.request_id
      join pair p on p.id = r.pair_id
      where r.pair_id in ${myPairs} and v.decision <> 'PENDING' and v.decided_at is not null
        and coalesce(r.payload->>'migrated', 'false') <> 'true'`),
    db.execute<{
      group_id: string | null;
      payer_id: string;
      payer_name: string;
      occurred_on: string;
      currency: Currency;
    }>(sql`
      select b.group_id, b.payer_party_id as payer_id, ${nameOf(actor, sql`b.payer_party_id`)} as payer_name,
        b.occurred_on, b.currency
      from bill b
      where b.status = 'ACTIVE'
        and (b.payer_party_id = ${me} or exists (select 1 from bill_share bs where bs.bill_id = b.id and bs.party_id = ${me}))`),
  ]);

  const labels = await labelsFor(
    actor.userId,
    obligations.map((o) => o.id),
  );

  return {
    obligations: obligations.map((o) => ({
      id: o.id,
      pairId: o.pair_id,
      title: o.title,
      counterpartId: o.other_id,
      counterpartName: o.other_name ?? "?",
      groupId: o.group_id,
      groupName: o.group_name,
      billId: o.bill_id,
      direction: o.creditor_id === me ? "THEY_OWE" : "I_OWE",
      amount: Number(o.amount),
      paid: Number(o.paid),
      currency: o.currency,
      category: o.category,
      labels: labels.get(o.id) ?? [],
      status: o.status,
      occurredOn: o.occurred_on,
      dueOn: o.due_on,
      createdOn: todayIn(tz, new Date(o.created_at)),
      installments: o.installments,
      settledOn: o.settled_on,
    })),
    allocations: allocations.map((a) => ({
      obligationId: a.obligation_id,
      amount: Number(a.amount),
      paidOn: a.paid_on,
    })),
    settlements: settlements.map((s) => ({
      kind: s.kind,
      method: s.method,
      direction: s.payer_id === me ? "OUT" : "IN",
      amount: Number(s.amount),
      currency: s.currency,
      paidOn: s.paid_on,
      status: s.status,
      counterpartId: s.payer_id === me ? s.payee_id : s.payer_id,
    })),
    reminders: reminders.map((r) => ({
      pairId: r.pair_id,
      byMe: r.actor_party_id === me,
      on: todayIn(tz, new Date(r.created_at)),
    })),
    votes: votes.map((v) => ({
      counterpartId: v.other_id,
      byMe: v.party_id === me,
      minutes: Math.max(0, Math.round((+new Date(v.decided_at) - +new Date(v.created_at)) / 60_000)),
      on: todayIn(tz, new Date(v.decided_at)),
    })),
    bills: bills.map((b) => ({
      groupId: b.group_id,
      payerId: b.payer_id,
      payerName: b.payer_name ?? "?",
      payerIsMe: b.payer_id === me,
      occurredOn: b.occurred_on,
      currency: b.currency,
    })),
  };
});
