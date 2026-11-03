import { char, check, index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList, ts } from "./columns";
import { party } from "./people";

export const GROUP_MODES = ["CONFIRM", "TRUST"] as const;

export const GROUP_ROLES = ["ADMIN", "MEMBER"] as const;

export const MEMBER_STATUSES = ["INVITED", "PENDING", "ACTIVE", "LEFT", "REMOVED"] as const;

export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    mode: text("mode", { enum: GROUP_MODES }).notNull().default("CONFIRM"),

    trustSince: ts("trust_since"),
    currency: char("currency", { length: 3 }).notNull().default("IDR"),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    archivedAt: ts("archived_at"),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  () => [check("groups_mode_ck", inList("mode", GROUP_MODES))],
);

export const groupMember = pgTable(
  "group_member",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id),
    role: text("role", { enum: GROUP_ROLES }).notNull().default("MEMBER"),

    status: text("status", { enum: MEMBER_STATUSES }).notNull().default("ACTIVE"),
    invitedBy: uuid("invited_by").references(() => user.id, { onDelete: "set null" }),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    leftAt: ts("left_at"),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.partyId] }),
    index("group_member_party_idx").on(t.partyId),
    check("group_member_role_ck", inList("role", GROUP_ROLES)),
    check("group_member_status_ck", inList("status", MEMBER_STATUSES)),
  ],
);
