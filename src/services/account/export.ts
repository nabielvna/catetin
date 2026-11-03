import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";
import type { Actor } from "@/services/context";

export async function exportMyData(actor: Actor) {
  const me = actor.partyId;
  const q = async (s: ReturnType<typeof sql>) => [...(await db.execute(s))];
  return {
    exportedAt: new Date().toISOString(),
    profile: await q(
      sql`select u.name, u.email, u.created_at, p.currency, u.locale, p.timezone from "user" u join profile p on p.user_id = u.id where u.id = ${actor.userId}`,
    ),
    people: await q(sql`
      select coalesce((select name from party_alias where owner_user_id = ${actor.userId} and party_id = pt.id), pt.display_name) as name,
        pt.kind, pt.email
      from pair p join party pt on pt.id = case when p.party_low = ${me} then p.party_high else p.party_low end
      where (p.party_low = ${me} or p.party_high = ${me}) and p.merged_into is null`),
    obligations: await q(sql`
      select o.id, o.title, o.note, o.category, o.amount, o.paid, o.currency, o.occurred_on, o.due_on, o.status,
        case when o.creditor_id = ${me} then 'THEY_OWE' else 'I_OWE' end as direction,
        (select display_name from party where id = case when o.creditor_id = ${me} then o.debtor_id else o.creditor_id end) as counterpart,
        o.created_at
      from obligation o where o.creditor_id = ${me} or o.debtor_id = ${me} order by o.occurred_on`),
    settlements: await q(sql`
      select s.id, s.kind, s.method, s.amount, s.currency, s.counter_currency, s.counter_amount, s.rate, s.paid_on, s.status, s.note,
        case when s.payer_id = ${me} then 'OUT' else 'IN' end as direction, s.created_at
      from settlement s where s.payer_id = ${me} or s.payee_id = ${me} order by s.paid_on`),
    groups: await q(sql`
      select g.name, g.mode, m.role, m.status, m.joined_at from group_member m join groups g on g.id = m.group_id where m.party_id = ${me}`),
    bills: await q(sql`
      select b.title, b.occurred_on, b.total, b.currency, bs.total as my_share from bill_share bs join bill b on b.id = bs.bill_id where bs.party_id = ${me}`),
    activity: await q(sql`select type, data, created_at from activity where actor_party_id = ${me} order by id`),
  };
}
