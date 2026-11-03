import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { obligation } from "@/database/schema/debts";
import { settlement, settlementAllocation } from "@/database/schema/payments";
import { type Allocation, planAutoAllocation, planWithExcess, validateManualAllocation } from "@/domain/allocation";
import { type LocalDate } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { convert, type Currency, isValidRate, type Minor } from "@/domain/money";
import { assertCommon, type PaymentMethod } from "@/domain/payment";
import { requiredApprovers } from "@/domain/policy";
import { messagesFor } from "@/i18n/messages";
import { newId } from "@/lib/server/ids";
import { recordActivity } from "@/services/activity";
import { closeRequest, openRequest, pendingRequestFor } from "@/services/approvals/mutations";
import type { Ctx } from "@/services/context";
import { createObligationTx } from "@/services/debts/mutations";
import { type Effects } from "@/services/effects";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { allocationsOf, applyAllocations, openObligations, rollbackAllocations } from "@/services/payments/allocations";
import {
  existingSettlement,
  notifySettled,
  type SettlementResult,
  type SettlementRow,
  trustGroupOf,
} from "@/services/payments/shared";
import { getParties, isActiveUser, lockPair, otherParty, touchPair } from "@/services/people/parties";
import { recordTrustActions, trustSinceOf } from "@/services/people/trust";
import { mutate } from "@/services/transaction";

export async function excessOf(tx: DbOrTx, settlementId: string) {
  const [row] = await tx.select().from(obligation).where(eq(obligation.sourceSettlementId, settlementId));
  return row;
}

export async function excessRemovable(tx: DbOrTx, settlementId: string): Promise<boolean> {
  const ex = await excessOf(tx, settlementId);
  if (!ex || ex.status === "VOID" || ex.status === "REJECTED") return true;
  if (ex.paid > 0) return false;
  const [r] = await tx
    .select({ n: sql<string>`count(*)` })
    .from(settlementAllocation)
    .innerJoin(settlement, eq(settlement.id, settlementAllocation.settlementId))
    .where(and(eq(settlementAllocation.obligationId, ex.id), eq(settlement.status, "PENDING")));
  return Number(r?.n ?? 0) === 0;
}

export async function setExcessStatus(
  tx: Tx,
  settlementId: string,
  status: "ACTIVE" | "REJECTED" | "VOID",
  now: Date,
): Promise<void> {
  const ex = await excessOf(tx, settlementId);
  if (!ex) return;
  if (status === "ACTIVE") {
    if (ex.status !== "PENDING" && ex.status !== "VOID") return;
    await tx
      .update(obligation)
      .set({ status: "ACTIVE", activatedAt: now, closedAt: null, updatedAt: now, version: ex.version + 1 })
      .where(eq(obligation.id, ex.id));
    return;
  }
  if (ex.status !== "PENDING" && ex.status !== "ACTIVE") return;
  await tx
    .update(obligation)
    .set({ status, closedAt: now, updatedAt: now, version: ex.version + 1 })
    .where(eq(obligation.id, ex.id));
}

export type RecordPaymentInput = {
  id: string;
  pairId: string;

  payerId: string;
  amount: Minor;
  currency: Currency;
  method: PaymentMethod;
  paidOn: LocalDate;
  note?: string | null;

  counterCurrency?: Currency | null;
  rate?: string | null;

  allocations?: Allocation[] | null;

  groupId?: string | null;

  allowExcess?: boolean;
};

export function recordPayment(ctx: Ctx, input: RecordPaymentInput): Promise<SettlementResult> {
  return mutate((tx, fx) => recordPaymentTx(tx, fx, ctx, input));
}

export async function recordPaymentTx(
  tx: Tx,
  fx: Effects,
  ctx: Ctx,
  input: RecordPaymentInput,
): Promise<SettlementResult> {
  assertCommon(input);
  const existing = await existingSettlement(tx, ctx, input.id);
  if (existing) return { id: existing.id, status: existing.status };

  const pairRow = await lockPair(tx, input.pairId);
  const me = ctx.actor.partyId;
  if (pairRow.partyLow !== me && pairRow.partyHigh !== me) throw new DomainError("NOT_FOUND");
  if (input.payerId !== pairRow.partyLow && input.payerId !== pairRow.partyHigh) {
    throw new DomainError("INVALID_INPUT", { field: "payerId" });
  }
  const payeeId = otherParty(pairRow, input.payerId);

  const target = (input.counterCurrency ?? input.currency) as Currency;
  let targetAmount = input.amount;
  if (input.counterCurrency && input.counterCurrency !== input.currency) {
    if (!input.rate || !isValidRate(input.rate)) throw new DomainError("INVALID_RATE");
    targetAmount = convert(input.amount, input.currency, input.counterCurrency, input.rate);
    if (targetAmount <= 0) throw new DomainError("INVALID_RATE");
  }

  const open = await openObligations(tx, pairRow.id, {
    debtorId: input.payerId,
    currency: target,
    groupId: input.groupId ?? undefined,
  });
  let allocations: Allocation[];
  let excess = 0;
  if (input.allowExcess) {
    ({ allocations, excess } = planWithExcess(open, targetAmount, input.allocations));
  } else {
    allocations =
      input.allocations && input.allocations.length > 0
        ? validateManualAllocation(open, input.allocations, targetAmount)
        : planAutoAllocation(open, targetAmount);
  }

  const allocated = open.filter((o) => allocations.some((a) => a.obligationId === o.id));
  const {
    groupId,
    trust,
    trustSince: groupTrustSince,
  } = await trustGroupOf(
    tx,
    allocated.map((o) => o.groupId),
  );

  const parties = await getParties(tx, [input.payerId, payeeId]);
  const payer = parties.get(input.payerId)!;
  const payee = parties.get(payeeId)!;
  const { approvers, trusted } = requiredApprovers({
    action: { kind: "PAYMENT_CREATE" },
    actorPartyId: me,
    creditor: { id: payeeId, isUser: isActiveUser(payee) },
    debtor: { id: input.payerId, isUser: isActiveUser(payer) },
    groupMode: trust ? "TRUST" : null,
    groupTrustSince,
    trustSince: trustSinceOf(pairRow),
  });
  const status = approvers.length > 0 ? "PENDING" : "ACTIVE";
  const cross = target !== input.currency;

  await tx
    .insert(settlement)
    .values({
      id: input.id,
      pairId: pairRow.id,
      kind: "PAYMENT",
      method: input.method,
      payerId: input.payerId,
      payeeId,
      amount: input.amount,
      currency: input.currency,
      counterCurrency: cross ? target : null,
      counterAmount: cross ? targetAmount : null,
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
  await tx
    .insert(settlementAllocation)
    .values(allocations.map((a) => ({ settlementId: input.id, obligationId: a.obligationId, amount: a.amount })));

  let settled: string[] = [];
  if (status === "ACTIVE") settled = await applyAllocations(tx, allocations, ctx.now);
  else {
    await openRequest(tx, ctx, {
      kind: "SETTLEMENT_CREATE",
      pairId: pairRow.id,
      groupId,
      targetType: "SETTLEMENT",
      targetId: input.id,
      payload: excess > 0 ? { excess, excessCurrency: target } : {},
      approvers,
    });
  }

  if (excess > 0) {
    await createObligationTx(
      tx,
      fx,
      ctx,
      {
        id: newId(),
        creditorId: input.payerId,
        debtorId: payeeId,
        amount: excess,
        currency: target,
        title: messagesFor(ctx.actor.locale).payment.excessTitle,
        occurredOn: input.paidOn,
        groupId,
      },
      { sourceSettlementId: input.id, forceStatus: status, trustedRelation: true, silent: true },
    );
  }

  const data = { amount: input.amount, currency: input.currency };
  const activityId = await recordActivity(tx, ctx, {
    type: status === "PENDING" ? "PAYMENT_PROPOSED" : "PAYMENT_RECORDED",
    pairId: pairRow.id,
    groupId,
    targetType: "SETTLEMENT",
    targetId: input.id,
    data: { ...data, method: input.method, allocations },
  });
  await touchPair(tx, pairRow.id, ctx.now);
  await notifyParties(tx, fx, ctx, {
    type: status === "PENDING" ? "SETTLEMENT_PROPOSED" : "SETTLEMENT_RECORDED",
    partyIds: [input.payerId, payeeId].filter((p) => !trusted.includes(p)),
    activityId,
    url: `/payments/${input.id}`,
    data,
    creditorId: payeeId,
    debtorId: input.payerId,
  });
  await recordTrustActions(tx, fx, ctx, {
    pairId: pairRow.id,
    kind: "SETTLEMENT_CREATE",
    targetType: "SETTLEMENT",
    targetId: input.id,
    trusted,
    display: data,
    url: `/payments/${input.id}`,
  });
  await notifySettled(tx, fx, ctx, settled);
  await refreshScope(tx, fx, { partyIds: [input.payerId, payeeId], groupId, pairId: pairRow.id });
  return { id: input.id, status, excess };
}

export type VoidSettlementResult = { status: "VOIDED" | "WITHDRAWN" | "PROPOSED" };

export function voidSettlement(ctx: Ctx, input: { id: string; reason?: string | null }): Promise<VoidSettlementResult> {
  return mutate(async (tx, fx) => {
    const [s0] = await tx.select().from(settlement).where(eq(settlement.id, input.id));
    if (!s0) throw new DomainError("NOT_FOUND");
    const pairRow = await lockPair(tx, s0.pairId);
    const [s] = await tx.select().from(settlement).where(eq(settlement.id, input.id));
    const me = ctx.actor.partyId;
    if (!s || (s.payerId !== me && s.payeeId !== me)) throw new DomainError("NOT_FOUND");
    const scope = { partyIds: [s.payerId, s.payeeId], groupId: s.groupId, pairId: s.pairId };

    if (s.status === "PENDING") {
      if (s.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_STATE");
      await tx.update(settlement).set({ status: "CANCELLED", closedAt: ctx.now }).where(eq(settlement.id, s.id));
      await setExcessStatus(tx, s.id, "VOID", ctx.now);
      const req = await pendingRequestFor(tx, "SETTLEMENT", s.id);
      if (req) await closeRequest(tx, req.id, "CANCELLED", ctx.now);
      await recordActivity(tx, ctx, {
        type: "SETTLEMENT_WITHDRAWN",
        pairId: s.pairId,
        groupId: s.groupId,
        targetType: "SETTLEMENT",
        targetId: s.id,
      });
      await refreshScope(tx, fx, scope);
      return { status: "WITHDRAWN" };
    }
    if (s.status !== "ACTIVE" || s.kind === "NETTING") throw new DomainError("INVALID_STATE");
    if (await pendingRequestFor(tx, "SETTLEMENT", s.id)) throw new DomainError("CHANGE_PENDING");

    if (!(await excessRemovable(tx, s.id))) throw new DomainError("HAS_PAYMENTS");

    const parties = await getParties(tx, [s.payerId, s.payeeId]);
    const sGroup = await trustGroupOf(tx, [s.groupId]);
    const { approvers, trusted } = requiredApprovers({
      action: { kind: "SETTLEMENT_VOID", settlementKind: s.kind as "PAYMENT" },
      actorPartyId: me,
      creditor: { id: s.payeeId, isUser: isActiveUser(parties.get(s.payeeId)!) },
      debtor: { id: s.payerId, isUser: isActiveUser(parties.get(s.payerId)!) },
      groupMode: sGroup.trust ? "TRUST" : null,
      groupTrustSince: sGroup.trustSince,
      trustSince: trustSinceOf(pairRow),
      targetCreatedAt: s.createdAt,
    });

    if (approvers.length === 0) {
      await applySettlementVoid(tx, ctx, s);
      const activityId = await recordActivity(tx, ctx, {
        type: "SETTLEMENT_VOIDED",
        pairId: s.pairId,
        groupId: s.groupId,
        targetType: "SETTLEMENT",
        targetId: s.id,
        data: { amount: s.amount, currency: s.currency, reason: input.reason ?? null },
      });
      await notifyParties(tx, fx, ctx, {
        type: "SETTLEMENT_VOIDED",
        partyIds: [s.payerId, s.payeeId].filter((p) => !trusted.includes(p)),
        activityId,
        url: `/payments/${s.id}`,
        data: { amount: s.amount, currency: s.currency, reason: input.reason ?? null },
      });
      await recordTrustActions(tx, fx, ctx, {
        pairId: s.pairId,
        kind: "SETTLEMENT_VOID",
        targetType: "SETTLEMENT",
        targetId: s.id,
        trusted,
        display: { amount: s.amount, currency: s.currency },
        url: `/payments/${s.id}`,
      });
      await refreshScope(tx, fx, scope);
      return { status: "VOIDED" };
    }

    await openRequest(tx, ctx, {
      kind: "SETTLEMENT_VOID",
      pairId: s.pairId,
      groupId: s.groupId,
      targetType: "SETTLEMENT",
      targetId: s.id,
      payload: { reason: input.reason ?? null },
      approvers,
    });
    const activityId = await recordActivity(tx, ctx, {
      type: "SETTLEMENT_VOID_PROPOSED",
      pairId: s.pairId,
      groupId: s.groupId,
      targetType: "SETTLEMENT",
      targetId: s.id,
      data: { reason: input.reason ?? null },
    });
    await notifyParties(tx, fx, ctx, {
      type: "SETTLEMENT_VOID_PROPOSED",
      partyIds: approvers,
      activityId,
      url: `/payments/${s.id}`,
      data: { amount: s.amount, currency: s.currency, reason: input.reason ?? null },
    });
    await refreshScope(tx, fx, scope);
    return { status: "PROPOSED" };
  });
}

export async function applySettlementVoid(tx: Tx, ctx: Ctx, s: SettlementRow) {
  await rollbackAllocations(tx, await allocationsOf(tx, s.id), ctx.now);
  await tx
    .update(settlement)
    .set({ status: "VOID", closedAt: ctx.now })
    .where(and(eq(settlement.id, s.id), eq(settlement.status, "ACTIVE")));
  await setExcessStatus(tx, s.id, "VOID", ctx.now);
}

export async function getSettlement(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(settlement).where(eq(settlement.id, id));
  if (!row) throw new DomainError("NOT_FOUND");
  return row;
}
