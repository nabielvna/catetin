import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { DbOrTx } from "@/database/client";
import { db } from "@/database/client";
import { pair, party, userBlock } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { recordActivity } from "@/services/activity";
import type { Actor, Ctx } from "@/services/context";
import { canSeeParty, findPair, getParty } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

export async function blockersOf(tx: DbOrTx, actorPartyId: string, partyIds: string[]): Promise<string[]> {
  const ids = [...new Set(partyIds.filter((p) => p !== actorPartyId))];
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ id: party.id })
    .from(userBlock)
    .innerJoin(party, eq(party.userId, userBlock.blockerUserId))
    .where(and(eq(userBlock.blockedPartyId, actorPartyId), inArray(party.id, ids)));
  return rows.map((r) => r.id);
}

export async function assertNotBlocked(tx: DbOrTx, actorPartyId: string, partyIds: string[]): Promise<void> {
  if ((await blockersOf(tx, actorPartyId, partyIds)).length > 0) throw new DomainError("BLOCKED");
}

export async function isBlockedByMe(tx: DbOrTx, userId: string, partyId: string): Promise<boolean> {
  const [row] = await tx
    .select({ one: sql`1` })
    .from(userBlock)
    .where(and(eq(userBlock.blockerUserId, userId), eq(userBlock.blockedPartyId, partyId)));
  return !!row;
}

export function setBlocked(ctx: Ctx, input: { partyId: string; blocked: boolean }): Promise<void> {
  return mutate(async (tx, fx) => {
    const p = await getParty(tx, input.partyId);
    if (p.id === ctx.actor.partyId || !(await canSeeParty(tx, ctx.actor, p.id))) throw new DomainError("NOT_FOUND");

    if (p.kind !== "USER" || !p.userId) throw new DomainError("INVALID_STATE");
    if (input.blocked) {
      await tx
        .insert(userBlock)
        .values({ blockerUserId: ctx.actor.userId, blockedPartyId: p.id, createdAt: ctx.now })
        .onConflictDoNothing();

      const pr = await findPair(tx, ctx.actor.partyId, p.id);
      if (pr) await tx.update(pair).set({ trustLowAt: null, trustHighAt: null }).where(eq(pair.id, pr.id));
    } else {
      await tx
        .delete(userBlock)
        .where(and(eq(userBlock.blockerUserId, ctx.actor.userId), eq(userBlock.blockedPartyId, p.id)));
    }
    await recordActivity(tx, ctx, {
      type: input.blocked ? "PERSON_BLOCKED" : "PERSON_UNBLOCKED",
      targetType: "PARTY",
      targetId: p.id,
    });
    fx.refreshUsers([ctx.actor.userId], { scope: "ledger" });
  });
}

export type BlockedPerson = { partyId: string; name: string; blockedAt: string };

export async function listBlocked(actor: Actor): Promise<BlockedPerson[]> {
  const userId = actor.userId;
  const rows = await db.execute<{ party_id: string; name: string; created_at: Date }>(sql`
    select b.blocked_party_id as party_id, b.created_at,
      coalesce((select pa.name from party_alias pa where pa.owner_user_id = ${userId} and pa.party_id = b.blocked_party_id),
        p.display_name) as name
    from user_block b join party p on p.id = b.blocked_party_id
    where b.blocker_user_id = ${userId}
    order by b.created_at desc`);
  return rows.map((r) => ({ partyId: r.party_id, name: r.name, blockedAt: new Date(r.created_at).toISOString() }));
}
