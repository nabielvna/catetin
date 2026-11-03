import "server-only";

import { sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/client";
import type { Currency, MoneyByCurrency } from "@/domain/money";
import type { Actor } from "@/services/context";
import type { PartyState } from "@/services/people/display";
import { iso } from "@/services/people/display";

export type GroupListItem = {
  id: string;
  name: string;
  mode: "CONFIRM" | "TRUST";
  currency: Currency;
  myStatus: "ACTIVE" | "INVITED" | "PENDING";
  memberCount: number;

  net: MoneyByCurrency;
  openCount: number;

  recent: boolean;
  lastActivityAt: string;
  archived: boolean;
  invitedBy: string | null;
};

export async function listMyGroups(actor: Actor): Promise<GroupListItem[]> {
  const me = actor.partyId;
  const rows = await db.execute<{
    id: string;
    name: string;
    mode: "CONFIRM" | "TRUST";
    currency: Currency;
    status: "ACTIVE" | "INVITED" | "PENDING";
    members: number;
    balances: Array<{ c: Currency; n: string; k: number }> | null;
    last: Date;
    recent: boolean;
    archived_at: Date | null;
    invited_by_name: string | null;
  }>(sql`
    select g.id, g.name, g.mode, g.currency, m.status, g.last_activity_at as last, g.archived_at,
      (g.last_activity_at > now() - interval '30 days') as recent,
      (select count(*)::int from group_member x where x.group_id = g.id and x.status = 'ACTIVE') as members,
      (select json_agg(json_build_object('c', b.currency, 'n', b.net, 'k', b.k)) from (
        select o.currency, count(*)::int as k,
          sum(case when o.creditor_id = ${me} then o.amount - o.paid else -(o.amount - o.paid) end) as net
        from obligation o
        where o.group_id = g.id and o.status = 'ACTIVE' and o.paid < o.amount
          and (o.creditor_id = ${me} or o.debtor_id = ${me})
        group by o.currency) b) as balances,
      (select p.display_name from party p where p.user_id = m.invited_by) as invited_by_name
    from group_member m
    join groups g on g.id = m.group_id
    where m.party_id = ${me} and m.status in ('ACTIVE', 'INVITED', 'PENDING')
    order by g.last_activity_at desc`);
  return rows.map((r) => {
    const net: MoneyByCurrency = {};
    let openCount = 0;
    for (const b of r.balances ?? []) {
      if (Number(b.n) !== 0) net[b.c] = Number(b.n);
      openCount += b.k;
    }
    return {
      id: r.id,
      name: r.name,
      mode: r.mode,
      currency: r.currency,
      myStatus: r.status,
      memberCount: r.members,
      net,
      openCount,
      recent: r.recent,
      lastActivityAt: iso(r.last),
      archived: r.archived_at !== null,
      invitedBy: r.invited_by_name,
    };
  });
}

export type GroupMemberItem = {
  partyId: string;
  name: string;
  state: PartyState;
  role: "ADMIN" | "MEMBER";
  status: "ACTIVE" | "INVITED" | "PENDING";
  isMe: boolean;

  net: MoneyByCurrency;
};

export type GroupDetail = {
  id: string;
  name: string;
  mode: "CONFIRM" | "TRUST";
  currency: Currency;
  archived: boolean;
  myRole: "ADMIN" | "MEMBER";
  members: GroupMemberItem[];

  guests: Array<{ partyId: string; name: string }>;
  pendingModeChange: { mode: string; requestId: string } | null;
};

type GroupRow = {
  id: string;
  name: string;
  mode: "CONFIRM" | "TRUST";
  currency: Currency;
  archived_at: Date | null;
  my_role: "ADMIN" | "MEMBER" | null;
  my_status: string | null;
};

const groupRow = cache(async (me: string, groupId: string): Promise<GroupRow | null> => {
  const [g] = await db.execute<GroupRow>(sql`
    select g.*, m.role as my_role, m.status as my_status
    from groups g left join group_member m on m.group_id = g.id and m.party_id = ${me}
    where g.id = ${groupId}`);
  return g && g.my_status === "ACTIVE" ? g : null;
});

export async function canSeeGroup(actor: Actor, groupId: string): Promise<boolean> {
  return (await groupRow(actor.partyId, groupId)) !== null;
}

export const getGroupDetail = cache(async (actor: Actor, groupId: string): Promise<GroupDetail | null> => {
  const me = actor.partyId;
  const g = await groupRow(me, groupId);
  if (!g) return null;

  const [members, guests, [modeReq]] = await Promise.all([
    db.execute<{
      party_id: string;
      name: string;
      state: PartyState;
      role: "ADMIN" | "MEMBER";
      status: "ACTIVE" | "INVITED" | "PENDING";
      balances: Array<{ c: Currency; n: string }> | null;
    }>(sql`
    select m.party_id, m.role, m.status,
      coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = m.party_id), p.display_name) as name,
      case when p.kind = 'MANUAL' then 'MANUAL' when p.user_id is null then 'DELETED' else 'USER' end as state,
      (select json_agg(json_build_object('c', b.currency, 'n', b.net)) from (
        select o.currency, sum(case when o.creditor_id = m.party_id then o.amount - o.paid else -(o.amount - o.paid) end) as net
        from obligation o
        where o.group_id = m.group_id and o.status = 'ACTIVE' and o.paid < o.amount
          and (o.creditor_id = m.party_id or o.debtor_id = m.party_id)
        group by o.currency) b) as balances
    from group_member m join party p on p.id = m.party_id
    where m.group_id = ${groupId} and m.status in ('ACTIVE', 'INVITED', 'PENDING')
    order by (m.party_id = ${me}) desc, m.role, name`),
    db.execute<{ party_id: string; name: string }>(sql`
    select distinct bs.party_id,
      coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = bs.party_id), p.display_name) as name
    from bill b join bill_share bs on bs.bill_id = b.id join party p on p.id = bs.party_id
    where b.group_id = ${groupId}
      and not exists (select 1 from group_member m where m.group_id = b.group_id and m.party_id = bs.party_id and m.status = 'ACTIVE')`),
    db.execute<{ id: string; mode: string }>(sql`
    select r.id, r.payload->>'mode' as mode from approval_request r
    where r.group_id = ${groupId} and r.kind = 'GROUP_MODE' and r.status = 'PENDING' limit 1`),
  ]);

  return {
    id: g.id,
    name: g.name,
    mode: g.mode,
    currency: g.currency,
    archived: g.archived_at !== null,
    myRole: g.my_role ?? "MEMBER",
    members: members.map((m) => {
      const net: MoneyByCurrency = {};
      for (const b of m.balances ?? []) if (Number(b.n) !== 0) net[b.c] = Number(b.n);
      return {
        partyId: m.party_id,
        name: m.name,
        state: m.state,
        role: m.role,
        status: m.status,
        isMe: m.party_id === me,
        net,
      };
    }),
    guests: guests.map((x) => ({ partyId: x.party_id, name: x.name })),
    pendingModeChange: modeReq ? { mode: modeReq.mode, requestId: modeReq.id } : null,
  };
});

export type GroupEntry = {
  kind: "OBLIGATION" | "BILL" | "SETTLEMENT";
  id: string;
  date: string;
  title: string;
  amount: number;
  currency: Currency;
  creditorName: string;
  debtorName: string | null;

  myShare: number;
  status: string;
  createdAt: string;
};

export async function groupEntries(actor: Actor, groupId: string): Promise<GroupEntry[]> {
  const me = actor.partyId;
  if (!(await canSeeGroup(actor, groupId))) return [];
  const name = (col: string) =>
    sql.raw(
      `coalesce((select pa.name from party_alias pa where pa.owner_user_id = '${actor.userId}' and pa.party_id = ${col}), (select p.display_name from party p where p.id = ${col}))`,
    );
  const [bills, obs, sts] = await Promise.all([
    db.execute<{
      id: string;
      title: string;
      occurred_on: string;
      total: string;
      currency: Currency;
      payer: string;
      payer_name: string;
      my_total: string | null;
      status: string;
      created_at: Date;
    }>(sql`
    select b.id, b.title, b.occurred_on, b.total, b.currency, b.payer_party_id as payer, ${name("b.payer_party_id")} as payer_name,
      (select bs.total from bill_share bs where bs.bill_id = b.id and bs.party_id = ${me}) as my_total, b.status, b.created_at
    from bill b where b.group_id = ${groupId}`),
    db.execute<{
      id: string;
      title: string;
      occurred_on: string;
      amount: string;
      currency: Currency;
      creditor_id: string;
      debtor_id: string;
      cname: string;
      dname: string;
      status: string;
      created_at: Date;
    }>(sql`
    select o.id, o.title, o.occurred_on, o.amount, o.currency, o.creditor_id, o.debtor_id,
      ${name("o.creditor_id")} as cname, ${name("o.debtor_id")} as dname, o.status, o.created_at
    from obligation o where o.group_id = ${groupId} and o.bill_id is null and o.status in ('ACTIVE', 'PENDING')`),
    db.execute<{
      id: string;
      kind: string;
      paid_on: string;
      amount: string;
      currency: Currency;
      payer_id: string;
      payee_id: string;
      pname: string;
      qname: string;
      status: string;
      created_at: Date;
    }>(sql`
    select s.id, s.kind, s.paid_on, s.amount, s.currency, s.payer_id, s.payee_id,
      ${name("s.payer_id")} as pname, ${name("s.payee_id")} as qname, s.status, s.created_at
    from settlement s where s.group_id = ${groupId} and s.status in ('ACTIVE', 'PENDING')`),
  ]);

  const out: GroupEntry[] = [
    ...bills.map((b) => ({
      kind: "BILL" as const,
      id: b.id,
      date: b.occurred_on,
      title: b.title,
      amount: Number(b.total),
      currency: b.currency,
      creditorName: b.payer_name,
      debtorName: null,
      myShare: b.payer === me ? Number(b.total) - Number(b.my_total ?? 0) : -Number(b.my_total ?? 0),
      status: b.status,
      createdAt: iso(b.created_at),
    })),
    ...obs.map((o) => ({
      kind: "OBLIGATION" as const,
      id: o.id,
      date: o.occurred_on,
      title: o.title,
      amount: Number(o.amount),
      currency: o.currency,
      creditorName: o.cname,
      debtorName: o.dname,
      myShare: o.creditor_id === me ? Number(o.amount) : o.debtor_id === me ? -Number(o.amount) : 0,
      status: o.status,
      createdAt: iso(o.created_at),
    })),
    ...sts.map((s) => ({
      kind: "SETTLEMENT" as const,
      id: s.id,
      date: s.paid_on,
      title: s.kind,
      amount: Number(s.amount),
      currency: s.currency,
      creditorName: s.qname,
      debtorName: s.pname,
      myShare: 0,
      status: s.status,
      createdAt: iso(s.created_at),
    })),
  ];
  return out.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}
