import { sql } from "drizzle-orm";
import { bigint, timestamp } from "drizzle-orm/pg-core";

export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const money = (name: string) => bigint(name, { mode: "number" });

export const createdAt = () => ts("created_at").notNull().defaultNow();

export function inList(column: string, values: readonly string[]) {
  return sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`);
}
