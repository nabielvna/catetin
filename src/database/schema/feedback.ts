import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt } from "./columns";

export const feedback = pgTable("feedback", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
  message: text("message").notNull(),
  context: jsonb("context"),
  createdAt: createdAt(),
});
