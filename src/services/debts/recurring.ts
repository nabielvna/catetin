import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { type DbOrTx } from "@/database/client";
import { recurring } from "@/database/schema/index";
import { DomainError } from "@/domain/errors";
import { type Currency } from "@/domain/money";
import { type RecurringPeriod } from "@/domain/recurring";
import { recordActivity } from "@/services/activity";
import { closeRequest, pendingRequestFor } from "@/services/approvals/mutations";
import { type Ctx } from "@/services/context";
import { notifyParties, refreshScope } from "@/services/notifications/parties";
import { lockPair } from "@/services/people/parties";
import { mutate } from "@/services/transaction";

export function stopRecurring(ctx: Ctx, input: { id: string }): Promise<void> {
  return mutate(async (tx, fx) => {
    const [r0] = await tx.select().from(recurring).where(eq(recurring.id, input.id));
    if (!r0) throw new DomainError("NOT_FOUND");
    await lockPair(tx, r0.pairId);
    const [r] = await tx.select().from(recurring).where(eq(recurring.id, input.id)).for("update");
    const me = ctx.actor.partyId;
    if (!r || (r.creditorId !== me && r.debtorId !== me)) throw new DomainError("NOT_FOUND");
    if (r.status !== "ACTIVE" && r.status !== "PENDING") throw new DomainError("INVALID_STATE");
    if (r.status === "PENDING") {
      const req = await pendingRequestFor(tx, "RECURRING", r.id);
      if (req) await closeRequest(tx, req.id, r.createdBy === ctx.actor.userId ? "CANCELLED" : "REJECTED", ctx.now);
    }
    await tx
      .update(recurring)
      .set({ status: "STOPPED", stoppedAt: ctx.now, stoppedBy: me })
      .where(eq(recurring.id, r.id));
    const other = me === r.creditorId ? r.debtorId : r.creditorId;
    const activityId = await recordActivity(tx, ctx, {
      type: "RECURRING_STOPPED",
      pairId: r.pairId,
      groupId: r.groupId,
      targetType: "PARTY",
      targetId: other,
      data: { recurringId: r.id, title: r.title },
    });
    await notifyParties(tx, fx, ctx, {
      type: "RECURRING_STOPPED",
      partyIds: [other],
      activityId,
      url: `/people/${me}`,
      data: { title: r.title, amount: r.amount, currency: r.currency },
    });
    await refreshScope(tx, fx, { partyIds: [r.creditorId, r.debtorId], groupId: r.groupId, pairId: r.pairId });
  });
}

export type RecurringItem = {
  id: string;
  title: string;
  amount: number;
  currency: Currency;
  every: RecurringPeriod;
  nextOn: string;
  status: "PENDING" | "ACTIVE";
  direction: "THEY_OWE" | "I_OWE";
  dueAfterDays: number | null;
  mine: boolean;
};

export async function listRecurringForPair(tx: DbOrTx, pairId: string, me: string, userId: string) {
  const rows = await tx
    .select()
    .from(recurring)
    .where(and(eq(recurring.pairId, pairId), inArray(recurring.status, ["PENDING", "ACTIVE"])))
    .orderBy(recurring.nextOn);
  return rows.map((r): RecurringItem => ({
    id: r.id,
    title: r.title,
    amount: r.amount,
    currency: r.currency as Currency,
    every: r.every as RecurringPeriod,
    nextOn: r.nextOn,
    status: r.status as "PENDING" | "ACTIVE",
    direction: r.creditorId === me ? "THEY_OWE" : "I_OWE",
    dueAfterDays: r.dueAfterDays,
    mine: r.createdBy === userId,
  }));
}
