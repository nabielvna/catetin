import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { groupMember, pair, party, partyAlias } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { newId } from "@/lib/server/ids";

export type PartyRow = typeof party.$inferSelect;
export type PairRow = typeof pair.$inferSelect;

export function orderPair(a: string, b: string): [string, string] {
  if (a === b) throw new DomainError("SELF_PAIR");
  return a < b ? [a, b] : [b, a];
}

export function otherParty(p: Pick<PairRow, "partyLow" | "partyHigh">, me: string): string {
  return p.partyLow === me ? p.partyHigh : p.partyLow;
}

export async function resolvePartyId(tx: DbOrTx, id: string): Promise<string> {
  let current = id;
  for (let i = 0; i < 5; i++) {
    const [row] = await tx.select({ mergedInto: party.mergedInto }).from(party).where(eq(party.id, current));
    if (!row) throw new DomainError("NOT_FOUND");
    if (!row.mergedInto) return current;
    current = row.mergedInto;
  }
  return current;
}

export async function getParties(tx: DbOrTx, ids: string[]): Promise<Map<string, PartyRow>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(party)
    .where(inArray(party.id, [...new Set(ids)]));
  return new Map(rows.map((r) => [r.id, r]));
}

export async function getParty(tx: DbOrTx, id: string): Promise<PartyRow> {
  const [row] = await tx.select().from(party).where(eq(party.id, id));
  if (!row) throw new DomainError("NOT_FOUND");
  return row;
}

export function isActiveUser(p: Pick<PartyRow, "kind" | "userId">): boolean {
  return p.kind === "USER" && p.userId !== null;
}

export async function ensurePair(tx: Tx, a: string, b: string): Promise<PairRow> {
  const [low, high] = orderPair(a, b);
  await tx.insert(pair).values({ id: newId(), partyLow: low, partyHigh: high }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(pair)
    .where(and(eq(pair.partyLow, low), eq(pair.partyHigh, high), isNull(pair.mergedInto)));
  if (!row) throw new Error("pair not found after insert");
  return row;
}

export async function findPair(tx: DbOrTx, a: string, b: string): Promise<PairRow | undefined> {
  const [low, high] = orderPair(a, b);
  const [row] = await tx
    .select()
    .from(pair)
    .where(and(eq(pair.partyLow, low), eq(pair.partyHigh, high), isNull(pair.mergedInto)));
  return row;
}

// Lock pairs in a stable order to avoid deadlocks.
export async function lockPairs(tx: Tx, pairIds: string[]): Promise<Map<string, PairRow>> {
  const ids = [...new Set(pairIds)].sort();
  const out = new Map<string, PairRow>();
  for (const id of ids) {
    const [row] = await tx.select().from(pair).where(eq(pair.id, id)).for("update");
    if (!row) throw new DomainError("NOT_FOUND");
    out.set(id, row);
  }
  return out;
}

export async function lockPair(tx: Tx, pairId: string): Promise<PairRow> {
  const rows = await lockPairs(tx, [pairId]);
  return rows.get(pairId)!;
}

export async function touchPair(tx: Tx, pairId: string, now: Date) {
  await tx.update(pair).set({ lastActivityAt: now }).where(eq(pair.id, pairId));

  await tx.execute(sql`
    update ${party} set archived_at = null
    where archived_at is not null and deleted_at is null
      and id in (select party_low from ${pair} where id = ${pairId} union select party_high from ${pair} where id = ${pairId})`);
}

export async function canSeeParty(
  tx: DbOrTx,
  viewer: { userId: string; partyId: string },
  targetId: string,
): Promise<boolean> {
  if (viewer.partyId === targetId) return true;
  const [low, high] = orderPair(viewer.partyId, targetId);
  const rows = await tx.execute<{ ok: number }>(sql`
    select 1 as ok from ${pair}
      where ${pair.partyLow} = ${low} and ${pair.partyHigh} = ${high} and ${pair.mergedInto} is null
    union all
    select 1 from ${party} where ${party.id} = ${targetId} and ${party.ownerUserId} = ${viewer.userId}
    union all
    select 1 from ${groupMember} a
      join ${groupMember} b on b.group_id = a.group_id
      where a.party_id = ${viewer.partyId} and a.status = 'ACTIVE'
        and b.party_id = ${targetId} and b.status in ('ACTIVE', 'PENDING')
    limit 1
  `);
  return rows.length > 0;
}

export async function namesFor(
  tx: DbOrTx,
  viewerUserId: string | null,
  partyIds: string[],
): Promise<Map<string, string>> {
  const parties = await getParties(tx, partyIds);
  const aliases =
    viewerUserId && partyIds.length
      ? await tx
          .select({ partyId: partyAlias.partyId, name: partyAlias.name })
          .from(partyAlias)
          .where(and(eq(partyAlias.ownerUserId, viewerUserId), inArray(partyAlias.partyId, partyIds)))
      : [];
  const aliasMap = new Map(aliases.map((a) => [a.partyId, a.name]));
  const out = new Map<string, string>();
  for (const id of partyIds) {
    const p = parties.get(id);
    out.set(id, aliasMap.get(id) ?? p?.displayName ?? "?");
  }
  return out;
}

export async function setAlias(tx: Tx, ownerUserId: string, partyId: string, name: string) {
  await tx
    .insert(partyAlias)
    .values({ ownerUserId, partyId, name })
    .onConflictDoUpdate({ target: [partyAlias.ownerUserId, partyAlias.partyId], set: { name, updatedAt: sql`now()` } });
}

export function userIdsOf(...parties: Array<PartyRow | undefined>): string[] {
  return parties.flatMap((p) => (p && p.userId ? [p.userId] : []));
}
