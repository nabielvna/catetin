import "server-only";

import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { db, type Tx } from "@/database/client";
import { trustAction } from "@/database/schema/approvals";
import { obligation } from "@/database/schema/debts";
import { settlement } from "@/database/schema/payments";
import type { ObligationItemInput, ObligationPatch } from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import type { InstallmentPlan } from "@/domain/installments";
import type { Currency } from "@/domain/money";
import { recordActivity } from "@/services/activity";
import { supersedePending } from "@/services/approvals/mutations";
import type { Actor, Ctx } from "@/services/context";
import { applyPatch, getObligation, itemsKey } from "@/services/debts/mutations";
import { reservedAmount } from "@/services/debts/queries";
import { closeRecurringTx, unpaidGenerated } from "@/services/debts/recurring";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { allocationsOf, applyAllocations } from "@/services/payments/allocations";
import { applySettlementVoid, excessRemovable, getSettlement, setExcessStatus } from "@/services/payments/mutations";
import { lockPair } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

type Display = { title?: string; amount?: number; currency?: string };
type TrustActionRow = typeof trustAction.$inferSelect;

async function revert(tx: Tx, ctx: Ctx, a: TrustActionRow): Promise<{ url: string; groupId: string | null }> {
  const p = a.payload as Record<string, unknown>;
  switch (a.kind) {
    case "OBLIGATION_CREATE": {
      const ob = await getObligation(tx, a.targetId);
      if (ob.status !== "ACTIVE") throw new DomainError("INVALID_STATE");
      if (ob.paid > 0 || (await reservedAmount(tx, ob.id)) > 0) throw new DomainError("HAS_PAYMENTS");
      await tx
        .update(obligation)
        .set({ status: "REJECTED", closedAt: ctx.now, updatedAt: ctx.now, version: ob.version + 1 })
        .where(eq(obligation.id, ob.id));
      await supersedePending(tx, [{ targetType: "OBLIGATION", targetId: ob.id }], ctx.now, "DISPUTED");
      return { url: `/debts/${ob.id}`, groupId: ob.groupId };
    }
    case "OBLIGATION_UPDATE": {
      const ob = await getObligation(tx, a.targetId);
      if (ob.status !== "ACTIVE" || ob.version !== p.afterVersion) throw new DomainError("SUPERSEDED");
      const before = p.before as {
        amount: number;
        dueOn: string | null;
        installments: InstallmentPlan | null;
        title: string;
        note: string | null;
        category: string | null;
        occurredOn: string;
        items: ObligationItemInput[];
      };
      if (before.amount < ob.paid + (await reservedAmount(tx, ob.id))) {
        throw new DomainError("AMOUNT_BELOW_PAID", { min: ob.paid });
      }
      const patch: ObligationPatch = {
        amount: before.amount,
        dueOn: before.dueOn,
        installments: before.installments,
        title: before.title,
        note: before.note,
        category: before.category,
        occurredOn: before.occurredOn,
        itemsKey: itemsKey(before.items),
      };
      await applyPatch(tx, ctx, ob, patch, before.items);
      return { url: `/debts/${ob.id}`, groupId: ob.groupId };
    }
    case "OBLIGATION_VOID": {
      const ob = await getObligation(tx, a.targetId);
      if (ob.status !== "VOID" || ob.version !== p.afterVersion) throw new DomainError("SUPERSEDED");
      await tx
        .update(obligation)
        .set({ status: "ACTIVE", closedAt: null, updatedAt: ctx.now, version: ob.version + 1 })
        .where(eq(obligation.id, ob.id));
      return { url: `/debts/${ob.id}`, groupId: ob.groupId };
    }
    case "SETTLEMENT_CREATE": {
      const s = await getSettlement(tx, a.targetId);
      if (s.status !== "ACTIVE") throw new DomainError("INVALID_STATE");
      if (!(await excessRemovable(tx, s.id))) throw new DomainError("HAS_PAYMENTS");
      await applySettlementVoid(tx, ctx, s);
      await supersedePending(tx, [{ targetType: "SETTLEMENT", targetId: s.id }], ctx.now, "DISPUTED");
      return { url: `/payments/${s.id}`, groupId: s.groupId };
    }
    case "SETTLEMENT_VOID": {
      const s = await getSettlement(tx, a.targetId);
      if (s.status !== "VOID") throw new DomainError("SUPERSEDED");
      const allocations = await allocationsOf(tx, s.id);
      const obs = allocations.length
        ? await tx
            .select()
            .from(obligation)
            .where(
              inArray(
                obligation.id,
                allocations.map((x) => x.obligationId),
              ),
            )
        : [];
      for (const al of allocations) {
        const ob = obs.find((o) => o.id === al.obligationId);
        const reserved = ob ? await reservedAmount(tx, ob.id) : 0;
        if (!ob || ob.status !== "ACTIVE" || ob.paid + reserved + al.amount > ob.amount) {
          throw new DomainError("SUPERSEDED");
        }
      }
      await tx.update(settlement).set({ status: "ACTIVE", closedAt: null }).where(eq(settlement.id, s.id));
      await applyAllocations(tx, allocations, ctx.now);
      await setExcessStatus(tx, s.id, "ACTIVE", ctx.now);
      return { url: `/payments/${s.id}`, groupId: s.groupId };
    }
    case "RECURRING_CREATE": {
      await closeRecurringTx(tx, a.targetId, "REJECTED", ctx.now);

      for (const ob of await unpaidGenerated(tx, a.targetId)) {
        if ((await reservedAmount(tx, ob.id)) > 0) continue;
        await tx
          .update(obligation)
          .set({ status: "REJECTED", closedAt: ctx.now, updatedAt: ctx.now, version: ob.version + 1 })
          .where(eq(obligation.id, ob.id));
      }
      return { url: `/people/${a.actorPartyId}`, groupId: null };
    }
  }
}

export function disputeTrustAction(ctx: Ctx, input: { id: string; reason?: string | null }): Promise<void> {
  return mutate(async (tx, fx) => {
    const [a0] = await tx.select().from(trustAction).where(eq(trustAction.id, input.id));
    if (!a0 || a0.harmedPartyId !== ctx.actor.partyId) throw new DomainError("NOT_FOUND");
    await lockPair(tx, a0.pairId);
    const [a] = await tx.select().from(trustAction).where(eq(trustAction.id, input.id)).for("update");
    if (!a || a.disputedAt) throw new DomainError("ALREADY_DECIDED");
    if (a.disputeUntil < ctx.now) throw new DomainError("INVALID_STATE");

    const { url, groupId } = await revert(tx, ctx, a);
    await tx.update(trustAction).set({ disputedAt: ctx.now }).where(eq(trustAction.id, a.id));
    const reason = input.reason?.trim().slice(0, 500) || null;
    const display = ((a.payload as { display?: Display }).display ?? {}) as Display;
    const activityId = await recordActivity(tx, ctx, {
      type: "TRUST_DISPUTED",
      pairId: a.pairId,
      groupId,
      targetType: a.targetType === "SETTLEMENT" ? "SETTLEMENT" : a.targetType === "OBLIGATION" ? "OBLIGATION" : null,
      targetId: a.targetType === "RECURRING" ? null : a.targetId,
      data: { kind: a.kind, reason, ...display },
    });
    await notifyParties(tx, fx, ctx, {
      type: "TRUST_DISPUTED",
      partyIds: [a.actorPartyId],
      activityId,
      url,
      data: { ...display, reason, changes: [a.kind] },
    });
    await refreshScope(tx, fx, { partyIds: [a.actorPartyId, a.harmedPartyId], groupId, pairId: a.pairId });
  });
}

export type DisputableItem = {
  id: string;
  kind: TrustActionRow["kind"];
  actorName: string;
  actorPartyId: string;
  title: string | null;
  amount: number | null;
  currency: Currency | null;
  url: string;
  createdAt: string;
  disputeUntil: string;
};

export async function listDisputable(actor: Actor, now = new Date(), targetId?: string): Promise<DisputableItem[]> {
  const conds = [
    eq(trustAction.harmedPartyId, actor.partyId),
    gt(trustAction.disputeUntil, now),
    isNull(trustAction.disputedAt),
  ];
  if (targetId) conds.push(eq(trustAction.targetId, targetId));
  const rows = await db
    .select({
      id: trustAction.id,
      kind: trustAction.kind,
      targetType: trustAction.targetType,
      targetId: trustAction.targetId,
      actorPartyId: trustAction.actorPartyId,
      payload: trustAction.payload,
      createdAt: trustAction.createdAt,
      disputeUntil: trustAction.disputeUntil,
      actorName: sql<string>`coalesce(
        (select pa.name from party_alias pa where pa.owner_user_id = ${actor.userId} and pa.party_id = ${trustAction.actorPartyId}),
        (select p.display_name from party p where p.id = ${trustAction.actorPartyId}))`,
    })
    .from(trustAction)
    .where(and(...conds))
    .orderBy(sql`${trustAction.createdAt} desc`)
    .limit(50);
  return rows.map((r) => {
    const d = ((r.payload as { display?: Display }).display ?? {}) as Display;
    const url =
      r.targetType === "OBLIGATION"
        ? `/debts/${r.targetId}`
        : r.targetType === "SETTLEMENT"
          ? `/payments/${r.targetId}`
          : `/people/${r.actorPartyId}`;
    return {
      id: r.id,
      kind: r.kind,
      actorName: r.actorName,
      actorPartyId: r.actorPartyId,
      title: d.title ?? null,
      amount: d.amount ?? null,
      currency: (d.currency as Currency) ?? null,
      url,
      createdAt: r.createdAt.toISOString(),
      disputeUntil: r.disputeUntil.toISOString(),
    };
  });
}
