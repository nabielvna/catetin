import "server-only";

import type { Tx } from "@/database/client";
import { transaction } from "@/database/transaction";
import { Effects } from "@/services/effects";

export { Effects } from "@/services/effects";

export async function mutate<T>(operation: (tx: Tx, effects: Effects) => Promise<T>): Promise<T> {
  const effects = new Effects();
  const result = await transaction((tx) => operation(tx, effects));
  await effects.flush();
  return result;
}
