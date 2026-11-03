import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, ts } from "./columns";

export const file = pgTable(
  "file",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("file_owner_idx").on(t.ownerUserId)],
);

export const ATTACHMENT_TARGETS = ["OBLIGATION", "SETTLEMENT", "BILL"] as const;

export const attachment = pgTable(
  "attachment",
  {
    id: uuid("id").primaryKey(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => file.id),
    targetType: text("target_type", { enum: ATTACHMENT_TARGETS }).notNull(),
    targetId: uuid("target_id").notNull(),
    addedBy: uuid("added_by").references(() => user.id, { onDelete: "set null" }),
    addedAt: ts("added_at").notNull().defaultNow(),
    hiddenAt: ts("hidden_at"),
    hiddenBy: uuid("hidden_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("attachment_target_idx").on(t.targetType, t.targetId), index("attachment_file_idx").on(t.fileId)],
);
