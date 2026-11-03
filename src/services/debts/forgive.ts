import "server-only";

import { eq } from "drizzle-orm";

import { obligation } from "@/database/schema/debts";
import { settlement, settlementAllocation } from "@/database/schema/payments";
import { type LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { type Minor } from "@/domain/money";
import { assertCommon } from "@/domain/payment";
import { recordActivity } from "@/services/activity";
import type { Ctx } from "@/services/context";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { applyAllocations, openObligations } from "@/services/payments/allocations";
import { existingSettlement, notifySettled, type SettlementResult } from "@/services/payments/shared";
import { lockPair, touchPair } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

export function forgive(
  ctx: Ctx,
  input: { id: string; obligationId: string; amount?: Minor | null; paidOn: LocalDate; note?: string | null },
): Promise<SettlementResult> {
  return mutate(async (tx, fx) => {
    const existing = await existingSettlement(tx, ctx, input.id);
    if (existing) return { id: existing.id, status: existing.status };
    const [ob0] = await tx.select().from(obligation).where(eq(obligation.id, input.obligationId));
    if (!ob0) throw new DomainError("NOT_FOUND");
    await lockPair(tx, ob0.pairId);
    const [open] = await openObligations(tx, ob0.pairId, { ids: [ob0.id] });
    if (!open) throw new DomainError("INVALID_STATE");
    if (open.creditorId !== ctx.actor.partyId) {
      if (open.debtorId === ctx.actor.partyId) throw new DomainError("FORBIDDEN_ROLE");
      throw new DomainError("NOT_FOUND");
    }
    const amount = input.amount ?? open.available;
    assertCommon({ amount, currency: open.currency, paidOn: input.paidOn, note: input.note });
    if (amount > open.available) throw new DomainError("OVERPAY", { max: open.available });

    await tx
      .insert(settlement)
      .values({
        id: input.id,
        pairId: ob0.pairId,
        kind: "FORGIVE",
        payerId: open.debtorId,
        payeeId: open.creditorId,
        amount,
        currency: open.currency,
        paidOn: input.paidOn,
        note: input.note?.trim() || null,
        status: "ACTIVE",
        groupId: open.groupId,
        createdBy: ctx.actor.userId,
        createdVia: ctx.via,
        createdAt: ctx.now,
        activatedAt: ctx.now,
      });
    const allocations = [{ obligationId: open.id, amount }];
    await tx.insert(settlementAllocation).values(allocations.map((a) => ({ settlementId: input.id, ...a })));
    const settled = await applyAllocations(tx, allocations, ctx.now);
    const activityId = await recordActivity(tx, ctx, {
      type: "FORGIVEN",
      pairId: ob0.pairId,
      groupId: open.groupId,
      targetType: "SETTLEMENT",
      targetId: input.id,
      data: { amount, currency: open.currency, obligationId: open.id },
    });
    await touchPair(tx, ob0.pairId, ctx.now);
    await notifyParties(tx, fx, ctx, {
      type: "FORGIVEN",
      partyIds: [open.debtorId],
      activityId,
      url: `/debts/${open.id}`,
      data: { amount, currency: open.currency, title: open.title },
    });
    await notifySettled(tx, fx, ctx, settled);
    await refreshScope(tx, fx, {
      partyIds: [open.creditorId, open.debtorId],
      groupId: open.groupId,
      pairId: ob0.pairId,
    });
    return { id: input.id, status: "ACTIVE" as const };
  });
}
