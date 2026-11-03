import "server-only";

import { type SQL, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/client";
import type { Currency } from "@/domain/money";
import { type RecordRow, recordStatusOf } from "@/domain/records";
import type { Actor } from "@/services/context";
import { labelsFor } from "@/services/labels";
import { iso } from "@/services/people/display";

const counterpartName = (actor: Actor, other: SQL) => sql`coalesce(
  (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = ${other}),
  (select p.display_name from party p where p.id = ${other}))`;

const otherOfObligation = (me: string) =>
  sql`(case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end)`;
const otherOfSettlement = (me: string) => sql`(case when s.payer_id = ${me} then s.payee_id else s.payer_id end)`;

type ObligationRow = {
  id: string;
  title: string;
  occurred_on: string;
  due_on: string | null;
  created_at: Date;
  creditor_id: string;
  debtor_id: string;
  other_name: string;
  group_id: string | null;
  group_name: string | null;
  amount: string;
  paid: string;
  currency: Currency;
  status: string;
  category: string | null;
  pending_with: string | null;
};

function obligationsSql(actor: Actor, where: SQL, tail: SQL) {
  const me = actor.partyId;
  return sql`
    select o.id, o.title, o.occurred_on, o.due_on, o.created_at, o.creditor_id, o.debtor_id,
      ${counterpartName(actor, otherOfObligation(me))} as other_name,
      o.group_id, g.name as group_name, o.amount, o.paid, o.currency, o.status, o.category,
      (select v.party_id from approval_request r join approval_vote v on v.request_id = r.id and v.decision = 'PENDING'
        where r.target_type = 'OBLIGATION' and r.target_id = o.id and r.status = 'PENDING' limit 1) as pending_with
    from obligation o
    left join groups g on g.id = o.group_id
    where (o.creditor_id = ${me} or o.debtor_id = ${me}) and ${where}
    ${tail}`;
}

function toRow(actor: Actor, o: ObligationRow, labels: string[]): RecordRow {
  const amount = Number(o.amount);
  const paid = Number(o.paid);
  const theyOwe = o.creditor_id === actor.partyId;
  return {
    id: o.id,
    title: o.title,
    occurredOn: o.occurred_on,
    dueOn: o.due_on,
    createdAt: iso(o.created_at),
    counterpartId: theyOwe ? o.debtor_id : o.creditor_id,
    counterpartName: o.other_name ?? "?",
    groupId: o.group_id,
    groupName: o.group_name,
    amount,
    remaining: amount - paid,
    currency: o.currency,
    direction: theyOwe ? "THEY_OWE" : "I_OWE",
    status: recordStatusOf(o.status, amount, paid),
    pendingWith: o.pending_with ? (o.pending_with === actor.partyId ? "ME" : "THEM") : null,
    category: o.category,
    labels,
  };
}

export const allRecords = cache(async (actor: Actor): Promise<RecordRow[]> => {
  const rows = await db.execute<ObligationRow>(obligationsSql(actor, sql`true`, sql``));
  const labels = await labelsFor(
    actor.userId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toRow(actor, r, labels.get(r.id) ?? []));
});

export async function openRecords(actor: Actor, limit = 5): Promise<{ rows: RecordRow[]; total: number }> {
  const open = sql`o.status = 'ACTIVE' and o.paid < o.amount`;
  const [rows, [count]] = await Promise.all([
    db.execute<ObligationRow>(obligationsSql(actor, open, sql`order by o.occurred_on, o.created_at limit ${limit}`)),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from obligation o
      where (o.creditor_id = ${actor.partyId} or o.debtor_id = ${actor.partyId}) and ${open}`),
  ]);
  return { rows: rows.map((r) => toRow(actor, r, [])), total: count?.n ?? 0 };
}

export type RecentEntry = {
  kind: "OBLIGATION" | "PAYMENT" | "FORGIVE" | "OFFSET" | "NETTING";
  id: string;
  title: string;
  counterpartName: string;
  groupName: string | null;
  amount: number;
  currency: Currency;

  direction: "THEY_OWE" | "I_OWE" | "IN" | "OUT";
  status: string;

  fromBill: boolean;
  pendingWith: "ME" | "THEM" | null;
  createdAt: string;
};

export async function recentEntries(actor: Actor, limit = 5): Promise<RecentEntry[]> {
  const me = actor.partyId;
  const rows = await db.execute<{
    kind: RecentEntry["kind"];
    id: string;
    title: string;
    other_name: string;
    group_name: string | null;
    amount: string;
    currency: Currency;
    mine: boolean;
    status: string;
    from_bill: boolean;
    pending_with: string | null;
    created_at: Date;
  }>(sql`
    (select 'OBLIGATION' as kind, o.id, o.title, ${counterpartName(actor, otherOfObligation(me))} as other_name,
        g.name as group_name, o.amount, o.currency, o.creditor_id = ${me} as mine, o.status,
        o.bill_id is not null as from_bill,
        (select v.party_id from approval_request r join approval_vote v on v.request_id = r.id and v.decision = 'PENDING'
          where r.target_type = 'OBLIGATION' and r.target_id = o.id and r.status = 'PENDING' limit 1) as pending_with,
        o.created_at
      from obligation o left join groups g on g.id = o.group_id
      where (o.creditor_id = ${me} or o.debtor_id = ${me})
      order by o.created_at desc limit ${limit})
    union all
    (select s.kind, s.id, coalesce(s.note, '') as title,
        ${counterpartName(actor, otherOfSettlement(me))} as other_name,
        g.name as group_name, s.amount, s.currency, s.payer_id = ${me} as mine, s.status, false as from_bill,
        (select v.party_id from approval_request r join approval_vote v on v.request_id = r.id and v.decision = 'PENDING'
          where r.target_type = 'SETTLEMENT' and r.target_id = s.id and r.status = 'PENDING' limit 1) as pending_with,
        s.created_at
      from settlement s left join groups g on g.id = s.group_id
      where s.payer_id = ${me} or s.payee_id = ${me}
      order by s.created_at desc limit ${limit})
    order by created_at desc limit ${limit}`);
  return rows.map((r) => ({
    kind: r.kind,
    id: r.id,
    title: r.title,
    counterpartName: r.other_name ?? "?",
    groupName: r.group_name,
    amount: Number(r.amount),
    currency: r.currency,
    direction: r.kind === "OBLIGATION" ? (r.mine ? "THEY_OWE" : "I_OWE") : r.mine ? "OUT" : "IN",
    status: r.status,
    fromBill: r.from_bill,
    pendingWith: r.pending_with ? (r.pending_with === me ? "ME" : "THEM") : null,
    createdAt: iso(r.created_at),
  }));
}
