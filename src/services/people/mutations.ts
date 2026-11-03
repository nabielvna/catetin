import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { DbOrTx } from "@/database/client";
import {
  approvalRequest,
  billShare,
  groupMember,
  invite,
  obligation,
  pair,
  party,
  recurring,
  settlement,
} from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { normalizeEmail, normalizeName } from "@/domain/people";
import { recordActivity } from "@/services/activity";
import type { Ctx } from "@/services/context";
import { canSeeParty, ensurePair, getParty, setAlias } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

export function createManualContact(
  ctx: Ctx,
  input: { id: string; name: string; email?: string | null },
): Promise<{ partyId: string; pairId: string }> {
  return mutate(async (tx, fx) => {
    const name = normalizeName(input.name);
    const email = normalizeEmail(input.email);
    const [existing] = await tx.select().from(party).where(eq(party.id, input.id));
    if (existing) {
      if (existing.ownerUserId !== ctx.actor.userId) throw new DomainError("INVALID_INPUT");
    } else {
      await tx
        .insert(party)
        .values({
          id: input.id,
          kind: "MANUAL",
          displayName: name,
          email,
          ownerUserId: ctx.actor.userId,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        });
    }
    const p = await ensurePair(tx, ctx.actor.partyId, input.id);
    if (!existing) {
      await recordActivity(tx, ctx, { type: "CONTACT_CREATED", pairId: p.id, targetType: "PARTY", targetId: input.id });
    }
    fx.refreshUsers([ctx.actor.userId], { scope: "ledger", pairId: p.id });
    return { partyId: input.id, pairId: p.id };
  });
}

export function renamePerson(ctx: Ctx, input: { partyId: string; name: string }): Promise<void> {
  return mutate(async (tx, fx) => {
    const name = normalizeName(input.name);
    const p = await getParty(tx, input.partyId);
    if (!(await canSeeParty(tx, ctx.actor, p.id)) || p.id === ctx.actor.partyId) {
      throw new DomainError("NOT_FOUND");
    }
    if (p.kind === "MANUAL" && p.ownerUserId === ctx.actor.userId) {
      await tx.update(party).set({ displayName: name, updatedAt: ctx.now }).where(eq(party.id, p.id));
    } else {
      await setAlias(tx, ctx.actor.userId, p.id, name);
    }
    fx.refreshUsers([ctx.actor.userId], { scope: "ledger" });
  });
}

export function setContactEmail(ctx: Ctx, input: { partyId: string; email: string | null }): Promise<void> {
  return mutate(async (tx, fx) => {
    const email = normalizeEmail(input.email);
    const p = await getParty(tx, input.partyId);
    if (p.kind !== "MANUAL" || p.ownerUserId !== ctx.actor.userId || p.mergedInto) {
      throw new DomainError("NOT_FOUND");
    }
    await tx.update(party).set({ email, updatedAt: ctx.now }).where(eq(party.id, p.id));
    fx.refreshUsers([ctx.actor.userId], { scope: "ledger" });
  });
}

async function myManualContact(tx: DbOrTx, ctx: Ctx, partyId: string) {
  const p = await getParty(tx, partyId);
  if (p.kind !== "MANUAL" || p.ownerUserId !== ctx.actor.userId || p.mergedInto || p.deletedAt) {
    throw new DomainError("NOT_FOUND");
  }
  return p;
}

export async function contactUsage(tx: DbOrTx, partyId: string) {
  const [row] = await tx.execute<{
    records: number;
    open: number;
    pending: number;
    recurring: number;
    groups: number;
  }>(sql`
    select
      (select count(*)::int from ${obligation} o where o.creditor_id = ${partyId} or o.debtor_id = ${partyId})
        + (select count(*)::int from ${settlement} s where s.payer_id = ${partyId} or s.payee_id = ${partyId})
        + (select count(*)::int from ${billShare} b where b.party_id = ${partyId}) as records,
      (select count(*)::int from ${obligation} o where (o.creditor_id = ${partyId} or o.debtor_id = ${partyId})
        and o.status = 'ACTIVE' and o.paid < o.amount) as open,
      (select count(*)::int from ${approvalRequest} r join ${pair} pr on pr.id = r.pair_id
        where r.status = 'PENDING' and (pr.party_low = ${partyId} or pr.party_high = ${partyId})) as pending,
      (select count(*)::int from ${recurring} rc where (rc.creditor_id = ${partyId} or rc.debtor_id = ${partyId})
        and rc.status in ('PENDING', 'ACTIVE')) as recurring,
      (select count(*)::int from ${groupMember} gm where gm.party_id = ${partyId} and gm.status in ('ACTIVE', 'PENDING', 'INVITED')) as groups`);
  return row ?? { records: 0, open: 0, pending: 0, recurring: 0, groups: 0 };
}

export function deleteManualContact(ctx: Ctx, input: { partyId: string }): Promise<void> {
  return mutate(async (tx, fx) => {
    const p = await myManualContact(tx, ctx, input.partyId);
    const use = await contactUsage(tx, p.id);
    if (use.records > 0 || use.groups > 0 || use.recurring > 0) throw new DomainError("HAS_RECORDS");
    await tx
      .update(party)
      .set({ deletedAt: ctx.now, archivedAt: ctx.now, email: null, updatedAt: ctx.now })
      .where(eq(party.id, p.id));
    await tx
      .update(invite)
      .set({ revokedAt: ctx.now })
      .where(and(eq(invite.partyId, p.id), sql`${invite.revokedAt} is null`));
    await recordActivity(tx, ctx, { type: "CONTACT_DELETED", targetType: "PARTY", targetId: p.id });
    fx.refreshUsers([ctx.actor.userId], { scope: "ledger" });
  });
}

export function setContactArchived(ctx: Ctx, input: { partyId: string; archived: boolean }): Promise<void> {
  return mutate(async (tx, fx) => {
    const p = await myManualContact(tx, ctx, input.partyId);
    if (input.archived) {
      const use = await contactUsage(tx, p.id);
      if (use.open > 0 || use.pending > 0 || use.recurring > 0) throw new DomainError("NOT_SETTLED");
    }
    await tx
      .update(party)
      .set({ archivedAt: input.archived ? ctx.now : null, updatedAt: ctx.now })
      .where(eq(party.id, p.id));
    fx.refreshUsers([ctx.actor.userId], { scope: "ledger" });
  });
}
