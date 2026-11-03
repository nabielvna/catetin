import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";
import type { Currency } from "@/domain/money";
import type { Actor } from "@/services/context";

export type SearchResult = {
  people: Array<{ partyId: string; name: string }>;
  groups: Array<{ id: string; name: string }>;
  debts: Array<{
    id: string;
    title: string;
    amount: number;
    currency: Currency;
    direction: "THEY_OWE" | "I_OWE";
    counterpart: string;
    occurredOn: string;
    status: string;
  }>;
};

async function debtsWithLabel(actor: Actor, label: string): Promise<SearchResult["debts"]> {
  const me = actor.partyId;
  const rows = await db.execute<{
    id: string;
    title: string;
    amount: string;
    currency: Currency;
    creditor_id: string;
    counterpart: string;
    occurred_on: string;
    status: string;
  }>(sql`
    select o.id, o.title, o.amount, o.currency, o.creditor_id, o.occurred_on, o.status,
      case when o.creditor_id <> ${me} and o.debtor_id <> ${me} then
        (select display_name from party where id = o.debtor_id) || ' → ' || (select display_name from party where id = o.creditor_id)
      else coalesce((select name from party_alias where owner_user_id = ${actor.userId} and party_id = case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end),
        (select display_name from party where id = case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end)) end as counterpart
    from obligation o
    join obligation_label ol on ol.obligation_id = o.id
    join label l on l.id = ol.label_id and l.owner_user_id = ${actor.userId} and lower(l.name) = lower(${label})
    where o.creditor_id = ${me} or o.debtor_id = ${me}
      or exists (select 1 from group_member gm where gm.group_id = o.group_id and gm.party_id = ${me} and gm.status = 'ACTIVE')
    order by o.occurred_on desc limit 100`);
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    amount: Number(d.amount),
    currency: d.currency,
    direction: d.creditor_id === me ? "THEY_OWE" : "I_OWE",
    counterpart: d.counterpart,
    occurredOn: d.occurred_on,
    status: d.status,
  }));
}

export async function search(actor: Actor, raw: string, label?: string | null): Promise<SearchResult> {
  const tag = label?.trim() || (raw.trim().startsWith("#") ? raw.trim().slice(1) : "");
  if (tag) return { people: [], groups: [], debts: await debtsWithLabel(actor, tag.slice(0, 30)) };
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return { people: [], groups: [], debts: [] };
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const me = actor.partyId;
  const [people, groups, debts] = await Promise.all([
    db.execute<{ party_id: string; name: string }>(sql`
      with mine as (
        select case when p.party_low = ${me} then p.party_high else p.party_low end as party_id
        from pair p where (p.party_low = ${me} or p.party_high = ${me}) and p.merged_into is null
      )
      select m.party_id, coalesce(pa.name, pt.display_name) as name
      from mine m join party pt on pt.id = m.party_id and pt.deleted_at is null
      left join party_alias pa on pa.owner_user_id = ${actor.userId} and pa.party_id = m.party_id
      where coalesce(pa.name, pt.display_name) ilike ${like} or similarity(coalesce(pa.name, pt.display_name), ${q}) > 0.3
      order by similarity(coalesce(pa.name, pt.display_name), ${q}) desc
      limit 20`),
    db.execute<{ id: string; name: string }>(sql`
      select g.id, g.name from groups g join group_member m on m.group_id = g.id and m.party_id = ${me} and m.status = 'ACTIVE'
      where g.name ilike ${like} or similarity(g.name, ${q}) > 0.3
      order by similarity(g.name, ${q}) desc limit 20`),
    db.execute<{
      id: string;
      title: string;
      amount: string;
      currency: Currency;
      creditor_id: string;
      counterpart: string;
      occurred_on: string;
      status: string;
    }>(sql`
      select o.id, o.title, o.amount, o.currency, o.creditor_id, o.occurred_on, o.status,
        coalesce((select name from party_alias where owner_user_id = ${actor.userId} and party_id = case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end),
          (select display_name from party where id = case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end)) as counterpart
      from obligation o
      where (o.creditor_id = ${me} or o.debtor_id = ${me})
        and (o.title ilike ${like} or coalesce(o.note, '') ilike ${like} or similarity(o.title, ${q}) > 0.3)
      order by o.occurred_on desc limit 20`),
  ]);
  return {
    people: people.map((p) => ({ partyId: p.party_id, name: p.name })),
    groups: groups.map((g) => ({ id: g.id, name: g.name })),
    debts: debts.map((d) => ({
      id: d.id,
      title: d.title,
      amount: Number(d.amount),
      currency: d.currency,
      direction: d.creditor_id === me ? "THEY_OWE" : "I_OWE",
      counterpart: d.counterpart,
      occurredOn: d.occurred_on,
      status: d.status,
    })),
  };
}
