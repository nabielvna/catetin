import { sql } from "drizzle-orm";
import { type AnyPgColumn, check, index, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, inList, ts } from "./columns";
import { groups } from "./groups";

export const PARTY_KINDS = ["USER", "MANUAL"] as const;

export const party = pgTable(
  "party",
  {
    id: uuid("id").primaryKey(),
    kind: text("kind", { enum: PARTY_KINDS }).notNull(),

    userId: uuid("user_id").references(() => user.id, { onDelete: "set null" }),
    displayName: text("display_name").notNull(),

    email: text("email"),

    ownerUserId: uuid("owner_user_id").references(() => user.id, { onDelete: "set null" }),

    groupId: uuid("group_id").references((): AnyPgColumn => groups.id, { onDelete: "set null" }),

    mergedInto: uuid("merged_into").references((): AnyPgColumn => party.id),

    archivedAt: ts("archived_at"),

    deletedAt: ts("deleted_at"),
    accountDeletedAt: ts("account_deleted_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("party_user_uq").on(t.userId),
    index("party_owner_idx").on(t.ownerUserId),
    index("party_group_idx").on(t.groupId),
    index("party_name_trgm_idx").using("gin", sql`${t.displayName} gin_trgm_ops`),
    check("party_kind_ck", inList("kind", PARTY_KINDS)),
    check("party_user_kind_ck", sql`kind = 'USER' or user_id is null`),
  ],
);

export const partyAlias = pgTable(
  "party_alias",
  {
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    partyId: uuid("party_id")
      .notNull()
      .references(() => party.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.ownerUserId, t.partyId] }),
    index("party_alias_party_idx").on(t.partyId),
    index("party_alias_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export const pair = pgTable(
  "pair",
  {
    id: uuid("id").primaryKey(),

    partyLow: uuid("party_low")
      .notNull()
      .references(() => party.id),
    partyHigh: uuid("party_high")
      .notNull()
      .references(() => party.id),
    mergedInto: uuid("merged_into").references((): AnyPgColumn => pair.id),

    trustLowAt: ts("trust_low_at"),
    trustHighAt: ts("trust_high_at"),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("pair_parties_uq")
      .on(t.partyLow, t.partyHigh)
      .where(sql`merged_into is null`),
    index("pair_low_idx").on(t.partyLow),
    index("pair_high_idx").on(t.partyHigh),
    check("pair_order_ck", sql`party_low < party_high`),
  ],
);

export const userBlock = pgTable(
  "user_block",
  {
    blockerUserId: uuid("blocker_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    blockedPartyId: uuid("blocked_party_id")
      .notNull()
      .references(() => party.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerUserId, t.blockedPartyId] })],
);
