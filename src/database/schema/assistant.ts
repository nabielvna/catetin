import { index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, ts } from "./columns";
import { party } from "./people";

export const assistantAlias = pgTable(
  "assistant_alias",
  {
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.ownerUserId, t.alias] })],
);

export const assistantThread = pgTable(
  "assistant_thread",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    messages: jsonb("messages").notNull().default([]),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
  },
  (t) => [index("assistant_thread_user_idx").on(t.userId, t.updatedAt)],
);
