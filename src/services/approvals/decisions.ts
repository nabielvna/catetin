import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { Tx } from "@/database/client";
import { approvalRequest, approvalVote } from "@/database/schema/approvals";
import { obligation } from "@/database/schema/debts";
import { groupMember, groups } from "@/database/schema/groups";
import { settlement } from "@/database/schema/payments";
import type { ObligationItemInput, ObligationPatch } from "@/domain/debt";
import { DomainError } from "@/domain/errors";
import type { Currency } from "@/domain/money";
import { recordActivity } from "@/services/activity";
import { type ApprovalRow, closeRequest } from "@/services/approvals/mutations";
import type { Ctx } from "@/services/context";
import { applyPatch, getObligation, markVoid } from "@/services/debts/mutations";
import { reservedAmount } from "@/services/debts/queries";
import { activateRecurringTx, closeRecurringTx, getRecurring } from "@/services/debts/recurring";
import { type Effects } from "@/services/effects";
import { lockGroup } from "@/services/groups/access";
import { executeSimplify } from "@/services/groups/simplify";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { allocationsOf, applyAllocations } from "@/services/payments/allocations";
import { applySettlementVoid, excessRemovable, getSettlement, setExcessStatus } from "@/services/payments/mutations";
import { notifySettled } from "@/services/payments/shared";
import { lockPair } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

type Outcome =
  | { status: "APPROVED"; after?: (tx: Tx, fx: Effects) => Promise<void> }
  | { status: "SUPERSEDED" | "REJECTED"; reason: string };

type Handler = {
  approve: (tx: Tx, ctx: Ctx, req: ApprovalRow) => Promise<Outcome>;
  reject: (tx: Tx, ctx: Ctx, req: ApprovalRow) => Promise<void>;
  cancel: (tx: Tx, ctx: Ctx, req: ApprovalRow) => Promise<void>;
  scope: (tx: Tx, req: ApprovalRow) => Promise<{ partyIds: string[]; url: string; data: Record<string, unknown> }>;
};

const noop = async () => {};

async function obligationScope(tx: Tx, req: ApprovalRow) {
  const ob = await getObligation(tx, req.targetId);
  return {
    partyIds: [ob.creditorId, ob.debtorId],
    url: `/debts/${ob.id}`,
    data: { title: ob.title, amount: ob.amount, currency: ob.currency },
  };
}

async function settlementScope(tx: Tx, req: ApprovalRow) {
  const s = await getSettlement(tx, req.targetId);
  return {
    partyIds: [s.payerId, s.payeeId],
    url: `/payments/${s.id}`,
    data: { amount: s.amount, currency: s.currency },
  };
}

async function groupScope(tx: Tx, req: ApprovalRow) {
  const [g] = await tx.select().from(groups).where(eq(groups.id, req.groupId!));
  const members = await tx
    .select({ partyId: groupMember.partyId })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, req.groupId!), inArray(groupMember.status, ["ACTIVE", "PENDING"])));
  return {
    partyIds: members.map((m) => m.partyId),
    url: `/groups/${req.groupId}`,
    data: { groupName: g?.name, mode: (req.payload as { mode?: string }).mode },
  };
}

async function recurringScope(tx: Tx, req: ApprovalRow) {
  const r = await getRecurring(tx, req.targetId);
  return {
    partyIds: [r.creditorId, r.debtorId],
    url: `/people/${req.requestedByParty ?? r.creditorId}`,
    data: { title: r.title, amount: r.amount, currency: r.currency },
  };
}

const withdrawObligation = async (tx: Tx, ctx: Ctx, req: ApprovalRow) => {
  await tx
    .update(obligation)
    .set({ status: "VOID", closedAt: ctx.now, updatedAt: ctx.now })
    .where(and(eq(obligation.id, req.targetId), eq(obligation.status, "PENDING")));
};

const handlers: Record<ApprovalRow["kind"], Handler> = {
  GROUP_SIMPLIFY: {
    async approve(_tx, ctx, req) {
      const p = req.payload as { currency: Currency; fingerprint: string };
      return {
        status: "APPROVED",
        after: async (tx2, fx) => {
          const [g] = await tx2.select().from(groups).where(eq(groups.id, req.groupId!));
          const ok = await executeSimplify(tx2, fx, ctx, req.groupId!, g?.name ?? "", p.currency, p.fingerprint);
          if (!ok) {
            await tx2
              .update(approvalRequest)
              .set({ status: "SUPERSEDED", reason: "SUPERSEDED" })
              .where(eq(approvalRequest.id, req.id));
          }
        },
      };
    },
    reject: noop,
    cancel: noop,
    scope: groupScope,
  },

  OBLIGATION_CREATE: {
    async approve(tx, ctx, req) {
      const ob = await getObligation(tx, req.targetId);
      if (ob.status !== "PENDING") return { status: "SUPERSEDED", reason: "INVALID_STATE" };
      await tx
        .update(obligation)
        .set({ status: "ACTIVE", activatedAt: ctx.now, updatedAt: ctx.now })
        .where(eq(obligation.id, ob.id));
      return { status: "APPROVED" };
    },
    async reject(tx, ctx, req) {
      await tx
        .update(obligation)
        .set({ status: "REJECTED", closedAt: ctx.now, updatedAt: ctx.now })
        .where(and(eq(obligation.id, req.targetId), eq(obligation.status, "PENDING")));
    },
    cancel: withdrawObligation,
    scope: obligationScope,
  },

  OBLIGATION_UPDATE: {
    async approve(tx, ctx, req) {
      const ob = await getObligation(tx, req.targetId);
      if (ob.status !== "ACTIVE" || ob.version !== req.baseVersion) {
        return { status: "SUPERSEDED", reason: "SUPERSEDED" };
      }
      const payload = req.payload as { patch: ObligationPatch; items: ObligationItemInput[] | null };
      const newAmount = payload.patch.amount ?? ob.amount;
      if (newAmount < ob.paid + (await reservedAmount(tx, ob.id))) {
        return { status: "SUPERSEDED", reason: "AMOUNT_BELOW_PAID" };
      }
      return { status: "APPROVED", after: async (tx2) => applyPatch(tx2, ctx, ob, payload.patch, payload.items) };
    },
    reject: noop,
    cancel: noop,
    scope: obligationScope,
  },

  OBLIGATION_VOID: {
    async approve(tx, ctx, req) {
      const ob = await getObligation(tx, req.targetId);
      if (ob.status !== "ACTIVE") return { status: "SUPERSEDED", reason: "INVALID_STATE" };
      if (ob.paid > 0 || (await reservedAmount(tx, ob.id)) > 0) {
        return { status: "SUPERSEDED", reason: "HAS_PAYMENTS" };
      }
      return { status: "APPROVED", after: async (tx2) => markVoid(tx2, ctx, ob) };
    },
    reject: noop,
    cancel: noop,
    scope: obligationScope,
  },

  SETTLEMENT_CREATE: {
    async approve(tx, ctx, req) {
      const s = await getSettlement(tx, req.targetId);
      if (s.status !== "PENDING") return { status: "SUPERSEDED", reason: "INVALID_STATE" };
      const allocations = await allocationsOf(tx, s.id);

      const obs = await tx
        .select()
        .from(obligation)
        .where(
          inArray(
            obligation.id,
            allocations.map((a) => a.obligationId),
          ),
        );
      for (const a of allocations) {
        const ob = obs.find((o) => o.id === a.obligationId);
        if (!ob || ob.status !== "ACTIVE" || ob.paid + a.amount > ob.amount) {
          await tx.update(settlement).set({ status: "REJECTED", closedAt: ctx.now }).where(eq(settlement.id, s.id));
          return { status: "REJECTED", reason: "OVERPAY" };
        }
      }
      return {
        status: "APPROVED",
        after: async (tx2, fx) => {
          await tx2.update(settlement).set({ status: "ACTIVE", activatedAt: ctx.now }).where(eq(settlement.id, s.id));
          const settled = await applyAllocations(tx2, allocations, ctx.now);
          await setExcessStatus(tx2, s.id, "ACTIVE", ctx.now);
          await notifySettled(tx2, fx, ctx, settled);
        },
      };
    },
    async reject(tx, ctx, req) {
      await tx
        .update(settlement)
        .set({ status: "REJECTED", closedAt: ctx.now })
        .where(and(eq(settlement.id, req.targetId), eq(settlement.status, "PENDING")));
      await setExcessStatus(tx, req.targetId, "REJECTED", ctx.now);
    },
    async cancel(tx, ctx, req) {
      await tx
        .update(settlement)
        .set({ status: "CANCELLED", closedAt: ctx.now })
        .where(and(eq(settlement.id, req.targetId), eq(settlement.status, "PENDING")));
      await setExcessStatus(tx, req.targetId, "VOID", ctx.now);
    },
    scope: settlementScope,
  },

  SETTLEMENT_VOID: {
    async approve(tx, ctx, req) {
      const s = await getSettlement(tx, req.targetId);
      if (s.status !== "ACTIVE") return { status: "SUPERSEDED", reason: "INVALID_STATE" };
      if (!(await excessRemovable(tx, s.id))) return { status: "SUPERSEDED", reason: "HAS_PAYMENTS" };
      return { status: "APPROVED", after: async (tx2) => applySettlementVoid(tx2, ctx, s) };
    },
    reject: noop,
    cancel: noop,
    scope: settlementScope,
  },

  RECURRING_CREATE: {
    async approve(tx, _ctx, req) {
      const r = await getRecurring(tx, req.targetId);
      if (r.status !== "PENDING") return { status: "SUPERSEDED", reason: "INVALID_STATE" };
      return { status: "APPROVED", after: (tx2, fx) => activateRecurringTx(tx2, fx, r.id, _ctx.now) };
    },
    async reject(tx, ctx, req) {
      await closeRecurringTx(tx, req.targetId, "REJECTED", ctx.now);
    },
    async cancel(tx, ctx, req) {
      await closeRecurringTx(tx, req.targetId, "STOPPED", ctx.now);
    },
    scope: recurringScope,
  },

  GROUP_MODE: {
    async approve(_tx, ctx, req) {
      const mode = (req.payload as { mode: "CONFIRM" | "TRUST" }).mode;
      return {
        status: "APPROVED",
        after: async (tx2) => {
          await tx2
            .update(groups)
            .set({ mode, trustSince: mode === "TRUST" ? ctx.now : null })
            .where(eq(groups.id, req.groupId!));
        },
      };
    },
    reject: noop,
    cancel: noop,
    scope: groupScope,
  },

  GROUP_JOIN: {
    async approve(_tx, ctx, req) {
      const partyId = (req.payload as { partyId: string }).partyId;
      return {
        status: "APPROVED",
        after: async (tx2) => {
          await tx2
            .update(groupMember)
            .set({ status: "ACTIVE", joinedAt: ctx.now })
            .where(
              and(
                eq(groupMember.groupId, req.groupId!),
                eq(groupMember.partyId, partyId),
                eq(groupMember.status, "PENDING"),
              ),
            );
        },
      };
    },
    async reject(tx, ctx, req) {
      const partyId = (req.payload as { partyId: string }).partyId;
      await tx
        .update(groupMember)
        .set({ status: "REMOVED", leftAt: ctx.now })
        .where(
          and(
            eq(groupMember.groupId, req.groupId!),
            eq(groupMember.partyId, partyId),
            eq(groupMember.status, "PENDING"),
          ),
        );
    },
    async cancel(tx, ctx, req) {
      await handlers.GROUP_JOIN.reject(tx, ctx, req);
    },
    scope: groupScope,
  },
};

async function lockForRequest(tx: Tx, requestId: string): Promise<ApprovalRow> {
  const [r0] = await tx.select().from(approvalRequest).where(eq(approvalRequest.id, requestId));
  if (!r0) throw new DomainError("NOT_FOUND");
  if (r0.pairId) await lockPair(tx, r0.pairId);
  else if (r0.groupId) await lockGroup(tx, r0.groupId);
  const [req] = await tx.select().from(approvalRequest).where(eq(approvalRequest.id, requestId)).for("update");
  return req!;
}

const ACTIVITY_BY_KIND: Record<ApprovalRow["kind"], string> = {
  OBLIGATION_CREATE: "OBLIGATION",
  OBLIGATION_UPDATE: "OBLIGATION_CHANGE",
  OBLIGATION_VOID: "OBLIGATION_VOID",
  SETTLEMENT_CREATE: "SETTLEMENT",
  SETTLEMENT_VOID: "SETTLEMENT_VOID",
  GROUP_MODE: "GROUP_MODE",
  GROUP_JOIN: "GROUP_JOIN",
  GROUP_SIMPLIFY: "GROUP_SIMPLIFY",
  RECURRING_CREATE: "RECURRING",
};

export type DecideInput = { requestId: string; decision: "APPROVE" | "REJECT"; reason?: string | null };
export type DecideResult = { status: ApprovalRow["status"] };

export function decideRequest(ctx: Ctx, input: DecideInput): Promise<DecideResult> {
  return mutate(async (tx, fx) => {
    const req = await lockForRequest(tx, input.requestId);
    const [vote] = await tx
      .select()
      .from(approvalVote)
      .where(and(eq(approvalVote.requestId, req.id), eq(approvalVote.partyId, ctx.actor.partyId)));
    if (!vote) throw new DomainError("NOT_FOUND");
    if (req.status !== "PENDING" || vote.decision !== "PENDING") throw new DomainError("ALREADY_DECIDED");

    const decision = input.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    await tx
      .update(approvalVote)
      .set({ decision, decidedBy: ctx.actor.userId, decidedAt: ctx.now })
      .where(and(eq(approvalVote.requestId, req.id), eq(approvalVote.partyId, ctx.actor.partyId)));

    const handler = handlers[req.kind];
    const scope = await handler.scope(tx, req);
    const reason = input.reason?.trim().slice(0, 500) || null;

    let final: ApprovalRow["status"] = "PENDING";
    if (decision === "REJECTED") {
      await closeRequest(tx, req.id, "REJECTED", ctx.now, reason);
      await handler.reject(tx, ctx, req);
      final = "REJECTED";
    } else {
      const quorum = (req.payload as { quorum?: string }).quorum ?? "ALL";
      const votes = await tx.select().from(approvalVote).where(eq(approvalVote.requestId, req.id));
      const done = quorum === "ANY" || votes.every((v) => v.decision === "APPROVED");
      if (done) {
        const outcome = await handler.approve(tx, ctx, req);
        if (outcome.status === "APPROVED") {
          await closeRequest(tx, req.id, "APPROVED", ctx.now);
          await outcome.after?.(tx, fx);
        } else {
          await closeRequest(tx, req.id, outcome.status, ctx.now, outcome.reason);
          if (outcome.status === "REJECTED") await handler.reject(tx, ctx, req);
        }
        final = outcome.status;
      }
    }

    if (final !== "PENDING") {
      const activityId = await recordActivity(tx, ctx, {
        type: `${ACTIVITY_BY_KIND[req.kind]}_${final}`,
        pairId: req.pairId,
        groupId: req.groupId,
        targetType: req.targetType as "OBLIGATION",
        targetId: req.targetId,
        data: { requestId: req.id, reason, kind: req.kind },
      });
      await notifyParties(tx, fx, ctx, {
        type: final === "APPROVED" ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
        partyIds: req.requestedByParty ? [req.requestedByParty] : [],
        activityId,
        url: scope.url,
        data: {
          ...(scope.data as object),
          decision: final === "APPROVED" ? "APPROVED" : "REJECTED",
          reason: final === "SUPERSEDED" ? `system:${(await reasonOf(tx, req.id)) ?? ""}` : reason,
          changes: [req.kind],
        },
      });
      if (req.kind === "GROUP_MODE" && final === "APPROVED") {
        await notifyParties(tx, fx, ctx, {
          type: "GROUP_MODE_CHANGED",
          partyIds: scope.partyIds,
          url: scope.url,
          data: scope.data as object,
          includeActor: false,
        });
      }
    }
    await refreshScope(tx, fx, { partyIds: scope.partyIds, groupId: req.groupId, pairId: req.pairId });
    return { status: final };
  });
}

async function reasonOf(tx: Tx, id: string) {
  const [r] = await tx
    .select({ reason: approvalRequest.reason })
    .from(approvalRequest)
    .where(eq(approvalRequest.id, id));
  return r?.reason;
}

export function cancelRequest(ctx: Ctx, input: { requestId: string }): Promise<void> {
  return mutate(async (tx, fx) => {
    const req = await lockForRequest(tx, input.requestId);
    if (req.requestedByParty !== ctx.actor.partyId) throw new DomainError("NOT_FOUND");
    if (req.status !== "PENDING") throw new DomainError("ALREADY_DECIDED");
    await closeRequest(tx, req.id, "CANCELLED", ctx.now);
    const handler = handlers[req.kind];
    await handler.cancel(tx, ctx, req);
    const scope = await handler.scope(tx, req);
    await recordActivity(tx, ctx, {
      type: `${ACTIVITY_BY_KIND[req.kind]}_CANCELLED`,
      pairId: req.pairId,
      groupId: req.groupId,
      targetType: req.targetType as "OBLIGATION",
      targetId: req.targetId,
      data: { requestId: req.id, kind: req.kind },
    });
    await refreshScope(tx, fx, { partyIds: scope.partyIds, groupId: req.groupId, pairId: req.pairId });
  });
}
