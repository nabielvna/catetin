import "server-only";

import { and, eq, lte } from "drizzle-orm";

import { db } from "@/database/client";
import { recurring } from "@/database/schema/debts";
import { addDays, todayIn } from "@/domain/dates";
import { log } from "@/lib/server/logger";
import { generateDueTx } from "@/services/debts/recurring";
import { mutate } from "@/services/transaction";

export async function runRecurring(now = new Date()): Promise<number> {
  const horizon = addDays(todayIn("UTC", now), 1);
  const rows = await db
    .select()
    .from(recurring)
    .where(and(eq(recurring.status, "ACTIVE"), lte(recurring.nextOn, horizon)));
  let created = 0;
  for (const r of rows) {
    try {
      created += await mutate((tx, fx) => generateDueTx(tx, fx, r, now));
    } catch (err) {
      log.error({ err, recurringId: r.id }, "recurring generation failed");
    }
  }
  return created;
}
