import "server-only";

import { sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/client";
import { isInstallmentPlan, nextInstallment } from "@/domain/installments";
import type { Currency, MoneyByCurrency } from "@/domain/money";
import type { Actor } from "@/services/context";
import { listRecurringForPair, type RecurringItem } from "@/services/debts/recurring";
import { labelsForPair } from "@/services/labels";
import { offsetPreview } from "@/services/payments/offsets";
import type { PartyState } from "@/services/people/display";
import { iso } from "@/services/people/display";
import { contactUsage } from "@/services/people/mutations";
import type { PairRow } from "@/services/people/parties";
import { type TrustState, trustStateOf } from "@/services/people/trust";

export type PersonListItem = {
  partyId: string;
  pairId: string;
  name: string;
  state: PartyState;

  net: MoneyByCurrency;
  pendingCount: number;
  lastActivityAt: string;
};

export async function listArchivedPeople(actor: Actor): Promise<Array<{ partyId: string; name: string }>> {
  const rows = await db.execute<{ id: string; name: string }>(sql`
    select pt.id, pt.display_name as name from party pt
    where pt.owner_user_id = ${actor.userId} and pt.kind = 'MANUAL' and pt.archived_at is not null
      and pt.deleted_at is null and pt.merged_into is null
    order by pt.archived_at desc`);
  return rows.map((r) => ({ partyId: r.id, name: r.name }));
}

export async function listPeople(actor: Actor): Promise<PersonListItem[]> {
  const me = actor.partyId;
  const rows = await db.execute<{
    pair_id: string;
    party_id: string;
    name: string;
    state: PartyState;
    last_activity_at: Date;
    balances: Array<{ c: Currency; n: string }> | null;
    pending: number;
  }>(sql`
    with mine as (
      select p.id as pair_id,
        case when p.party_low = ${me} then p.party_high else p.party_low end as party_id,
        p.last_activity_at
      from pair p
      where (p.party_low = ${me} or p.party_high = ${me}) and p.merged_into is null
    )
    select m.pair_id, m.party_id, m.last_activity_at,
      coalesce(
        (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = m.party_id),
        pt.display_name) as name,
      case when pt.kind = 'MANUAL' then 'MANUAL' when pt.user_id is null then 'DELETED' else 'USER' end as state,
      (select json_agg(json_build_object('c', b.currency, 'n', b.net)) from (
        select o.currency, sum(case when o.creditor_id = ${me} then o.amount - o.paid else -(o.amount - o.paid) end) as net
        from obligation o
        where o.pair_id = m.pair_id and o.status = 'ACTIVE' and o.paid < o.amount
        group by o.currency) b) as balances,
      (select count(*)::int from approval_request r
        where r.pair_id = m.pair_id and r.status = 'PENDING') as pending
    from mine m
    join party pt on pt.id = m.party_id and pt.archived_at is null and pt.deleted_at is null
    order by m.last_activity_at desc`);
  return rows.map((r) => {
    const net: MoneyByCurrency = {};
    for (const b of r.balances ?? []) if (Number(b.n) !== 0) net[b.c] = Number(b.n);
    return {
      partyId: r.party_id,
      pairId: r.pair_id,
      name: r.name,
      state: r.state,
      net,
      pendingCount: r.pending,
      lastActivityAt: iso(r.last_activity_at),
    };
  });
}

export type PersonHeader = {
  partyId: string;
  pairId: string | null;
  name: string;
  displayName: string;
  state: PartyState;
  email: string | null;
  isMyManualContact: boolean;
  sharedGroups: Array<{ id: string; name: string }>;
  net: MoneyByCurrency;
  owedToMe: MoneyByCurrency;
  iOwe: MoneyByCurrency;
  activeCount: number;
  waitingThem: number;
  waitingMe: number;

  trust: TrustState | null;

  blocked: boolean;
  archived: boolean;

  hasRecords: boolean;
  recurring: RecurringItem[];

  labels: string[];
};

export type PersonEntry = {
  kind: "OBLIGATION" | "SETTLEMENT";
  id: string;
  date: string;
  title: string;
  amount: number;
  remaining: number;
  currency: Currency;

  direction: "THEY_OWE" | "I_OWE" | "IN" | "OUT";
  status: string;
  settled: boolean;
  settlementKind: "PAYMENT" | "FORGIVE" | "OFFSET" | null;
  method: string | null;
  groupName: string | null;
  dueOn: string | null;
  category: string | null;
  pendingWith: "ME" | "THEM" | null;
  createdVia: string;
  createdAt: string;

  installment: { seq: number; count: number } | null;
  recurring: boolean;
  labels: string[];
};

export type PersonCore = Omit<
  PersonHeader,
  | "net"
  | "owedToMe"
  | "iOwe"
  | "activeCount"
  | "waitingThem"
  | "waitingMe"
  | "trust"
  | "hasRecords"
  | "recurring"
  | "labels"
>;

export type PersonLedger = Pick<
  PersonHeader,
  "net" | "owedToMe" | "iOwe" | "activeCount" | "waitingThem" | "waitingMe" | "labels"
> & { entries: PersonEntry[] };

export function personCore(actor: Actor, otherId: string): Promise<PersonCore | null> {
  return personCoreCached(actor.userId, actor.partyId, otherId);
}

const personCoreCached = cache(async (userId: string, me: string, otherId: string): Promise<PersonCore | null> => {
  if (otherId === me) return null;
  const [[p], groups] = await Promise.all([
    db.execute<{
      id: string;
      kind: string;
      user_id: string | null;
      display_name: string;
      email: string | null;
      owner_user_id: string | null;
      alias: string | null;
      pair_id: string | null;
      archived_at: Date | null;
      deleted_at: Date | null;
      blocked: boolean;
    }>(sql`
      select pt.id, pt.kind, pt.user_id, pt.display_name, pt.email, pt.owner_user_id,
        pt.archived_at, pt.deleted_at,
        exists(select 1 from user_block b where b.blocker_user_id = ${userId} and b.blocked_party_id = pt.id) as blocked,
        (select pa.name from party_alias pa where pa.owner_user_id = ${userId} and pa.party_id = pt.id) as alias,
        (select pr.id from pair pr where pr.merged_into is null
          and pr.party_low = least(${me}::uuid, pt.id) and pr.party_high = greatest(${me}::uuid, pt.id)) as pair_id
      from party pt where pt.id = ${otherId}`),
    db.execute<{ id: string; name: string }>(sql`
      select g.id, g.name from groups g
      join group_member a on a.group_id = g.id and a.party_id = ${me} and a.status = 'ACTIVE'
      join group_member b on b.group_id = g.id and b.party_id = ${otherId} and b.status in ('ACTIVE', 'PENDING')
      where g.archived_at is null
      order by g.last_activity_at desc`),
  ]);
  if (!p || p.deleted_at) return null;

  const allowed = p.pair_id !== null || p.owner_user_id === userId || groups.length > 0;
  if (!allowed) return null;

  return {
    partyId: p.id,
    pairId: p.pair_id,
    name: p.alias ?? p.display_name,
    displayName: p.display_name,
    state: p.kind === "MANUAL" ? "MANUAL" : p.user_id === null ? "DELETED" : "USER",
    email: p.owner_user_id === userId ? p.email : null,
    isMyManualContact: p.kind === "MANUAL" && p.owner_user_id === userId,
    sharedGroups: groups.map((g) => ({ id: g.id, name: g.name })),
    blocked: p.blocked,
    archived: p.archived_at !== null,
  };
});

export const personTrust = cache(async (actor: Actor, otherId: string): Promise<TrustState | null> => {
  const c = await personCore(actor, otherId);
  if (!c?.pairId || c.state !== "USER") return null;
  const [pairRow] = await db.execute<{
    party_low: string;
    party_high: string;
    trust_low_at: Date | null;
    trust_high_at: Date | null;
  }>(sql`select party_low, party_high, trust_low_at, trust_high_at from pair where id = ${c.pairId}`);
  if (!pairRow) return null;
  return trustStateOf(
    {
      partyLow: pairRow.party_low,
      partyHigh: pairRow.party_high,
      trustLowAt: pairRow.trust_low_at ? new Date(pairRow.trust_low_at) : null,
      trustHighAt: pairRow.trust_high_at ? new Date(pairRow.trust_high_at) : null,
    } as PairRow,
    actor.partyId,
  );
});

export const personRecurring = cache(async (actor: Actor, otherId: string): Promise<RecurringItem[]> => {
  const c = await personCore(actor, otherId);
  if (!c?.pairId) return [];
  return listRecurringForPair(db, c.pairId, actor.partyId, actor.userId);
});

export const personHasRecords = cache(async (actor: Actor, otherId: string): Promise<boolean> => {
  const c = await personCore(actor, otherId);
  if (!c?.isMyManualContact) return false;
  const use = await contactUsage(db, otherId);
  return use.records > 0 || use.groups > 0 || use.recurring > 0;
});

const emptyLedger = (): PersonLedger => ({
  net: {},
  owedToMe: {},
  iOwe: {},
  activeCount: 0,
  waitingThem: 0,
  waitingMe: 0,
  labels: [],
  entries: [],
});

export const personLedger = cache(async (actor: Actor, otherId: string): Promise<PersonLedger> => {
  const me = actor.partyId;
  const c = await personCore(actor, otherId);
  const out = emptyLedger();
  if (!c?.pairId) return out;

  const [obligations, settlements, labelMap] = await Promise.all([
    db.execute<{
      id: string;
      creditor_id: string;
      amount: string;
      paid: string;
      currency: Currency;
      title: string;
      occurred_on: string;
      due_on: string | null;
      status: string;
      category: string | null;
      group_name: string | null;
      created_via: string;
      created_at: Date;
      pending_with: string | null;
      installments: unknown;
      recurring_id: string | null;
    }>(sql`
      select o.id, o.creditor_id, o.amount, o.paid, o.currency, o.title, o.occurred_on, o.due_on, o.status,
        o.category, g.name as group_name, o.created_via, o.created_at, o.installments, o.recurring_id,
        (select v.party_id from approval_request r join approval_vote v on v.request_id = r.id and v.decision = 'PENDING'
          where r.target_type = 'OBLIGATION' and r.target_id = o.id and r.status = 'PENDING' limit 1) as pending_with
      from obligation o
      left join groups g on g.id = o.group_id
      where o.pair_id = ${c.pairId}
      order by o.occurred_on desc, o.created_at desc`),
    db.execute<{
      id: string;
      kind: "PAYMENT" | "FORGIVE" | "OFFSET";
      method: string | null;
      payer_id: string;
      amount: string;
      currency: Currency;
      paid_on: string;
      status: string;
      note: string | null;
      group_name: string | null;
      created_via: string;
      created_at: Date;
      pending_with: string | null;
    }>(sql`
      select s.id, s.kind, s.method, s.payer_id, s.amount, s.currency, s.paid_on, s.status, s.note,
        g.name as group_name, s.created_via, s.created_at,
        (select v.party_id from approval_request r join approval_vote v on v.request_id = r.id and v.decision = 'PENDING'
          where r.target_type = 'SETTLEMENT' and r.target_id = s.id and r.status = 'PENDING' limit 1) as pending_with
      from settlement s
      left join groups g on g.id = s.group_id
      where s.pair_id = ${c.pairId}
      order by s.paid_on desc, s.created_at desc`),
    labelsForPair(actor.userId, c.pairId),
  ]);

  out.labels = [...new Set([...labelMap.values()].flat())].sort((a, b) => a.localeCompare(b));
  const entries = out.entries;
  for (const o of obligations) {
    const amount = Number(o.amount);
    const paid = Number(o.paid);
    const theyOwe = o.creditor_id === me;
    const remaining = amount - paid;
    if (o.status === "ACTIVE" && remaining > 0) {
      out.activeCount++;
      out.net[o.currency] = (out.net[o.currency] ?? 0) + (theyOwe ? remaining : -remaining);
      if (theyOwe) out.owedToMe[o.currency] = (out.owedToMe[o.currency] ?? 0) + remaining;
      else out.iOwe[o.currency] = (out.iOwe[o.currency] ?? 0) + remaining;
    }
    const pendingWith = o.pending_with ? (o.pending_with === me ? "ME" : "THEM") : null;
    if (pendingWith === "ME") out.waitingMe++;
    if (pendingWith === "THEM") out.waitingThem++;
    entries.push({
      kind: "OBLIGATION",
      id: o.id,
      date: o.occurred_on,
      title: o.title,
      amount,
      remaining,
      currency: o.currency,
      direction: theyOwe ? "THEY_OWE" : "I_OWE",
      status: o.status,
      settled: o.status === "ACTIVE" && remaining === 0,
      settlementKind: null,
      method: null,
      groupName: o.group_name,
      dueOn: o.due_on,
      category: o.category,
      pendingWith,
      createdVia: o.created_via,
      createdAt: iso(o.created_at),
      installment: installmentInfo(amount, paid, o.installments),
      recurring: o.recurring_id !== null,
      labels: labelMap.get(o.id) ?? [],
    });
  }
  for (const s of settlements) {
    const pendingWith = s.pending_with ? (s.pending_with === me ? "ME" : "THEM") : null;
    if (pendingWith === "ME") out.waitingMe++;
    if (pendingWith === "THEM") out.waitingThem++;
    entries.push({
      kind: "SETTLEMENT",
      id: s.id,
      date: s.paid_on,
      title: s.note ?? "",
      amount: Number(s.amount),
      remaining: 0,
      currency: s.currency,
      direction: s.payer_id === me ? "OUT" : "IN",
      status: s.status,
      settled: false,
      settlementKind: s.kind,
      method: s.method,
      groupName: s.group_name,
      dueOn: null,
      category: null,
      pendingWith,
      createdVia: s.created_via,
      createdAt: iso(s.created_at),
      installment: null,
      recurring: false,
      labels: [],
    });
  }
  entries.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  return out;
});

export async function getPerson(
  actor: Actor,
  otherId: string,
): Promise<{ header: PersonHeader; entries: PersonEntry[] } | null> {
  const core = await personCore(actor, otherId);
  if (!core) return null;
  const [trust, recurring, hasRecords, ledger] = await Promise.all([
    personTrust(actor, otherId),
    personRecurring(actor, otherId),
    personHasRecords(actor, otherId),
    personLedger(actor, otherId),
  ]);
  const { entries, ...sums } = ledger;
  return { header: { ...core, ...sums, trust, recurring, hasRecords }, entries };
}

function installmentInfo(amount: number, paid: number, plan: unknown): PersonEntry["installment"] {
  if (!isInstallmentPlan(plan)) return null;
  const next = nextInstallment(amount, plan, paid);
  return { seq: next ? next.seq : plan.count, count: plan.count };
}

export type PickablePerson = { partyId: string; name: string; state: PartyState; groupIds: string[] };

export async function pickablePeople(actor: Actor): Promise<PickablePerson[]> {
  const me = actor.partyId;
  const rows = await db.execute<{
    party_id: string;
    name: string;
    state: PartyState;
    group_ids: string[] | null;
    last: Date | null;
  }>(sql`
    with cands as (
      select case when p.party_low = ${me} then p.party_high else p.party_low end as party_id, p.last_activity_at as last
      from pair p where (p.party_low = ${me} or p.party_high = ${me}) and p.merged_into is null
      union
      select b.party_id, g.last_activity_at
      from group_member a
      join group_member b on b.group_id = a.group_id and b.party_id <> ${me} and b.status = 'ACTIVE'
      join groups g on g.id = a.group_id and g.archived_at is null
      where a.party_id = ${me} and a.status = 'ACTIVE'
    )
    select c.party_id,
      coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = c.party_id), pt.display_name) as name,
      case when pt.kind = 'MANUAL' then 'MANUAL' when pt.user_id is null then 'DELETED' else 'USER' end as state,
      (select array_agg(gm.group_id) from group_member gm join group_member mine on mine.group_id = gm.group_id
        and mine.party_id = ${me} and mine.status = 'ACTIVE'
        where gm.party_id = c.party_id and gm.status = 'ACTIVE') as group_ids,
      max(c.last) as last
    from cands c join party pt on pt.id = c.party_id and pt.merged_into is null and pt.deleted_at is null
    group by c.party_id, pt.display_name, pt.kind, pt.user_id
    order by last desc nulls last`);
  return rows.map((r) => ({ partyId: r.party_id, name: r.name, state: r.state, groupIds: r.group_ids ?? [] }));
}

export async function mergeCandidates(
  actor: Actor,
  excludeId: string,
): Promise<Array<{ partyId: string; name: string; state: "USER" | "MANUAL" }>> {
  const me = actor.partyId;
  const rows = await db.execute<{ id: string; name: string; kind: string }>(sql`
    select pt.id, pt.kind,
      coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = pt.id), pt.display_name) as name
    from party pt
    where pt.id <> ${excludeId} and pt.id <> ${me} and pt.merged_into is null and pt.deleted_at is null
      and (
        (pt.kind = 'MANUAL' and pt.owner_user_id = ${actor.userId})
        or (pt.kind = 'USER' and pt.user_id is not null and exists (
          select 1 from pair p where p.merged_into is null
            and p.party_low = least(${me}::uuid, pt.id) and p.party_high = greatest(${me}::uuid, pt.id)))
      )
    order by name`);
  return rows.map((r) => ({ partyId: r.id, name: r.name, state: r.kind === "USER" ? "USER" : "MANUAL" }));
}

export async function personOffsets(actor: Actor, otherId: string) {
  const person = await personCore(actor, otherId);
  if (!person?.pairId) return [];
  return offsetPreview(db, person.pairId, actor.partyId, otherId);
}
