import { char, date, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { ts } from "./columns";

export const fxRate = pgTable(
  "fx_rate",
  {
    day: date("day", { mode: "string" }).notNull(),
    base: char("base", { length: 3 }).notNull(),
    quote: char("quote", { length: 3 }).notNull(),
    rate: text("rate").notNull(),
    source: text("source").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.day, t.base, t.quote] })],
);
