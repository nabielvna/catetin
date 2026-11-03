import "server-only";

import { and, eq, inArray, lt, sql } from "drizzle-orm";

import type { DbOrTx, Tx } from "@/database/client";
import { obligation } from "@/database/schema/debts";
import { settlement, settlementAllocation } from "@/database/schema/payments";
import { type Allocation, type OpenObligation } from "@/domain/allocation";
import { DomainError } from "@/domain/errors";
import { effectiveDueOn, isInstallmentPlan } from "@/domain/installments";
import { type Currency, type Minor } from "@/domain/money";

export type OpenObligationRow = OpenObligation & {
  currency: Currency;
  groupId: string | null;
  amount: Minor;
  paid: Minor;
  creditorId: string;
  debtorId: string;
  title: string;
};

export async function openObligations(
  tx: DbOrTx,
  pairId: string,
  filter: { debtorId?: string; currency?: Currency; groupId?: string | null; ids?: string[] } = {},
): Promise<OpenObligationRow[]> {
  const conds = [
    eq(obligation.pairId, pairId),
    eq(obligation.status, "ACTIVE"),
    lt(obligation.paid, obligation.amount),
  ];
  if (filter.debtorId) conds.push(eq(obligation.debtorId, filter.debtorId));
  if (filter.currency) conds.push(eq(obligation.currency, filter.currency));
  if (filter.groupId) conds.push(eq(obligation.groupId, filter.groupId));
  if (filter.ids) conds.push(inArray(obligation.id, filter.ids));

  const reserved = tx
    .select({
      obligationId: settlementAllocation.obligationId,
      reserved: sql<string>`sum(${settlementAllocation.amount})`.as("reserved"),
    })
    .from(settlementAllocation)
    .innerJoin(settlement, eq(settlement.id, settlementAllocation.settlementId))
    .where(eq(settlement.status, "PENDING"))
    .groupBy(settlementAllocation.obligationId)
    .as("r");

  const rows = await tx
    .select({
      id: obligation.id,
      amount: obligation.amount,
      paid: obligation.paid,
      currency: obligation.currency,
      dueOn: obligation.dueOn,
      occurredOn: obligation.occurredOn,
      createdAt: obligation.createdAt,
      groupId: obligation.groupId,
      creditorId: obligation.creditorId,
      debtorId: obligation.debtorId,
      title: obligation.title,
      reserved: reserved.reserved,
    })
    .from(obligation)
    .leftJoin(reserved, eq(reserved.obligationId, obligation.id))
    .where(and(...conds));

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    paid: r.paid,
    currency: r.currency as Currency,
    dueOn: r.dueOn,
    occurredOn: r.occurredOn,
    createdAt: r.createdAt.getTime(),
    groupId: r.groupId,
    creditorId: r.creditorId,
    debtorId: r.debtorId,
    title: r.title,
    available: r.amount - r.paid - Number(r.reserved ?? 0),
  }));
}

export async function applyAllocations(tx: Tx, allocations: Allocation[], now: Date): Promise<string[]> {
  const settled: string[] = [];
  for (const a of allocations) {
    const [row] = await tx
      .update(obligation)
      .set({ paid: sql`${obligation.paid} + ${a.amount}`, updatedAt: now })
      .where(
        and(
          eq(obligation.id, a.obligationId),
          eq(obligation.status, "ACTIVE"),
          sql`${obligation.paid} + ${a.amount} <= ${obligation.amount}`,
        ),
      )
      .returning({ paid: obligation.paid, amount: obligation.amount, installments: obligation.installments });
    if (!row) throw new DomainError("OVERPAY");
    if (row.paid === row.amount) {
      settled.push(a.obligationId);
      await tx.update(obligation).set({ closedAt: now }).where(eq(obligation.id, a.obligationId));
    }
    await syncInstallmentDue(tx, a.obligationId, row);
  }
  return settled;
}

async function syncInstallmentDue(
  tx: Tx,
  id: string,
  row: { amount: Minor; paid: Minor; installments: unknown },
): Promise<void> {
  if (!isInstallmentPlan(row.installments)) return;
  await tx
    .update(obligation)
    .set({ dueOn: effectiveDueOn(row.amount, row.installments, null, row.paid) })
    .where(eq(obligation.id, id));
}

export async function rollbackAllocations(tx: Tx, allocations: Allocation[], now: Date) {
  for (const a of allocations) {
    const [row] = await tx
      .update(obligation)
      .set({ paid: sql`${obligation.paid} - ${a.amount}`, updatedAt: now, closedAt: null })
      .where(and(eq(obligation.id, a.obligationId), sql`${obligation.paid} >= ${a.amount}`))
      .returning({
        id: obligation.id,
        paid: obligation.paid,
        amount: obligation.amount,
        installments: obligation.installments,
      });
    if (!row) throw new Error(`rollback failed for ${a.obligationId}`);
    await syncInstallmentDue(tx, a.obligationId, row);
  }
}

export async function allocationsOf(tx: DbOrTx, settlementId: string): Promise<Allocation[]> {
  const rows = await tx
    .select({ obligationId: settlementAllocation.obligationId, amount: settlementAllocation.amount })
    .from(settlementAllocation)
    .where(eq(settlementAllocation.settlementId, settlementId));
  return rows;
}
