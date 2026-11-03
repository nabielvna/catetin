import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { DbOrTx } from "@/database/client";
import { settlement, settlementAllocation } from "@/database/schema/index";
import { type Minor } from "@/domain/money";

export async function reservedAmount(tx: DbOrTx, obligationId: string): Promise<Minor> {
  const [row] = await tx
    .select({ n: sql<string>`coalesce(sum(${settlementAllocation.amount}), 0)` })
    .from(settlementAllocation)
    .innerJoin(settlement, eq(settlement.id, settlementAllocation.settlementId))
    .where(and(eq(settlementAllocation.obligationId, obligationId), eq(settlement.status, "PENDING")));
  return Number(row?.n ?? 0);
}
