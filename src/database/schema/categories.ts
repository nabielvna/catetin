import { integer, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, ts } from "./columns";

export const categoryMemory = pgTable(
  "category_memory",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    category: text("category").notNull(),
    hits: integer("hits").notNull().default(1),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.token, t.category] })],
);

export const categoryAiCache = pgTable("category_ai_cache", {
  titleKey: text("title_key").primaryKey(),
  category: text("category"),
  createdAt: createdAt(),
});
