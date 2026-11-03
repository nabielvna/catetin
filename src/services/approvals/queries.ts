import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";
import type { Currency } from "@/domain/money";
import type { Actor } from "@/services/context";
import { iso } from "@/services/people/display";

export type RequestItem = {
  requestId: string;
  kind:
    | "OBLIGATION_CREATE"
    | "OBLIGATION_UPDATE"
    | "OBLIGATION_VOID"
    | "SETTLEMENT_CREATE"
    | "SETTLEMENT_VOID"
    | "GROUP_MODE"
    | "GROUP_JOIN"
    | "GROUP_SIMPLIFY"
    | "RECURRING_CREATE";

  displayKind: string;
  createdAt: string;
  requesterId: string | null;
  requesterName: string;

  approverName: string | null;
  targetId: string;
  url: string;
  title: string | null;
  amount: number | null;
  currency: Currency | null;
  groupName: string | null;
  mode: string | null;
  reason: string | null;
  fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  method: string | null;
};

type Row = {
  id: string;
  kind: RequestItem["kind"];
  created_at: Date;
  requested_by_party: string | null;
  requester_name: string | null;
  approver_name: string | null;
  target_type: string;
  target_id: string;
  group_id: string | null;
  payload: Record<string, unknown>;
  ob_title: string | null;
  ob_amount: string | null;
  ob_currency: Currency | null;
  st_amount: string | null;
  st_currency: Currency | null;
  st_kind: string | null;
  st_method: string | null;
  group_name: string | null;
  joiner_name: string | null;
  rc_title: string | null;
  rc_amount: string | null;
  rc_currency: Currency | null;
  rc_every: string | null;
  rc_party: string | null;
};

function selectRequests(actor: Actor) {
  return sql`
    select r.id, r.kind, r.created_at, r.requested_by_party, r.target_type, r.target_id, r.payload, r.group_id,
      coalesce(
        (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = r.requested_by_party),
        (select p.display_name from party p where p.id = r.requested_by_party)
      ) as requester_name,
      (select coalesce(
          (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = v2.party_id),
          (select p.display_name from party p where p.id = v2.party_id))
        from approval_vote v2 where v2.request_id = r.id and v2.decision = 'PENDING' order by v2.party_id limit 1
      ) as approver_name,
      o.title as ob_title, o.amount as ob_amount, o.currency as ob_currency,
      s.amount as st_amount, s.currency as st_currency, s.kind as st_kind, s.method as st_method,
      g.name as group_name,
      rc.title as rc_title, rc.amount as rc_amount, rc.currency as rc_currency, rc.every as rc_every,
      case when rc.creditor_id = ${actor.partyId} then rc.debtor_id else rc.creditor_id end as rc_party,
      case when r.kind = 'GROUP_JOIN' then coalesce(
        (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = r.target_id),
        (select p.display_name from party p where p.id = r.target_id)) end as joiner_name
    from approval_request r
    left join obligation o on r.target_type = 'OBLIGATION' and o.id = r.target_id
    left join settlement s on r.target_type = 'SETTLEMENT' and s.id = r.target_id
    left join groups g on g.id = r.group_id
    left join recurring rc on r.target_type = 'RECURRING' and rc.id = r.target_id`;
}

function toItem(r: Row): RequestItem {
  const p = r.payload ?? {};
  const isOffset = r.st_kind === "OFFSET";
  const url =
    r.target_type === "OBLIGATION"
      ? `/debts/${r.target_id}`
      : r.target_type === "SETTLEMENT"
        ? `/payments/${r.target_id}`
        : r.target_type === "RECURRING"
          ? `/people/${r.rc_party ?? ""}`
          : `/groups/${r.group_id ?? ""}`;
  const patch = (p as { patch?: Record<string, unknown> }).patch ?? null;
  return {
    requestId: r.id,
    kind: r.kind,
    displayKind: r.kind === "SETTLEMENT_CREATE" && isOffset ? "OFFSET_CREATE" : r.kind,
    createdAt: iso(r.created_at),
    requesterId: r.requested_by_party,
    requesterName: r.kind === "GROUP_JOIN" && r.joiner_name ? r.joiner_name : (r.requester_name ?? "?"),
    approverName: r.approver_name,
    targetId: r.target_id,
    url,
    title: r.ob_title ?? r.rc_title,
    amount:
      r.rc_amount !== null
        ? Number(r.rc_amount)
        : r.ob_amount !== null && r.kind === "OBLIGATION_CREATE"
          ? Number(r.ob_amount)
          : r.st_amount !== null
            ? Number(r.st_amount)
            : r.ob_amount !== null
              ? Number(r.ob_amount)
              : null,
    currency: r.st_currency ?? r.ob_currency ?? r.rc_currency,
    groupName: r.group_name,
    mode: (p as { mode?: string }).mode ?? r.rc_every ?? null,
    reason: (p as { reason?: string }).reason ?? null,
    fields: ((p as { fields?: string[] }).fields ?? []).filter((f) => f !== "itemsKey"),
    before: (p as { before?: Record<string, unknown> }).before ?? null,
    after: patch,
    method: r.st_method,
  };
}

export async function listAwaiting(actor: Actor, limit = 50): Promise<RequestItem[]> {
  const rows = await db.execute<Row>(sql`
    ${selectRequests(actor)}
    join approval_vote v on v.request_id = r.id and v.party_id = ${actor.partyId} and v.decision = 'PENDING'
    where r.status = 'PENDING'
    order by r.created_at desc
    limit ${limit}`);
  return rows.map(toItem);
}

export async function listWaiting(actor: Actor, limit = 50): Promise<RequestItem[]> {
  const rows = await db.execute<Row>(sql`
    ${selectRequests(actor)}
    where r.status = 'PENDING' and r.requested_by_party = ${actor.partyId}
    order by r.created_at desc
    limit ${limit}`);
  return rows.map(toItem);
}

export function awaitingCountQuery(actor: Actor) {
  return sql`(select count(*)::int from approval_vote v join approval_request r on r.id = v.request_id
    where v.party_id = ${actor.partyId} and v.decision = 'PENDING' and r.status = 'PENDING')`;
}
