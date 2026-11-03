import "server-only";

import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export function viewerName(viewerUserId: string, partyCol: AnyPgColumn | SQL): SQL<string> {
  return sql<string>`coalesce(
    (select pa.name from party_alias pa where pa.owner_user_id = ${viewerUserId} and pa.party_id = ${partyCol}),
    (select p.display_name from party p where p.id = ${partyCol})
  )`;
}

export function partyState(partyCol: AnyPgColumn | SQL): SQL<"USER" | "MANUAL" | "DELETED"> {
  return sql<"USER" | "MANUAL" | "DELETED">`(
    select case when p.kind = 'MANUAL' then 'MANUAL' when p.user_id is null then 'DELETED' else 'USER' end
    from party p where p.id = ${partyCol}
  )`;
}

export type PartyState = "USER" | "MANUAL" | "DELETED";

export function iso(v: Date | string | null | undefined): string {
  if (!v) return new Date(0).toISOString();
  return typeof v === "string" ? new Date(v).toISOString() : v.toISOString();
}
