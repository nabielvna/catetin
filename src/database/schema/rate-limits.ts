import { integer, pgTable, text } from "drizzle-orm/pg-core";

import { ts } from "./columns";

export const appRateLimit = pgTable("app_rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowEnd: ts("window_end").notNull(),
});
