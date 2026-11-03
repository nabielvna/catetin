import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";

import type { DbOrTx } from "@/database/client";
import { db } from "@/database/client";
import { settlement, settlementAllocation } from "@/database/schema";
import { type InstallmentPlan, isInstallmentPlan, nextInstallment, scheduleOf } from "@/domain/installments";
import type { Minor } from "@/domain/money";
import type { Currency } from "@/domain/money";
import { type DisputableItem, listDisputable } from "@/services/approvals/disputes";
import type { Actor } from "@/services/context";
import { labelsFor } from "@/services/labels";
import type { PartyState } from "@/services/people/display";
import { iso } from "@/services/people/display";

export type ActivityItem = {
  id: number;
  type: string;
  actorName: string | null;
  isMe: boolean;
  data: Record<string, unknown>;
  via: string;
  createdAt: string;
};

export type ObligationDetail = {
  id: string;
  pairId: string;
  title: string;
  note: string | null;
  category: string | null;
  amount: number;
  paid: number;
  currency: Currency;
  occurredOn: string;
  dueOn: string | null;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "VOID";
  version: number;
  createdVia: string;
  iAmCreditor: boolean;
  iAmDebtor: boolean;
  iCreated: boolean;

  counterpart: { partyId: string; name: string; state: PartyState };
  creditorName: string;
  debtorName: string;
  group: { id: string; name: string } | null;
  bill: { id: string; title: string } | null;
  items: Array<{ name: string; qtyMilli: number; unitPrice: number; lineTotal: number }>;
  payments: Array<{
    id: string;
    kind: "PAYMENT" | "FORGIVE" | "OFFSET";
    method: string | null;
    amount: number;
    status: string;
    paidOn: string;
  }>;
  reserved: number;
  pending: {
    requestId: string;
    kind: string;
    approverIsMe: boolean;
    requestedByMe: boolean;
    requesterName: string;
    approverName: string | null;
    payload: Record<string, unknown>;
  } | null;
  activity: ActivityItem[];
  readOnly: boolean;

  installments: {
    plan: InstallmentPlan;
    schedule: Array<{ seq: number; dueOn: string; amount: number; paid: number; state: "PAID" | "PARTIAL" | "OPEN" }>;
    nextSeq: number | null;
  } | null;
  recurringId: string | null;

  sourceSettlementId: string | null;

  labels: string[];

  disputable: DisputableItem[];
};

export type ObligationCore = Omit<
  ObligationDetail,
  "items" | "payments" | "reserved" | "pending" | "activity" | "labels" | "disputable"
>;

export function obligationCore(actor: Actor, id: string): Promise<ObligationCore | null> {
  return coreCached(actor.userId, actor.partyId, id);
}

const aliasName = (userId: string, col: string) =>
  sql.raw(
    `coalesce((select pa.name from party_alias pa where pa.owner_user_id = '${userId}' and pa.party_id = ${col}), (select p.display_name from party p where p.id = ${col}))`,
  );

const coreCached = cache(async (userId: string, me: string, id: string): Promise<ObligationCore | null> => {
  const nm = (col: string) => aliasName(userId, col);
  const [o] = await db.execute<{
    id: string;
    pair_id: string;
    creditor_id: string;
    debtor_id: string;
    group_id: string | null;
    group_name: string | null;
    bill_id: string | null;
    bill_title: string | null;
    amount: string;
    paid: string;
    currency: Currency;
    title: string;
    note: string | null;
    category: string | null;
    occurred_on: string;
    due_on: string | null;
    status: ObligationDetail["status"];
    version: number;
    created_by: string | null;
    created_via: string;
    cname: string;
    dname: string;
    cstate: PartyState;
    dstate: PartyState;
    is_member: boolean;
    bill_creator: string | null;
  }>(sql`
    select o.*, g.name as group_name, b.title as bill_title, b.created_by as bill_creator,
      ${nm("o.creditor_id")} as cname, ${nm("o.debtor_id")} as dname,
      (select case when p.kind = 'MANUAL' then 'MANUAL' when p.user_id is null then 'DELETED' else 'USER' end from party p where p.id = o.creditor_id) as cstate,
      (select case when p.kind = 'MANUAL' then 'MANUAL' when p.user_id is null then 'DELETED' else 'USER' end from party p where p.id = o.debtor_id) as dstate,
      exists(select 1 from group_member m where m.group_id = o.group_id and m.party_id = ${me} and m.status = 'ACTIVE') as is_member
    from obligation o
    left join groups g on g.id = o.group_id
    left join bill b on b.id = o.bill_id
    where o.id = ${id}`);
  if (!o) return null;
  const iAmCreditor = o.creditor_id === me;
  const iAmDebtor = o.debtor_id === me;
  const iCreated = o.created_by === userId;
  const visible = iAmCreditor || iAmDebtor || o.is_member || iCreated || o.bill_creator === userId;
  if (!visible) return null;

  const counterpartId = iAmCreditor ? o.debtor_id : o.creditor_id;
  const raw = o as unknown as {
    installments: unknown;
    recurring_id: string | null;
    source_settlement_id: string | null;
  };
  const plan = isInstallmentPlan(raw.installments) ? raw.installments : null;
  let installments: ObligationDetail["installments"] = null;
  if (plan) {
    const paid = Number(o.paid);
    let before = 0;
    const schedule = scheduleOf(Number(o.amount), plan).map((it) => {
      const covered = Math.max(0, Math.min(it.amount, paid - before));
      before += it.amount;
      return {
        ...it,
        paid: covered,
        state: (covered === it.amount ? "PAID" : covered > 0 ? "PARTIAL" : "OPEN") as "PAID" | "PARTIAL" | "OPEN",
      };
    });
    installments = { plan, schedule, nextSeq: nextInstallment(Number(o.amount), plan, paid)?.seq ?? null };
  }
  return {
    id: o.id,
    pairId: o.pair_id,
    title: o.title,
    note: o.note,
    category: o.category,
    amount: Number(o.amount),
    paid: Number(o.paid),
    currency: o.currency,
    occurredOn: o.occurred_on,
    dueOn: o.due_on,
    status: o.status,
    version: o.version,
    createdVia: o.created_via,
    iAmCreditor,
    iAmDebtor,
    iCreated,
    counterpart: {
      partyId: counterpartId,
      name: iAmCreditor ? o.dname : o.cname,
      state: iAmCreditor ? o.dstate : o.cstate,
    },
    creditorName: o.cname,
    debtorName: o.dname,
    group: o.group_id ? { id: o.group_id, name: o.group_name ?? "" } : null,
    bill: o.bill_id ? { id: o.bill_id, title: o.bill_title ?? "" } : null,
    readOnly: !(iAmCreditor || iAmDebtor),
    installments,
    recurringId: raw.recurring_id,
    sourceSettlementId: raw.source_settlement_id,
  };
});

export const obligationItems = cache(async (actor: Actor, id: string): Promise<ObligationDetail["items"]> => {
  if (!(await obligationCore(actor, id))) return [];
  const rows = await db.execute<{ name: string; qty_milli: number; unit_price: string; line_total: string }>(sql`
    select name, qty_milli, unit_price, line_total from obligation_item where obligation_id = ${id} order by position`);
  return rows.map((i) => ({
    name: i.name,
    qtyMilli: i.qty_milli,
    unitPrice: Number(i.unit_price),
    lineTotal: Number(i.line_total),
  }));
});

export const obligationPayments = cache(async (actor: Actor, id: string): Promise<ObligationDetail["payments"]> => {
  if (!(await obligationCore(actor, id))) return [];
  const rows = await db.execute<{
    id: string;
    kind: "PAYMENT" | "FORGIVE" | "OFFSET";
    method: string | null;
    amount: string;
    status: string;
    paid_on: string;
  }>(sql`
    select s.id, s.kind, s.method, sa.amount, s.status, s.paid_on
    from settlement_allocation sa join settlement s on s.id = sa.settlement_id
    where sa.obligation_id = ${id}
    order by s.paid_on desc, s.created_at desc`);
  return rows.map((x) => ({
    id: x.id,
    kind: x.kind,
    method: x.method,
    amount: Number(x.amount),
    status: x.status,
    paidOn: x.paid_on,
  }));
});

export const obligationReserved = cache(async (actor: Actor, id: string): Promise<number> => {
  if (!(await obligationCore(actor, id))) return 0;
  const [r] = await db.execute<{ n: string }>(sql`
    select coalesce(sum(sa.amount), 0) as n from settlement_allocation sa join settlement s on s.id = sa.settlement_id
    where sa.obligation_id = ${id} and s.status = 'PENDING'`);
  return Number(r?.n ?? 0);
});

export const obligationPending = cache(async (actor: Actor, id: string): Promise<ObligationDetail["pending"]> => {
  if (!(await obligationCore(actor, id))) return null;
  const me = actor.partyId;
  const nm = (col: string) => aliasName(actor.userId, col);
  const [p] = await db.execute<{
    id: string;
    kind: string;
    payload: Record<string, unknown>;
    requested_by_party: string | null;
    approver: string | null;
    rname: string;
    aname: string | null;
  }>(sql`
    select r.id, r.kind, r.payload, r.requested_by_party,
      (select v.party_id from approval_vote v where v.request_id = r.id and v.decision = 'PENDING' limit 1) as approver,
      ${nm("r.requested_by_party")} as rname,
      (select ${nm("v.party_id")} from approval_vote v where v.request_id = r.id and v.decision = 'PENDING' limit 1) as aname
    from approval_request r
    where r.target_type = 'OBLIGATION' and r.target_id = ${id} and r.status = 'PENDING'`);
  return p
    ? {
        requestId: p.id,
        kind: p.kind,
        approverIsMe: p.approver === me,
        requestedByMe: p.requested_by_party === me,
        requesterName: p.rname,
        approverName: p.aname,
        payload: p.payload,
      }
    : null;
});

export async function obligationActivity(actor: Actor, id: string): Promise<ActivityItem[]> {
  if (!(await obligationCore(actor, id))) return [];
  return activityFor(actor, "OBLIGATION", id);
}

export async function obligationLabels(actor: Actor, id: string): Promise<string[]> {
  return (await labelsFor(actor.userId, [id])).get(id) ?? [];
}

export async function getObligationDetail(actor: Actor, id: string): Promise<ObligationDetail | null> {
  const core = await obligationCore(actor, id);
  if (!core) return null;
  const [items, payments, reserved, pending, activity, labels, disputable] = await Promise.all([
    obligationItems(actor, id),
    obligationPayments(actor, id),
    obligationReserved(actor, id),
    obligationPending(actor, id),
    obligationActivity(actor, id),
    obligationLabels(actor, id),
    listDisputable(actor, new Date(), id),
  ]);
  return { ...core, items, payments, reserved, pending, activity, labels, disputable };
}

export async function activityFor(actor: Actor, targetType: string, targetId: string): Promise<ActivityItem[]> {
  const rows = await db.execute<{
    id: string;
    type: string;
    actor_party_id: string | null;
    name: string | null;
    data: Record<string, unknown>;
    via: string;
    created_at: Date;
  }>(sql`
    select a.id, a.type, a.actor_party_id, a.data, a.via, a.created_at,
      coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = a.actor_party_id),
        (select p.display_name from party p where p.id = a.actor_party_id)) as name
    from activity a
    where a.target_type = ${targetType} and a.target_id = ${targetId}
    order by a.id desc
    limit 50`);
  return rows.map((r) => ({
    id: Number(r.id),
    type: r.type,
    actorName: r.name,
    isMe: r.actor_party_id === actor.partyId,
    data: r.data,
    via: r.via,
    createdAt: iso(r.created_at),
  }));
}

export async function reservedAmount(tx: DbOrTx, obligationId: string): Promise<Minor> {
  const [row] = await tx
    .select({ n: sql<string>`coalesce(sum(${settlementAllocation.amount}), 0)` })
    .from(settlementAllocation)
    .innerJoin(settlement, eq(settlement.id, settlementAllocation.settlementId))
    .where(and(eq(settlementAllocation.obligationId, obligationId), eq(settlement.status, "PENDING")));
  return Number(row?.n ?? 0);
}
