import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db, type DbOrTx, type Tx } from "@/database/client";
import {
  approvalRequest,
  bill,
  billShare,
  groupMember,
  invite,
  obligation,
  pair,
  party,
  partyAlias,
  recurring,
  settlement,
} from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { normalizeEmail } from "@/domain/people";
import { newId } from "@/lib/server/ids";
import { isUuid } from "@/lib/server/ids";
import { consume } from "@/lib/server/rate-limit";
import { recordActivity } from "@/services/activity";
import type { Ctx } from "@/services/context";
import { reservedAmount } from "@/services/debts/queries";
import { getGroup, getMember } from "@/services/groups/access";
import { joinGroupTx } from "@/services/groups/mutations";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { assertNotBlocked } from "@/services/people/blocks";
import { canSeeParty, ensurePair, findPair, getParty, lockPairs, orderPair, setAlias } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

const INVITES_PER_DAY = 20;

export type InviteKind = "CLAIM" | "CONNECT" | "GROUP";
export type InviteRow = typeof invite.$inferSelect;

const TTL_MS: Record<InviteKind, number> = { CLAIM: 7 * 86_400_000, CONNECT: 10 * 60_000, GROUP: 7 * 86_400_000 };

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export type CreateInviteInput =
  { kind: "CLAIM"; partyId: string; sendEmail?: boolean } | { kind: "CONNECT" } | { kind: "GROUP"; groupId: string };

export type CreatedInvite = { token: string; expiresAt: Date; kind: InviteKind };

export function createInvite(ctx: Ctx, input: CreateInviteInput): Promise<CreatedInvite> {
  return mutate(async (tx, fx) => {
    await consume(`invite:${ctx.actor.userId}`, INVITES_PER_DAY, 86_400);
    const token = newToken();
    const expiresAt = new Date(ctx.now.getTime() + TTL_MS[input.kind]);
    let partyId: string | null = null;
    let groupId: string | null = null;
    let targetEmail: string | null = null;
    let maxUses: number | null = 1;

    if (input.kind === "CLAIM") {
      const p = await getParty(tx, input.partyId);
      if (p.kind !== "MANUAL" || p.mergedInto) throw new DomainError("NOT_FOUND");
      const mine = p.ownerUserId === ctx.actor.userId;
      const inMyGroup = p.groupId !== null && (await getMember(tx, p.groupId, ctx.actor.partyId))?.status === "ACTIVE";
      if (!mine && !inMyGroup) throw new DomainError("NOT_FOUND");
      partyId = p.id;
      groupId = p.groupId;
      targetEmail = p.email;
    } else if (input.kind === "GROUP") {
      const g = await getGroup(tx, input.groupId);
      if (g.archivedAt) throw new DomainError("INVALID_STATE");
      if ((await getMember(tx, g.id, ctx.actor.partyId))?.status !== "ACTIVE") throw new DomainError("NOT_FOUND");
      groupId = g.id;
      maxUses = null;
    }

    await tx
      .insert(invite)
      .values({
        id: newId(),
        tokenHash: hashToken(token),
        kind: input.kind,
        partyId,
        groupId,
        createdBy: ctx.actor.userId,
        targetEmail,
        expiresAt,
        maxUses,
        createdAt: ctx.now,
      });

    if (input.kind === "CLAIM" && input.sendEmail) {
      const email = normalizeEmail(targetEmail);
      if (!email) throw new DomainError("INVALID_INPUT", { field: "email" });

      await tx.execute(sql`
        insert into notification (id, type, recipient_email, channel, dedupe_key, payload, status)
        values (${newId()}, 'INVITE_EMAIL', ${email}, 'EMAIL',
          ${`invite:${partyId}:${ctx.now.toISOString().slice(0, 10)}`},
          ${JSON.stringify({
            type: "INVITE_EMAIL",
            url: `/invite/${token}`,
            data: { actorName: ctx.actor.name, counterpartName: null, locale: ctx.actor.locale },
          })}::jsonb, 'PENDING')
        on conflict (dedupe_key) do nothing`);
      fx.dispatch = true;
    }
    return { token, expiresAt, kind: input.kind };
  });
}

export const USER_INVITE_PREFIX = "u.";

async function findInvite(tx: DbOrTx, token: string, lock = false, viewerUserId?: string | null): Promise<InviteRow> {
  const byId = token.startsWith(USER_INVITE_PREFIX) ? token.slice(USER_INVITE_PREFIX.length) : null;
  if (byId !== null && !isUuid(byId)) throw new DomainError("INVITE_INVALID");
  const where = byId !== null ? eq(invite.id, byId) : eq(invite.tokenHash, hashToken(token));
  const [row] = lock
    ? await tx.select().from(invite).where(where).for("update")
    : await tx.select().from(invite).where(where);
  if (!row) throw new DomainError("INVITE_INVALID");

  if ((byId !== null || row.targetUserId) && row.targetUserId !== viewerUserId) {
    throw new DomainError("INVITE_INVALID");
  }
  return row;
}

function assertUsable(inv: InviteRow, now: Date) {
  if (inv.revokedAt || inv.expiresAt < now) throw new DomainError("INVITE_INVALID");
  if (inv.maxUses !== null && inv.useCount >= inv.maxUses) throw new DomainError("INVITE_INVALID");
}

export type InvitePreview = {
  kind: InviteKind;
  inviterName: string;
  groupName: string | null;
  groupMode: "CONFIRM" | "TRUST" | null;
  placeholderName: string | null;

  items: Array<{
    id: string;
    title: string;
    amount: number;
    paid: number;
    currency: string;
    occurredOn: string;
    direction: "I_OWE" | "THEY_OWE";
    counterpartName: string;
    groupName: string | null;

    disputable: boolean;
  }>;
  expiresAt: Date;
};

export async function previewInvite(
  token: string,
  now = new Date(),
  viewerUserId?: string | null,
): Promise<InvitePreview> {
  const tx = db;
  const inv = await findInvite(tx, token, false, viewerUserId);
  assertUsable(inv, now);
  const [inviter] = await tx.select({ name: party.displayName }).from(party).where(eq(party.userId, inv.createdBy));
  const group = inv.groupId ? await getGroup(tx, inv.groupId) : null;
  const items: InvitePreview["items"] = [];
  let placeholderName: string | null = null;

  if (inv.kind === "CLAIM" && inv.partyId) {
    const p = await getParty(tx, inv.partyId);
    placeholderName = p.displayName;
    const obs = await tx
      .select()
      .from(obligation)
      .where(
        and(
          or(eq(obligation.creditorId, p.id), eq(obligation.debtorId, p.id)),
          inArray(obligation.status, ["ACTIVE", "PENDING"]),
        ),
      )
      .orderBy(obligation.occurredOn);
    const otherIds = obs.map((o) => (o.creditorId === p.id ? o.debtorId : o.creditorId));
    const others = otherIds.length ? await tx.select().from(party).where(inArray(party.id, otherIds)) : [];
    for (const o of obs) {
      const other = o.creditorId === p.id ? o.debtorId : o.creditorId;
      const reserved = await reservedAmount(tx, o.id);
      items.push({
        id: o.id,
        title: o.title,
        amount: o.amount,
        paid: o.paid,
        currency: o.currency,
        occurredOn: o.occurredOn,
        direction: o.debtorId === p.id ? "I_OWE" : "THEY_OWE",
        counterpartName: others.find((x) => x.id === other)?.displayName ?? "?",
        groupName: o.groupId && group && o.groupId === group.id ? group.name : null,
        disputable: o.debtorId === p.id && o.paid === 0 && reserved === 0,
      });
    }
  }
  return {
    kind: inv.kind,
    inviterName: inviter?.name ?? "?",
    groupName: group?.name ?? null,
    groupMode: group?.mode ?? null,
    placeholderName,
    items,
    expiresAt: inv.expiresAt,
  };
}

export type AcceptResult = {
  kind: InviteKind;

  redirect: string;
  groupStatus?: "ACTIVE" | "PENDING";
};

export function acceptInvite(
  ctx: Ctx,
  input: { token: string; disputedObligationIds?: string[] },
): Promise<AcceptResult> {
  return mutate(async (tx, fx) => {
    const inv = await findInvite(tx, input.token, true, ctx.actor.userId);
    assertUsable(inv, ctx.now);
    if (inv.createdBy === ctx.actor.userId) throw new DomainError("SELF_INVITE");
    const [inviterParty] = await tx.select().from(party).where(eq(party.userId, inv.createdBy));
    if (!inviterParty) throw new DomainError("INVITE_INVALID");

    await tx
      .update(invite)
      .set({ useCount: inv.useCount + 1, lastUsedBy: ctx.actor.userId, lastUsedAt: ctx.now })
      .where(eq(invite.id, inv.id));

    let redirect = `/people/${inviterParty.id}`;
    let groupStatus: AcceptResult["groupStatus"];

    if (inv.kind === "CLAIM") {
      await claimPlaceholderTx(tx, ctx, inv.partyId!, input.disputedObligationIds ?? []);
      if (inv.groupId) redirect = `/groups/${inv.groupId}`;
    } else if (inv.kind === "CONNECT") {
      const p = await ensurePair(tx, inviterParty.id, ctx.actor.partyId);
      await recordActivity(tx, ctx, { type: "CONNECTED", pairId: p.id });
    } else if (inv.kind === "GROUP") {
      const group = await getGroup(tx, inv.groupId!);
      if (group.archivedAt) throw new DomainError("INVITE_INVALID");
      groupStatus = await joinGroupTx(tx, fx, ctx, group, inv.createdBy);
      redirect = `/groups/${group.id}`;
    }

    await notifyParties(tx, fx, ctx, {
      type: "INVITE_ACCEPTED",
      partyIds: [inviterParty.id],
      url: `/people/${ctx.actor.partyId}`,
    });
    await refreshScope(tx, fx, { partyIds: [inviterParty.id, ctx.actor.partyId], groupId: inv.groupId });
    return { kind: inv.kind, redirect, groupStatus };
  });
}

export async function claimPlaceholderTx(
  tx: Tx,
  ctx: Ctx,
  placeholderId: string,
  disputed: string[],
  targetId: string = ctx.actor.partyId,
) {
  const me = targetId;
  const [target] = await tx.select().from(party).where(eq(party.id, me));
  const targetIsUser = target?.kind === "USER";
  const [ph] = await tx.select().from(party).where(eq(party.id, placeholderId)).for("update");
  if (!ph || ph.kind !== "MANUAL" || ph.mergedInto) throw new DomainError("INVITE_INVALID");

  const pairs = await tx
    .select()
    .from(pair)
    .where(and(or(eq(pair.partyLow, ph.id), eq(pair.partyHigh, ph.id)), isNull(pair.mergedInto)));
  const counterparts = pairs.map((p) => (p.partyLow === ph.id ? p.partyHigh : p.partyLow));
  if (counterparts.includes(me)) throw new DomainError("SELF_INVITE");

  const targets = await Promise.all(counterparts.map((x) => findPair(tx, me, x)));
  await lockPairs(tx, [...pairs.map((p) => p.id), ...targets.flatMap((t) => (t ? [t.id] : []))]);

  if (disputed.length) {
    const rows = await tx
      .select()
      .from(obligation)
      .where(
        and(
          inArray(obligation.id, disputed),
          eq(obligation.debtorId, ph.id),
          inArray(obligation.status, ["ACTIVE", "PENDING"]),
        ),
      );
    for (const o of rows) {
      if (o.paid > 0 || (await reservedAmount(tx, o.id)) > 0) continue;
      await tx
        .update(obligation)
        .set({ status: "REJECTED", closedAt: ctx.now, updatedAt: ctx.now })
        .where(eq(obligation.id, o.id));
      await tx
        .update(approvalRequest)
        .set({ status: "SUPERSEDED", decidedAt: ctx.now, reason: "DISPUTED_ON_CLAIM" })
        .where(and(eq(approvalRequest.targetId, o.id), eq(approvalRequest.status, "PENDING")));
      await recordActivity(tx, ctx, {
        type: "OBLIGATION_DISPUTED_ON_CLAIM",
        pairId: o.pairId,
        groupId: o.groupId,
        targetType: "OBLIGATION",
        targetId: o.id,
      });
    }
  }

  for (let i = 0; i < pairs.length; i++) {
    const old = pairs[i]!;
    const x = counterparts[i]!;
    const target = targets[i];
    if (target) {
      await tx.update(obligation).set({ pairId: target.id }).where(eq(obligation.pairId, old.id));
      await tx.update(settlement).set({ pairId: target.id }).where(eq(settlement.pairId, old.id));
      await tx.update(recurring).set({ pairId: target.id }).where(eq(recurring.pairId, old.id));
      await tx.update(approvalRequest).set({ pairId: target.id }).where(eq(approvalRequest.pairId, old.id));
      await tx.update(pair).set({ mergedInto: target.id }).where(eq(pair.id, old.id));
    } else {
      const [low, high] = orderPair(me, x);
      await tx.update(pair).set({ partyLow: low, partyHigh: high }).where(eq(pair.id, old.id));
    }
  }

  await tx.update(obligation).set({ creditorId: me }).where(eq(obligation.creditorId, ph.id));
  await tx.update(obligation).set({ debtorId: me }).where(eq(obligation.debtorId, ph.id));
  await tx.update(settlement).set({ payerId: me }).where(eq(settlement.payerId, ph.id));
  await tx.update(settlement).set({ payeeId: me }).where(eq(settlement.payeeId, ph.id));
  await tx.update(recurring).set({ creditorId: me }).where(eq(recurring.creditorId, ph.id));
  await tx.update(recurring).set({ debtorId: me }).where(eq(recurring.debtorId, ph.id));
  await tx.update(bill).set({ payerPartyId: me }).where(eq(bill.payerPartyId, ph.id));

  await tx.execute(sql`
    update bill_share bs set party_id = ${me}
    where bs.party_id = ${ph.id}
      and not exists (select 1 from bill_share x where x.bill_id = bs.bill_id and x.party_id = ${me})`);
  await tx.delete(billShare).where(eq(billShare.partyId, ph.id));

  const memberships = await tx.select().from(groupMember).where(eq(groupMember.partyId, ph.id));
  for (const m of memberships) {
    const mine = await getMember(tx, m.groupId, me);
    if (mine && ["ACTIVE", "PENDING"].includes(mine.status)) {
      await tx.delete(groupMember).where(and(eq(groupMember.groupId, m.groupId), eq(groupMember.partyId, ph.id)));
    } else {
      if (mine)
        await tx.delete(groupMember).where(and(eq(groupMember.groupId, m.groupId), eq(groupMember.partyId, me)));
      await tx
        .update(groupMember)
        .set({ partyId: me })
        .where(and(eq(groupMember.groupId, m.groupId), eq(groupMember.partyId, ph.id)));
    }
  }

  if (targetIsUser && ph.ownerUserId && ph.displayName !== target?.displayName) {
    await setAlias(tx, ph.ownerUserId, me, ph.displayName);
  }
  await tx.execute(sql`
    update party_alias a set party_id = ${me}
    where a.party_id = ${ph.id}
      and not exists (select 1 from party_alias b where b.owner_user_id = a.owner_user_id and b.party_id = ${me})`);
  await tx.delete(partyAlias).where(eq(partyAlias.partyId, ph.id));

  await tx
    .update(invite)
    .set({ revokedAt: ctx.now })
    .where(and(eq(invite.partyId, ph.id), isNull(invite.revokedAt)));
  await tx.update(party).set({ mergedInto: me, updatedAt: ctx.now }).where(eq(party.id, ph.id));

  await recordActivity(tx, ctx, {
    type: targetIsUser ? "PLACEHOLDER_CLAIMED" : "CONTACT_MERGED",
    targetType: "PARTY",
    targetId: ph.id,
    data: { disputed: disputed.length, into: me },
  });
}

export function mergeContact(
  ctx: Ctx,
  input: { sourceId: string; targetId: string },
): Promise<{ status: "MERGED" | "PROPOSED" }> {
  return mutate(async (tx, fx) => {
    const src = await getParty(tx, input.sourceId);
    if (src.kind !== "MANUAL" || src.ownerUserId !== ctx.actor.userId || src.mergedInto || src.deletedAt) {
      throw new DomainError("NOT_FOUND");
    }
    const dst = await getParty(tx, input.targetId);
    if (dst.id === src.id || dst.id === ctx.actor.partyId || dst.mergedInto || dst.deletedAt) {
      throw new DomainError("INVALID_INPUT");
    }
    if (dst.kind === "MANUAL") {
      if (dst.ownerUserId !== ctx.actor.userId) throw new DomainError("NOT_FOUND");
      await claimPlaceholderTx(tx, ctx, src.id, [], dst.id);
      fx.refreshUsers([ctx.actor.userId], { scope: "ledger" });
      return { status: "MERGED" };
    }
    if (!dst.userId || !(await canSeeParty(tx, ctx.actor, dst.id))) throw new DomainError("NOT_FOUND");
    await assertNotBlocked(tx, ctx.actor.partyId, [dst.id]);

    await tx
      .update(invite)
      .set({ revokedAt: ctx.now })
      .where(and(eq(invite.partyId, src.id), isNull(invite.revokedAt)));
    const id = newId();
    await tx
      .insert(invite)
      .values({
        id,
        tokenHash: hashToken(newToken()),
        kind: "CLAIM",
        partyId: src.id,
        groupId: src.groupId,
        createdBy: ctx.actor.userId,
        targetUserId: dst.userId,
        expiresAt: new Date(ctx.now.getTime() + TTL_MS.CLAIM),
        maxUses: 1,
        createdAt: ctx.now,
      });
    await notifyParties(tx, fx, ctx, {
      type: "MERGE_PROPOSED",
      partyIds: [dst.id],
      url: `/invite/${USER_INVITE_PREFIX}${id}`,
      data: { title: src.displayName },
    });
    return { status: "PROPOSED" };
  });
}

export function revokeInvite(ctx: Ctx, input: { partyId?: string; groupId?: string }) {
  return mutate(async (tx) => {
    const conds = [eq(invite.createdBy, ctx.actor.userId), isNull(invite.revokedAt)];
    if (input.partyId) conds.push(eq(invite.partyId, input.partyId));
    if (input.groupId) conds.push(eq(invite.groupId, input.groupId));
    await tx
      .update(invite)
      .set({ revokedAt: ctx.now })
      .where(and(...conds));
  });
}
