import "server-only";

import { db, type Tx } from "@/database/client";

export function transaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(operation);
}
