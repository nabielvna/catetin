import "server-only";

import type { DbOrTx } from "@/database/client";
import { maxOffset } from "@/domain/allocation";
import { type Currency } from "@/domain/money";
import { type OpenObligationRow, openObligations } from "@/services/payments/allocations";

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
