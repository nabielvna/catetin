import "server-only";

import { eq } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { pair, TRUST_ACTION_KINDS, trustAction } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { newId } from "@/lib/server/ids";
import { recordActivity } from "@/services/activity";
import type { Ctx } from "@/services/context";
import { notifyParties } from "@/services/notifications/parties";
import type { NotificationData } from "@/services/notifications/types";
import { assertNotBlocked, isBlockedByMe } from "@/services/people/blocks";
import { findPair, getParty, isActiveUser, lockPair, type PairRow } from "@/services/people/parties";
import { type Effects, mutate } from "@/services/transaction";

export const DISPUTE_DAYS = 7;

export type TrustActionKind = (typeof TRUST_ACTION_KINDS)[number];

export function trustSinceOf(p: Pick<PairRow, "trustLowAt" | "trustHighAt"> | null | undefined): Date | null {
  if (!p?.trustLowAt || !p.trustHighAt) return null;
  return p.trustLowAt > p.trustHighAt ? p.trustLowAt : p.trustHighAt;
}

export type TrustState = "OFF" | "I_ASKED" | "THEY_ASKED" | "ON";

export function trustStateOf(p: PairRow, me: string): TrustState {
  const mine = p.partyLow === me ? p.trustLowAt : p.trustHighAt;
  const theirs = p.partyLow === me ? p.trustHighAt : p.trustLowAt;
  if (mine && theirs) return "ON";
  if (mine) return "I_ASKED";
  if (theirs) return "THEY_ASKED";
  return "OFF";
}

export function setTrust(ctx: Ctx, input: { partyId: string; on: boolean }): Promise<{ state: TrustState }> {
  return mutate(async (tx, fx) => {
    const me = ctx.actor.partyId;
    const other = await getParty(tx, input.partyId);
    const found = await findPair(tx, me, other.id);
    if (!found || other.id === me) throw new DomainError("NOT_FOUND");
    if (!isActiveUser(other)) throw new DomainError("INVALID_STATE");
    const p = await lockPair(tx, found.id);
    const before = trustStateOf(p, me);
    const col = p.partyLow === me ? "trustLowAt" : "trustHighAt";

    if (input.on) {
      await assertNotBlocked(tx, me, [other.id]);
      if (await isBlockedByMe(tx, ctx.actor.userId, other.id)) throw new DomainError("BLOCKED");
      if (before === "ON" || before === "I_ASKED") return { state: before };
      await tx
        .update(pair)
        .set({ [col]: ctx.now })
        .where(eq(pair.id, p.id));
    } else {
      if (before === "OFF") return { state: before };
      await tx.update(pair).set({ trustLowAt: null, trustHighAt: null }).where(eq(pair.id, p.id));
    }

    const after: TrustState = input.on ? (before === "THEY_ASKED" ? "ON" : "I_ASKED") : "OFF";
    const type = after === "ON" ? "TRUST_ON" : after === "I_ASKED" ? "TRUST_REQUESTED" : "TRUST_OFF";
    const activityId = await recordActivity(tx, ctx, { type, pairId: p.id, targetType: "PARTY", targetId: other.id });

    if (!(before === "I_ASKED" && after === "OFF")) {
      await notifyParties(tx, fx, ctx, {
        type: type === "TRUST_REQUESTED" ? "TRUST_REQUESTED" : type === "TRUST_ON" ? "TRUST_ON" : "TRUST_OFF",
        partyIds: [other.id],
        activityId,
        url: `/people/${me}`,
      });
    }
    fx.refreshUsers([ctx.actor.userId, other.userId], { scope: "ledger", pairId: p.id });
    return { state: after };
  });
}

export async function recordTrustActions(
  tx: Tx,
  fx: Effects,
  ctx: Ctx,
  input: {
    pairId: string;
    kind: TrustActionKind;
    targetType: "OBLIGATION" | "SETTLEMENT" | "RECURRING";
    targetId: string;
    trusted: string[];
    payload?: Record<string, unknown>;

    display: NotificationData;
    url: string;
    groupId?: string | null;

    notify?: boolean;
  },
): Promise<void> {
  if (input.trusted.length === 0) return;
  const disputeUntil = new Date(ctx.now.getTime() + DISPUTE_DAYS * 86_400_000);
  for (const harmed of input.trusted) {
    await tx
      .insert(trustAction)
      .values({
        id: newId(),
        pairId: input.pairId,
        kind: input.kind,
        targetType: input.targetType,
        targetId: input.targetId,
        actorPartyId: ctx.actor.partyId,
        harmedPartyId: harmed,
        payload: { ...(input.payload ?? {}), display: input.display },
        createdAt: ctx.now,
        disputeUntil,
      });
  }
  if (input.notify === false) return;
  await notifyParties(tx, fx, ctx, {
    type: "TRUSTED_ACTION",
    partyIds: input.trusted,
    url: input.url,
    data: { ...input.display, changes: [input.kind] },
    dedupeBase: `trust:${input.kind}:${input.targetId}:${ctx.now.getTime()}`,
  });
}

export async function trustSinceBetween(tx: DbOrTx, a: string, b: string): Promise<Date | null> {
  return trustSinceOf(await findPair(tx, a, b));
}
