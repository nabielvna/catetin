import { sql } from "drizzle-orm";
import { index, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt } from "./columns";
import { obligation } from "./debts";

export const label = pgTable(
  "label",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("label_owner_name_uq").on(t.ownerUserId, sql`lower(${t.name})`)],
);

export const obligationLabel = pgTable(
  "obligation_label",
  {
    labelId: uuid("label_id")
      .notNull()
      .references(() => label.id, { onDelete: "cascade" }),
    obligationId: uuid("obligation_id")
      .notNull()
      .references(() => obligation.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.labelId, t.obligationId] }),
    index("obligation_label_obligation_idx").on(t.obligationId),
  ],
);
