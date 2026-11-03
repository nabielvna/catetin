import "server-only";

import type { DbOrTx } from "@/database/client";
import { settlement, settlementAllocation } from "@/database/schema/payments";
import { maxOffset, planOffset } from "@/domain/allocation";
import { type LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { convert, type Currency, isValidRate, type Minor } from "@/domain/money";
import { assertCommon } from "@/domain/payment";
import { requiredApprovers } from "@/domain/policy";
import { recordActivity } from "@/services/activity";
import { openRequest } from "@/services/approvals/mutations";
import type { Ctx } from "@/services/context";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { applyAllocations, type OpenObligationRow, openObligations } from "@/services/payments/allocations";
import { existingSettlement, notifySettled, type SettlementResult, trustGroupOf } from "@/services/payments/shared";
import { assertNotBlocked } from "@/services/people/blocks";
import { getParties, isActiveUser, lockPair, otherParty, touchPair } from "@/services/people/parties";
import { recordTrustActions, trustSinceOf } from "@/services/people/trust";
import { mutate } from "@/services/transaction";

export type OffsetInput = {
  id: string;
  pairId: string;

  amount: Minor;
  currency: Currency;

  counterCurrency?: Currency | null;
  rate?: string | null;
  paidOn: LocalDate;
  note?: string | null;
};

export async function offsetPreview(tx: DbOrTx, pairId: string, me: string, other: string) {
  const mine = await openObligations(tx, pairId, { debtorId: me });
  const theirs = await openObligations(tx, pairId, { debtorId: other });
  const byCurrency = new Map<Currency, { mine: OpenObligationRow[]; theirs: OpenObligationRow[] }>();
  for (const o of mine) {
    const e = byCurrency.get(o.currency) ?? { mine: [], theirs: [] };
    e.mine.push(o);
    byCurrency.set(o.currency, e);
  }
  for (const o of theirs) {
    const e = byCurrency.get(o.currency) ?? { mine: [], theirs: [] };
    e.theirs.push(o);
    byCurrency.set(o.currency, e);
  }
  return [...byCurrency.entries()]
    .map(([currency, e]) => ({ currency, max: maxOffset(e.mine, e.theirs) }))
    .filter((x) => x.max > 0);
}

export function proposeOffset(ctx: Ctx, input: OffsetInput): Promise<SettlementResult> {
  return mutate(async (tx, fx) => {
    assertCommon(input);
    const existing = await existingSettlement(tx, ctx, input.id);
    if (existing) return { id: existing.id, status: existing.status };
    const pairRow = await lockPair(tx, input.pairId);
    const me = ctx.actor.partyId;
    if (pairRow.partyLow !== me && pairRow.partyHigh !== me) throw new DomainError("NOT_FOUND");
    const other = otherParty(pairRow, me);
    await assertNotBlocked(tx, me, [other]);

    const counter = (input.counterCurrency ?? input.currency) as Currency;
    let counterAmount = input.amount;
    if (counter !== input.currency) {
      if (!input.rate || !isValidRate(input.rate)) throw new DomainError("INVALID_RATE");
      counterAmount = convert(input.amount, input.currency, counter, input.rate);
    }
    const mine = await openObligations(tx, pairRow.id, { debtorId: me, currency: input.currency });
    const theirs = await openObligations(tx, pairRow.id, { debtorId: other, currency: counter });
    const plan = planOffset(mine, theirs, input.amount, counterAmount);
    const allocations = [...plan.a, ...plan.b];

    const parties = await getParties(tx, [me, other]);
    const otherParty_ = parties.get(other)!;
    const allocatedGroups = [...mine, ...theirs]
      .filter((o) => allocations.some((a) => a.obligationId === o.id))
      .map((o) => o.groupId);

    const { groupId, trust, trustSince: groupTrustSince } = await trustGroupOf(tx, allocatedGroups);
    const { approvers, trusted } = requiredApprovers({
      action: { kind: "OFFSET_CREATE" },
      actorPartyId: me,
      creditor: { id: other, isUser: isActiveUser(otherParty_) },
      debtor: { id: me, isUser: true },
      groupMode: trust ? "TRUST" : null,
      groupTrustSince,
      trustSince: trustSinceOf(pairRow),
    });
    const status = approvers.length > 0 ? "PENDING" : "ACTIVE";
    const cross = counter !== input.currency;

    await tx
      .insert(settlement)
      .values({
        id: input.id,
        pairId: pairRow.id,
        kind: "OFFSET",
        payerId: me,
        payeeId: other,
        amount: input.amount,
        currency: input.currency,
        counterCurrency: cross ? counter : null,
        counterAmount: cross ? counterAmount : null,
        rate: cross ? input.rate! : null,
        paidOn: input.paidOn,
        note: input.note?.trim() || null,
        status,
        groupId,
        createdBy: ctx.actor.userId,
        createdVia: ctx.via,
        createdAt: ctx.now,
        activatedAt: status === "ACTIVE" ? ctx.now : null,
      });
    await tx.insert(settlementAllocation).values(allocations.map((a) => ({ settlementId: input.id, ...a })));

    let settled: string[] = [];
    if (status === "ACTIVE") settled = await applyAllocations(tx, allocations, ctx.now);
    else {
      await openRequest(tx, ctx, {
        kind: "SETTLEMENT_CREATE",
        pairId: pairRow.id,
        groupId,
        targetType: "SETTLEMENT",
        targetId: input.id,
        approvers,
      });
    }
    const activityId = await recordActivity(tx, ctx, {
      type: status === "PENDING" ? "OFFSET_PROPOSED" : "OFFSET_RECORDED",
      pairId: pairRow.id,
      groupId,
      targetType: "SETTLEMENT",
      targetId: input.id,
      data: { amount: input.amount, currency: input.currency, allocations },
    });
    await touchPair(tx, pairRow.id, ctx.now);
    await notifyParties(tx, fx, ctx, {
      type: status === "PENDING" ? "OFFSET_PROPOSED" : "SETTLEMENT_RECORDED",
      partyIds: [other].filter((p) => !trusted.includes(p)),
      activityId,
      url: `/payments/${input.id}`,
      data: { amount: input.amount, currency: input.currency },
    });
    await recordTrustActions(tx, fx, ctx, {
      pairId: pairRow.id,
      kind: "SETTLEMENT_CREATE",
      targetType: "SETTLEMENT",
      targetId: input.id,
      trusted,
      display: { amount: input.amount, currency: input.currency },
      url: `/payments/${input.id}`,
    });
    await notifySettled(tx, fx, ctx, settled);
    await refreshScope(tx, fx, { partyIds: [me, other], groupId, pairId: pairRow.id });
    return { id: input.id, status };
  });
}
