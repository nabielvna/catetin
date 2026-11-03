import "server-only";

import { eq, inArray } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { obligation } from "@/database/schema/debts";
import { groups } from "@/database/schema/groups";
import { settlement } from "@/database/schema/payments";
import { DomainError } from "@/domain/errors";
import { type Minor } from "@/domain/money";
import type { Ctx } from "@/services/context";
import { type Effects } from "@/services/effects";
import { notifyParties } from "@/services/notifications/parties";
export type SettlementRow = typeof settlement.$inferSelect;

export async function trustGroupOf(
  tx: DbOrTx,
  groupIds: Array<string | null>,
): Promise<{ groupId: string | null; trust: boolean; trustSince: Date | null }> {
  const unique = [...new Set(groupIds)];
  if (unique.length !== 1 || unique[0] === null || unique[0] === undefined) {
    return { groupId: null, trust: false, trustSince: null };
  }
  const [g] = await tx
    .select({ mode: groups.mode, trustSince: groups.trustSince })
    .from(groups)
    .where(eq(groups.id, unique[0]));
  return { groupId: unique[0], trust: g?.mode === "TRUST", trustSince: g?.trustSince ?? null };
}

export async function existingSettlement(tx: Tx, ctx: Ctx, id: string) {
  const [row] = await tx.select().from(settlement).where(eq(settlement.id, id));
  if (!row) return undefined;
  if (row.createdBy !== ctx.actor.userId) throw new DomainError("INVALID_INPUT");
  return row;
}

export async function notifySettled(tx: Tx, fx: Effects, ctx: Ctx, obligationIds: string[]) {
  if (obligationIds.length === 0) return;
  const rows = await tx.select().from(obligation).where(inArray(obligation.id, obligationIds));
  for (const ob of rows) {
    await notifyParties(tx, fx, ctx, {
      type: "OBLIGATION_SETTLED",
      partyIds: [ob.creditorId, ob.debtorId],
      includeActor: true,
      url: `/debts/${ob.id}`,
      data: { title: ob.title, amount: ob.amount, currency: ob.currency },
      creditorId: ob.creditorId,
      debtorId: ob.debtorId,
      counterpartOf: (rid) => (rid === ob.creditorId ? ob.debtorId : ob.creditorId),
    });
  }
}

export type SettlementResult = { id: string; status: SettlementRow["status"]; excess?: Minor };
