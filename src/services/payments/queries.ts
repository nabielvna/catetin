import "server-only";

import { sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/client";
import type { Currency } from "@/domain/money";
import type { DisputableItem } from "@/services/approvals/disputes";
import type { Actor } from "@/services/context";
import { openObligations } from "@/services/payments/allocations";
import { iso } from "@/services/people/display";
import { findPair } from "@/services/people/parties";

export type PayableObligation = {
  id: string;
  title: string;
  currency: Currency;
  available: number;
  remaining: number;
  dueOn: string | null;
  occurredOn: string;
  createdAt: number;

  direction: "THEY_OWE" | "I_OWE";
  groupId: string | null;
  groupName: string | null;
};

export type RecentPayment = {
  id: string;
  amount: number;
  currency: Currency;
  paidOn: string;
  status: "PENDING" | "ACTIVE";

  direction: "in" | "out";
  byMe: boolean;
};

export type PaymentContext = {
  partyId: string;
  pairId: string;
  name: string;
  obligations: PayableObligation[];
  recent: RecentPayment[];
};

const RECENT_DAYS = 3;

export async function paymentContext(actor: Actor, partyId: string): Promise<PaymentContext | null> {
  const pair = await findPair(db, actor.partyId, partyId);
  if (!pair) return null;
  const [n] = await db.execute<{ name: string }>(sql`
    select coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = ${partyId}),
      (select p.display_name from party p where p.id = ${partyId})) as name`);
  const open = await openObligations(db, pair.id);
  const groups = await db.execute<{ id: string; name: string }>(sql`
    select g.id, g.name from groups g where g.id in (select distinct group_id from obligation where pair_id = ${pair.id} and group_id is not null)`);
  const gname = new Map(groups.map((g) => [g.id, g.name]));
  const recent = await db.execute<{
    id: string;
    amount: number;
    currency: Currency;
    paid_on: string;
    status: "PENDING" | "ACTIVE";
    payer_id: string;
    created_by: string | null;
  }>(sql`
    select s.id, s.amount, s.currency, s.paid_on, s.status, s.payer_id, s.created_by from settlement s
    where s.pair_id = ${pair.id} and s.kind = 'PAYMENT'
      and (s.status = 'PENDING' or (s.status = 'ACTIVE' and s.created_at > now() - make_interval(days => ${RECENT_DAYS})))
    order by s.created_at desc limit 5`);
  return {
    partyId,
    pairId: pair.id,
    name: n?.name ?? "?",
    obligations: open
      .filter((o) => o.available > 0)
      .map((o) => ({
        id: o.id,
        title: o.title,
        currency: o.currency,
        available: o.available,
        remaining: o.amount - o.paid,
        dueOn: o.dueOn,
        occurredOn: o.occurredOn,
        createdAt: o.createdAt,
        direction: o.creditorId === actor.partyId ? "THEY_OWE" : "I_OWE",
        groupId: o.groupId,
        groupName: o.groupId ? (gname.get(o.groupId) ?? null) : null,
      })),
    recent: recent.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      currency: r.currency,
      paidOn: r.paid_on,
      status: r.status,
      direction: r.payer_id === partyId ? "in" : "out",
      byMe: r.created_by === actor.userId,
    })),
  };
}

export type SettlementDetail = {
  id: string;
  kind: "PAYMENT" | "FORGIVE" | "OFFSET";
  method: string | null;
  amount: number;
  currency: Currency;
  counterCurrency: Currency | null;
  counterAmount: number | null;
  rate: string | null;
  paidOn: string;
  note: string | null;
  status: string;
  iAmPayer: boolean;
  iCreated: boolean;
  counterpart: { partyId: string; name: string };
  allocations: Array<{
    obligationId: string;
    title: string;
    amount: number;
    currency: Currency;
    direction: "THEY_OWE" | "I_OWE";
  }>;
  pending: {
    requestId: string;
    kind: string;
    approverIsMe: boolean;
    requestedByMe: boolean;
    requesterName: string;
    approverName: string | null;
  } | null;
  createdVia: string;
  createdAt: string;

  excess: { obligationId: string; amount: number; currency: Currency; status: string } | null;
  disputable: DisputableItem[];
};

export type SettlementCore = Omit<SettlementDetail, "allocations" | "pending" | "excess" | "disputable">;

const aliasName = (userId: string, col: string) =>
  sql.raw(
    `coalesce((select pa.name from party_alias pa where pa.owner_user_id = '${userId}' and pa.party_id = ${col}), (select p.display_name from party p where p.id = ${col}))`,
  );

export function settlementCore(actor: Actor, id: string): Promise<SettlementCore | null> {
  return settlementCoreCached(actor.userId, actor.partyId, id);
}

const settlementCoreCached = cache(async (userId: string, me: string, id: string): Promise<SettlementCore | null> => {
  const nm = (col: string) => aliasName(userId, col);
  const [s] = await db.execute<{
    id: string;
    kind: SettlementDetail["kind"];
    method: string | null;
    amount: string;
    currency: Currency;
    counter_currency: Currency | null;
    counter_amount: string | null;
    rate: string | null;
    paid_on: string;
    note: string | null;
    status: string;
    payer_id: string;
    payee_id: string;
    created_by: string | null;
    created_via: string;
    created_at: Date | string;
    pname: string;
    qname: string;
  }>(sql`select s.*, ${nm("s.payer_id")} as pname, ${nm("s.payee_id")} as qname from settlement s where s.id = ${id}`);
  if (!s || (s.payer_id !== me && s.payee_id !== me)) return null;
  const iAmPayer = s.payer_id === me;
  return {
    id: s.id,
    kind: s.kind,
    method: s.method,
    amount: Number(s.amount),
    currency: s.currency,
    counterCurrency: s.counter_currency,
    counterAmount: s.counter_amount === null ? null : Number(s.counter_amount),
    rate: s.rate,
    paidOn: s.paid_on,
    note: s.note,
    status: s.status,
    iAmPayer,
    iCreated: s.created_by === userId,
    counterpart: { partyId: iAmPayer ? s.payee_id : s.payer_id, name: iAmPayer ? s.qname : s.pname },
    createdVia: s.created_via,
    createdAt: iso(s.created_at),
  };
});

export const settlementAllocations = cache(
  async (actor: Actor, id: string): Promise<SettlementDetail["allocations"]> => {
    if (!(await settlementCore(actor, id))) return [];
    const rows = await db.execute<{
      obligation_id: string;
      title: string;
      amount: string;
      currency: Currency;
      creditor_id: string;
    }>(sql`
      select sa.obligation_id, o.title, sa.amount, o.currency, o.creditor_id
      from settlement_allocation sa join obligation o on o.id = sa.obligation_id where sa.settlement_id = ${id}`);
    return rows.map((a) => ({
      obligationId: a.obligation_id,
      title: a.title,
      amount: Number(a.amount),
      currency: a.currency,
      direction: a.creditor_id === actor.partyId ? "THEY_OWE" : "I_OWE",
    }));
  },
);

export const settlementExcess = cache(async (actor: Actor, id: string): Promise<SettlementDetail["excess"]> => {
  if (!(await settlementCore(actor, id))) return null;
  const [ex] = await db.execute<{ id: string; amount: string; currency: Currency; status: string }>(sql`
    select id, amount, currency, status from obligation where source_settlement_id = ${id} limit 1`);
  return ex ? { obligationId: ex.id, amount: Number(ex.amount), currency: ex.currency, status: ex.status } : null;
});

export const settlementPending = cache(async (actor: Actor, id: string): Promise<SettlementDetail["pending"]> => {
  if (!(await settlementCore(actor, id))) return null;
  const me = actor.partyId;
  const nm = (col: string) => aliasName(actor.userId, col);
  const [p] = await db.execute<{
    id: string;
    kind: string;
    requested_by_party: string | null;
    approver: string | null;
    rname: string;
    aname: string | null;
  }>(sql`
    select r.id, r.kind, r.requested_by_party,
      (select v.party_id from approval_vote v where v.request_id = r.id and v.decision = 'PENDING' limit 1) as approver,
      ${nm("r.requested_by_party")} as rname,
      (select ${nm("v.party_id")} from approval_vote v where v.request_id = r.id and v.decision = 'PENDING' limit 1) as aname
    from approval_request r where r.target_type = 'SETTLEMENT' and r.target_id = ${id} and r.status = 'PENDING'`);
  return p
    ? {
        requestId: p.id,
        kind: p.kind,
        approverIsMe: p.approver === me,
        requestedByMe: p.requested_by_party === me,
        requesterName: p.rname,
        approverName: p.aname,
      }
    : null;
});
