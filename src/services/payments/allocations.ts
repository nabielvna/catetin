import "server-only";

import { and, eq, inArray, lt, sql } from "drizzle-orm";

import type { DbOrTx } from "@/database/client";
import { obligation, settlement, settlementAllocation } from "@/database/schema/index";
import { type OpenObligation } from "@/domain/allocation";
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
