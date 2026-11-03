import "server-only";

import { sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/database/client";
import type { Currency } from "@/domain/money";
import type { Actor } from "@/services/context";
import { iso } from "@/services/people/display";

export type BillDetail = {
  id: string;
  title: string;
  occurredOn: string;
  currency: Currency;
  subtotal: number;
  discount: number;
  service: number;
  tax: number;
  total: number;
  splitMode: string;
  payer: { partyId: string; name: string; isMe: boolean };
  group: { id: string; name: string } | null;
  createdAt: string;

  isParty: boolean;
};

export type BillShare = {
  partyId: string;
  name: string;
  isMe: boolean;
  total: number;
  base: number;
  obligationId: string | null;
  status: "PAYER" | "PENDING" | "ACTIVE" | "SETTLED" | "REJECTED" | "VOID" | "INFO";
  remaining: number;
};

const aliasName = (userId: string, col: string) =>
  sql.raw(
    `coalesce((select pa.name from party_alias pa where pa.owner_user_id = '${userId}' and pa.party_id = ${col}), (select p.display_name from party p where p.id = ${col}))`,
  );

export function billCore(actor: Actor, id: string): Promise<BillDetail | null> {
  return billCoreCached(actor.userId, actor.partyId, id);
}

const billCoreCached = cache(async (userId: string, me: string, id: string): Promise<BillDetail | null> => {
  const nm = (col: string) => aliasName(userId, col);
  const [b] = await db.execute<{
    id: string;
    title: string;
    occurred_on: string;
    currency: Currency;
    subtotal: string;
    discount: string;
    service: string;
    tax: string;
    total: string;
    split_mode: string;
    payer_party_id: string;
    payer_name: string;
    group_id: string | null;
    group_name: string | null;
    created_by: string | null;
    created_at: Date | string;
    is_member: boolean;
    is_share: boolean;
  }>(sql`
    select b.*, ${nm("b.payer_party_id")} as payer_name, g.name as group_name,
      exists(select 1 from group_member m where m.group_id = b.group_id and m.party_id = ${me} and m.status = 'ACTIVE') as is_member,
      exists(select 1 from bill_share s where s.bill_id = b.id and s.party_id = ${me}) as is_share
    from bill b left join groups g on g.id = b.group_id where b.id = ${id}`);
  if (!b) return null;
  const visible = b.created_by === userId || b.payer_party_id === me || b.is_member || b.is_share;
  if (!visible) return null;
  return {
    id: b.id,
    title: b.title,
    occurredOn: b.occurred_on,
    currency: b.currency,
    subtotal: Number(b.subtotal),
    discount: Number(b.discount),
    service: Number(b.service),
    tax: Number(b.tax),
    total: Number(b.total),
    splitMode: b.split_mode,
    payer: { partyId: b.payer_party_id, name: b.payer_name, isMe: b.payer_party_id === me },
    group: b.group_id ? { id: b.group_id, name: b.group_name ?? "" } : null,
    createdAt: iso(b.created_at),
    isParty: b.payer_party_id === me || Boolean(b.is_share),
  };
});

export const billShares = cache(async (actor: Actor, id: string): Promise<BillShare[]> => {
  const b = await billCore(actor, id);
  if (!b) return [];
  const me = actor.partyId;
  const nm = (col: string) => aliasName(actor.userId, col);
  const shares = await db.execute<{
    party_id: string;
    name: string;
    total: string;
    base: string;
    obligation_id: string | null;
    info_only: boolean;
    ob_status: string | null;
    amount: string | null;
    paid: string | null;
  }>(sql`
    select s.party_id, ${nm("s.party_id")} as name, s.total, s.base, s.obligation_id, s.info_only,
      o.status as ob_status, o.amount, o.paid
    from bill_share s left join obligation o on o.id = s.obligation_id
    where s.bill_id = ${id} order by s.total desc`);
  return shares.map((s) => {
    const remaining = s.amount !== null ? Number(s.amount) - Number(s.paid ?? 0) : 0;
    const status: BillShare["status"] =
      s.party_id === b.payer.partyId
        ? "PAYER"
        : s.info_only
          ? "INFO"
          : s.ob_status === "ACTIVE"
            ? remaining === 0
              ? "SETTLED"
              : "ACTIVE"
            : ((s.ob_status ?? "INFO") as "PENDING");
    return {
      partyId: s.party_id,
      name: s.name,
      isMe: s.party_id === me,
      total: Number(s.total),
      base: Number(s.base),
      obligationId: s.obligation_id,
      status,
      remaining,
    };
  });
});
